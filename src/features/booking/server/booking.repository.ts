import type { BookingStatus, PaymentStatus } from "@/generated/prisma/enums";
import type { TPrisma } from "@/lib/db/prisma";

const ACTIVE_STATUSES: BookingStatus[] = ["pending_payment", "confirmed"];

/**
 * Every database statement the booking slice makes. The factory takes the client so the same
 * methods work on the root client and inside `writeTransaction` (a transaction client).
 */
export const BookingRepository = (prisma: TPrisma) => ({
  listUpcomingClasses(now: Date) {
    return prisma.trialClass.findMany({ where: { startsAt: { gt: now } }, orderBy: { startsAt: "asc" } });
  },

  findClassById(trialClassId: string) {
    return prisma.trialClass.findUnique({ where: { id: trialClassId } });
  },

  findStudentById(studentId: string) {
    return prisma.student.findUnique({ where: { id: studentId } });
  },

  listChildren(parentId: string) {
    return prisma.student.findMany({ where: { parentId }, orderBy: { name: "asc" } });
  },

  listParentBookings(parentId: string) {
    return prisma.booking.findMany({
      where: { student: { parentId } },
      include: { trialClass: true, student: true },
      orderBy: { createdAt: "desc" },
    });
  },

  findBookingWithClass(bookingId: string) {
    return prisma.booking.findUnique({ where: { id: bookingId }, include: { trialClass: true, student: true } });
  },

  findBookingDetail(bookingId: string) {
    return prisma.booking.findUnique({
      where: { id: bookingId },
      include: { trialClass: true, student: true, payments: { orderBy: { createdAt: "asc" } } },
    });
  },

  /** Not findUnique: the (class, child) index is partial, so only one ACTIVE row is unique. */
  findActiveBooking(trialClassId: string, studentId: string) {
    return prisma.booking.findFirst({ where: { trialClassId, studentId, status: { in: ACTIVE_STATUSES } } });
  },

  createBooking(trialClassId: string, studentId: string) {
    return prisma.booking.create({ data: { trialClassId, studentId } });
  },

  /** Compare-and-set on a checkout still in progress; returns how many rows it moved (0 or 1). */
  async finishPendingBooking(bookingId: string, status: BookingStatus, statusReason: string | null, confirmedAt?: Date) {
    const { count } = await prisma.booking.updateMany({
      where: { id: bookingId, status: "pending_payment" },
      data: { status, statusReason, ...(confirmedAt ? { confirmedAt } : {}) },
    });
    return count;
  },

  createPaymentAttempt(data: {
    bookingId: string;
    status: PaymentStatus;
    amountCents: number;
    currency: string;
    providerRef?: string;
    declineReason?: string;
  }) {
    return prisma.paymentAttempt.create({ data });
  },

  settlePaymentAttempt(attemptId: string, status: PaymentStatus) {
    return prisma.paymentAttempt.update({ where: { id: attemptId }, data: { status } });
  },

  /**
   * The seat claim. One conditional UPDATE decides the last seat:
   *   UPDATE TrialClass SET confirmedCount = confirmedCount + 1 WHERE id = ? AND confirmedCount < capacity
   * Returns 1 for the winner and 0 for everyone else.
   */
  async claimSeat(trialClassId: string) {
    const { count } = await prisma.trialClass.updateMany({
      where: { id: trialClassId, confirmedCount: { lt: prisma.trialClass.fields.capacity } },
      data: { confirmedCount: { increment: 1 } },
    });
    return count;
  },

  releaseSeat(trialClassId: string) {
    return prisma.trialClass.update({ where: { id: trialClassId }, data: { confirmedCount: { decrement: 1 } } });
  },
});
