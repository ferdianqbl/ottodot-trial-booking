import { afterEach, beforeEach, describe, expect, it } from "vitest";
import prisma from "@/lib/db/prisma";
import { CLASS_FULL_REASON } from "./booking.schema";
import { expectInvariants, gatewayCallsFor, paymentsFor, resetDemoData, rosterIds } from "@/test/helpers";
import { createBookingService } from "./booking.service";

const { start: startBooking, pay: payForBooking } = createBookingService(prisma);

// cls_last_seat is seeded with exactly 3 of 4 seats confirmed.
const CLASS = "cls_last_seat";
const USER_A = { parentId: "par_nadia", studentId: "stu_aisha" };
const USER_B = { parentId: "par_lena", studentId: "stu_emil" };

const start = (user: { parentId: string; studentId: string }) =>
  startBooking(user.parentId, { trialClassId: CLASS, studentId: user.studentId });

async function addChildren(count: number) {
  const data = Array.from({ length: count }, (_, i) => ({ id: `stu_extra_${i}`, parentId: "par_sam", name: `Child ${i}`, age: 8 }));
  await prisma.student.createMany({ data });
  return data.map((s) => s.id);
}

describe("the last-seat race (cls_last_seat, 3/4 confirmed)", () => {
  beforeEach(resetDemoData);
  afterEach(expectInvariants);

  it("the brief's sequence: B pays first, then A tries to pay — A is cancelled and the card is never touched", async () => {
    // 1. User A selects the last seat and moves to payment.
    const a = await start(USER_A);
    // 2. User B selects the same seat.
    const b = await start(USER_B);
    // 3. User B completes payment first.
    const bPaid = await payForBooking(USER_B.parentId, { bookingId: b.bookingId, cardOutcome: "approve" });
    expect(bPaid.status).toBe("confirmed");
    expect(bPaid.trialClass.confirmedCount).toBe(4);

    // 4. User A then tries to complete payment.
    const aPaid = await payForBooking(USER_A.parentId, { bookingId: a.bookingId, cardOutcome: "approve" });
    expect(aPaid.status).toBe("cancelled");
    expect(aPaid.statusReason).toBe(CLASS_FULL_REASON);
    expect(aPaid.payments).toHaveLength(0); // no authorization was even attempted

    expect(await rosterIds(CLASS)).toContain(USER_B.studentId);
    expect(await rosterIds(CLASS)).not.toContain(USER_A.studentId);
  });

  it("both pay at the same moment: the first authorization to finish wins; the other is voided, never captured", async () => {
    const a = await start(USER_A);
    const b = await start(USER_B);

    const [aPaid, bPaid] = await Promise.all([
      payForBooking(USER_A.parentId, { bookingId: a.bookingId, cardOutcome: "approve", gatewayDelayMs: 150 }),
      payForBooking(USER_B.parentId, { bookingId: b.bookingId, cardOutcome: "approve", gatewayDelayMs: 0 }),
    ]);

    expect(bPaid.status).toBe("confirmed");
    expect(aPaid.status).toBe("cancelled");

    const [aPayment] = await paymentsFor(a.bookingId);
    expect(aPayment.status).toBe("voided");
    expect(gatewayCallsFor(aPayment.providerRef)).toEqual(["authorize", "void"]); // never captured
    const [bPayment] = await paymentsFor(b.bookingId);
    expect(gatewayCallsFor(bPayment.providerRef)).toEqual(["authorize", "capture"]);
  });

  it("the database decides: 10 payers who all passed the capacity pre-check get exactly one seat", async () => {
    const children = await addChildren(10);
    const checkouts = await Promise.all(children.map((studentId) => startBooking("par_sam", { trialClassId: CLASS, studentId })));

    // Equal gateway delay: every request reads "3 of 4" in its pre-check before any seat is claimed.
    const results = await Promise.all(
      checkouts.map((c) => payForBooking("par_sam", { bookingId: c.bookingId, cardOutcome: "approve", gatewayDelayMs: 50 }))
    );

    expect(results.filter((r) => r.status === "confirmed")).toHaveLength(1);
    expect(results.filter((r) => r.status === "cancelled")).toHaveLength(9);
    const statuses = results.flatMap((r) => r.payments.map((p) => p.status));
    expect(statuses.filter((s) => s === "captured")).toHaveLength(1);
    expect(statuses.filter((s) => s === "voided")).toHaveLength(9);
  });

  it("double-clicking Pay on one booking charges once and takes one seat", async () => {
    const a = await start(USER_A);
    const results = await Promise.all([
      payForBooking(USER_A.parentId, { bookingId: a.bookingId, cardOutcome: "approve", gatewayDelayMs: 20 }),
      payForBooking(USER_A.parentId, { bookingId: a.bookingId, cardOutcome: "approve", gatewayDelayMs: 20 }),
    ]);

    expect(results.map((r) => r.status)).toEqual(["confirmed", "confirmed"]);
    expect((await paymentsFor(a.bookingId)).map((p) => p.status).sort()).toEqual(["captured", "voided"]);
    expect((await prisma.trialClass.findUniqueOrThrow({ where: { id: CLASS } })).confirmedCount).toBe(4);
  });
});
