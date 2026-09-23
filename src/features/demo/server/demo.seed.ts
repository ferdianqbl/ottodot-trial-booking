import type { BookingStatus } from "@/generated/prisma/enums";
import type { PrismaClient } from "@/generated/prisma/client";
import { CURRENCY, TRIAL_FEE_CENTS } from "@/features/booking/server/booking.schema";

/**
 * The demo dataset, used by `npm run setup`, the "Reset demo data" button, the tests and the scripts.
 *
 * Covers the cases the brief asks for:
 * - cls_open:      available seats (1/4), plus Aisha's declined payment (not on the roster)
 * - cls_last_seat: exactly 3/4 confirmed — the last-seat race
 * - cls_last_seat: Arjun is already confirmed, so booking him again is the duplicate attempt
 * - cls_full:      4/4 confirmed
 * - cls_puzzle:    0/4, a clean class
 */

export const DEMO = {
  parents: [
    { id: "par_nadia", name: "Nadia Rahman", email: "nadia@example.com" },
    { id: "par_ben", name: "Ben Carter", email: "ben@example.com" },
    { id: "par_priya", name: "Priya Shah", email: "priya@example.com" },
    { id: "par_tom", name: "Tom Okafor", email: "tom@example.com" },
    { id: "par_lena", name: "Lena Fischer", email: "lena@example.com" },
    { id: "par_sam", name: "Sam Lee", email: "sam@example.com" },
  ],
  students: [
    { id: "stu_aisha", parentId: "par_nadia", name: "Aisha Rahman", age: 8 },
    { id: "stu_omar", parentId: "par_nadia", name: "Omar Rahman", age: 6 },
    { id: "stu_mia", parentId: "par_ben", name: "Mia Carter", age: 9 },
    { id: "stu_arjun", parentId: "par_priya", name: "Arjun Shah", age: 7 },
    { id: "stu_zara", parentId: "par_tom", name: "Zara Okafor", age: 10 },
    { id: "stu_noah", parentId: "par_lena", name: "Noah Fischer", age: 8 },
    { id: "stu_emil", parentId: "par_lena", name: "Emil Fischer", age: 11 },
    { id: "stu_kai", parentId: "par_sam", name: "Kai Lee", age: 9 },
  ],
  classes: [
    { id: "cls_open", subject: "Science", title: "Kitchen Chemistry", inDays: 3, utcHour: 9 },
    { id: "cls_last_seat", subject: "Math", title: "Fractions with Pizza", inDays: 3, utcHour: 13 },
    { id: "cls_full", subject: "Science", title: "Build a Paper Rocket", inDays: 4, utcHour: 10 },
    { id: "cls_puzzle", subject: "Math", title: "Puzzle Lab: Logic Grids", inDays: 5, utcHour: 15 },
  ],
  bookings: [
    { id: "bkg_open_mia", classId: "cls_open", studentId: "stu_mia", status: "confirmed" },
    { id: "bkg_open_aisha", classId: "cls_open", studentId: "stu_aisha", status: "payment_failed" },
    { id: "bkg_last_arjun", classId: "cls_last_seat", studentId: "stu_arjun", status: "confirmed" },
    { id: "bkg_last_zara", classId: "cls_last_seat", studentId: "stu_zara", status: "confirmed" },
    { id: "bkg_last_noah", classId: "cls_last_seat", studentId: "stu_noah", status: "confirmed" },
    { id: "bkg_full_mia", classId: "cls_full", studentId: "stu_mia", status: "confirmed" },
    { id: "bkg_full_arjun", classId: "cls_full", studentId: "stu_arjun", status: "confirmed" },
    { id: "bkg_full_zara", classId: "cls_full", studentId: "stu_zara", status: "confirmed" },
    { id: "bkg_full_kai", classId: "cls_full", studentId: "stu_kai", status: "confirmed" },
  ] satisfies { id: string; classId: string; studentId: string; status: BookingStatus }[],
};

const DECLINED = "Card declined by the issuing bank";

function daysFromNow(days: number, utcHour: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(utcHour, 0, 0, 0);
  return d;
}

export async function seedDemoData(prisma: PrismaClient) {
  const confirmedAt = daysFromNow(-1, 8);
  const confirmedIn = (classId: string) =>
    DEMO.bookings.filter((b) => b.classId === classId && b.status === "confirmed").length;

  await prisma.$transaction([
    prisma.paymentAttempt.deleteMany(),
    prisma.booking.deleteMany(),
    prisma.student.deleteMany(),
    prisma.parent.deleteMany(),
    prisma.trialClass.deleteMany(),

    prisma.parent.createMany({ data: DEMO.parents }),
    prisma.student.createMany({ data: DEMO.students }),
    prisma.trialClass.createMany({
      data: DEMO.classes.map((c) => ({
        id: c.id,
        subject: c.subject,
        title: c.title,
        startsAt: daysFromNow(c.inDays, c.utcHour),
        capacity: 4,
        confirmedCount: confirmedIn(c.id),
      })),
    }),
    prisma.booking.createMany({
      data: DEMO.bookings.map((b) => ({
        id: b.id,
        trialClassId: b.classId,
        studentId: b.studentId,
        status: b.status,
        statusReason: b.status === "payment_failed" ? DECLINED : null,
        confirmedAt: b.status === "confirmed" ? confirmedAt : null,
      })),
    }),
    prisma.paymentAttempt.createMany({
      data: DEMO.bookings.map((b) => ({
        id: `pay_${b.id}`,
        bookingId: b.id,
        status: b.status === "confirmed" ? ("captured" as const) : ("declined" as const),
        amountCents: TRIAL_FEE_CENTS,
        currency: CURRENCY,
        providerRef: b.status === "confirmed" ? `auth_seed_${b.id}` : null,
        declineReason: b.status === "confirmed" ? null : DECLINED,
      })),
    }),
  ]);
}
