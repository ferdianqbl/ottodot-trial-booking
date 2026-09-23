import { randomUUID } from "node:crypto";
import { paymentGateway } from "@/features/payment/server/payment.gateway";
import type { TPrismaClient } from "@/lib/db/prisma";
import { isUniqueViolation, writeTransaction } from "@/lib/db/write-transaction";
import { DomainError } from "@/server/errors";
import { BookingRepository } from "./booking.repository";
import {
  CLASS_FULL_REASON,
  CURRENCY,
  TRIAL_FEE_CENTS,
  payBookingSchema,
  type TPayBookingInput,
  type TStartBookingInput,
} from "./booking.schema";

const seatsLeft = (c: { capacity: number; confirmedCount: number }) => Math.max(0, c.capacity - c.confirmedCount);

export const createBookingService = (prisma: TPrismaClient) => {
  const bookingRepo = BookingRepository(prisma);

  /** A booking with its class, child and payment history — only visible to the child's parent. */
  const getBooking = async (parentId: string, bookingId: string) => {
    const booking = await bookingRepo.findBookingDetail(bookingId);
    if (!booking || booking.student.parentId !== parentId) throw new DomainError("NOT_FOUND", "Booking not found.");
    return { ...booking, trialClass: { ...booking.trialClass, seatsLeft: seatsLeft(booking.trialClass) } };
  };

  return {
    /** Upcoming classes with live seat counts. */
    async listClasses(now = new Date()) {
      const classes = await bookingRepo.listUpcomingClasses(now);
      return classes.map((c) => ({ ...c, seatsLeft: seatsLeft(c) }));
    },

    listChildren(parentId: string) {
      return bookingRepo.listChildren(parentId);
    },

    listBookings(parentId: string) {
      return bookingRepo.listParentBookings(parentId);
    },

    getBooking,

    /**
     * Step 1 — the parent picks a child and a class and moves to payment.
     *
     * Creates a `pending_payment` booking, or returns the one already in progress for this child and
     * class (a double-click or a returning tab resumes the same checkout). It does NOT hold a seat:
     * the seat goes to whoever completes payment first.
     */
    async start(parentId: string, input: TStartBookingInput, now = new Date()) {
      const { trialClassId, studentId } = input;
      const [trialClass, student] = await Promise.all([
        bookingRepo.findClassById(trialClassId),
        bookingRepo.findStudentById(studentId),
      ]);

      if (!trialClass) throw new DomainError("NOT_FOUND", "Trial class not found.");
      if (!student) throw new DomainError("NOT_FOUND", "Child not found.");
      if (student.parentId !== parentId) throw new DomainError("FORBIDDEN", "You can only book for your own children.");
      if (trialClass.startsAt <= now) throw new DomainError("CLASS_STARTED", "This class has already started.");

      const duplicate = () =>
        new DomainError("DUPLICATE_BOOKING", `${student.name} already has a confirmed seat in this class.`);

      const active = await bookingRepo.findActiveBooking(trialClassId, studentId);
      if (active?.status === "confirmed") throw duplicate();
      if (active) return { bookingId: active.id, resumed: true };

      // Fast feedback when the class is visibly full. Not a hold and not the real guard:
      // the atomic seat claim in `pay` decides who gets a seat.
      if (trialClass.confirmedCount >= trialClass.capacity) throw new DomainError("CLASS_FULL", "This class is full.");

      try {
        const booking = await writeTransaction((tx) => BookingRepository(tx).createBooking(trialClassId, studentId));
        return { bookingId: booking.id, resumed: false };
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        // A concurrent request for the same child won the partial unique index: continue with its booking.
        const winner = await bookingRepo.findActiveBooking(trialClassId, studentId);
        if (winner?.status === "pending_payment") return { bookingId: winner.id, resumed: true };
        throw duplicate();
      }
    },

    /**
     * Step 2 — the parent pays for a pending booking.
     *
     * 1. If the class filled up while the parent was on the payment step, cancel without touching the card.
     * 2. Authorize the card OUTSIDE any transaction (no lock held during a network call). No money moves.
     * 3. One short transaction decides the seat with a single conditional update (`claimSeat`). Exactly one
     *    concurrent payer can take the last seat; the database CHECK (confirmedCount <= capacity) backs it up.
     * 4. Capture the winner's authorization; void everyone else's, so a parent who lost the seat is never charged.
     *
     * Declines and lost seats are outcomes, not errors: the booking ends as payment_failed / cancelled.
     */
    async pay(parentId: string, rawInput: TPayBookingInput) {
      const { bookingId, cardOutcome, gatewayDelayMs, idempotencyKey } = payBookingSchema.parse(rawInput);
      // One key per checkout attempt. The client sends one per Pay click, so a network retry of that
      // click reuses the first authorization instead of putting a second hold on the card.
      const paymentKey = idempotencyKey ?? `${bookingId}:${randomUUID()}`;

      const booking = await bookingRepo.findBookingWithClass(bookingId);
      if (!booking || booking.student.parentId !== parentId) throw new DomainError("NOT_FOUND", "Booking not found.");
      if (booking.status === "confirmed") return getBooking(parentId, bookingId); // already paid: no second charge
      if (booking.status !== "pending_payment") {
        throw new DomainError(
          "NOT_PAYABLE",
          `This checkout has ended (${booking.status}). Start a new booking to try again.`
        );
      }
      const { trialClass } = booking;

      // 1. Seat already gone?
      if (trialClass.confirmedCount >= trialClass.capacity) {
        await writeTransaction((tx) =>
          BookingRepository(tx).finishPendingBooking(bookingId, "cancelled", CLASS_FULL_REASON)
        );
        return getBooking(parentId, bookingId);
      }

      // 2. Authorize.
      const auth = await paymentGateway.authorize({
        amountCents: TRIAL_FEE_CENTS,
        currency: CURRENCY,
        outcome: cardOutcome,
        idempotencyKey: paymentKey,
        delayMs: gatewayDelayMs,
      });

      if (!auth.approved) {
        await writeTransaction(async (tx) => {
          const repo = BookingRepository(tx);
          await repo.createPaymentAttempt({
            bookingId,
            status: "declined",
            amountCents: TRIAL_FEE_CENTS,
            currency: CURRENCY,
            idempotencyKey: paymentKey,
            declineReason: auth.declineReason,
          });
          await repo.finishPendingBooking(bookingId, "payment_failed", auth.declineReason);
        });
        return getBooking(parentId, bookingId);
      }

      // 3. Decide the seat.
      const { attemptId, wonSeat } = await writeTransaction(async (tx) => {
        const repo = BookingRepository(tx);
        const attempt = await repo.createPaymentAttempt({
          bookingId,
          status: "authorized",
          amountCents: TRIAL_FEE_CENTS,
          currency: CURRENCY,
          idempotencyKey: paymentKey,
          providerRef: auth.authorizationId,
        });

        const claimed = await repo.claimSeat(trialClass.id);
        if (claimed === 0) {
          await repo.finishPendingBooking(bookingId, "cancelled", CLASS_FULL_REASON);
          return { attemptId: attempt.id, wonSeat: false };
        }

        const confirmed = await repo.finishPendingBooking(bookingId, "confirmed", null, new Date());
        if (confirmed === 0) {
          // Another request for this same booking (a double-click) already finished it: give the seat back.
          await repo.releaseSeat(trialClass.id);
          return { attemptId: attempt.id, wonSeat: false };
        }
        return { attemptId: attempt.id, wonSeat: true };
      });

      // 4. Settle the authorization.
      if (wonSeat) await paymentGateway.capture(auth.authorizationId);
      else await paymentGateway.void(auth.authorizationId);
      await writeTransaction((tx) =>
        BookingRepository(tx).settlePaymentAttempt(attemptId, wonSeat ? "captured" : "voided")
      );

      return getBooking(parentId, bookingId);
    },
  };
};

export type TBookingService = ReturnType<typeof createBookingService>;
