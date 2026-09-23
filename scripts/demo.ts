/**
 * npm run demo — walks through every scenario the brief asks about, against a fresh throwaway
 * database (dev.db is not touched), and checks the invariants at the end.
 */
import { createTempDatabase } from "./temp-database";

const cleanup = createTempDatabase("demo");
const { default: prisma } = await import("../src/lib/db/prisma");
const { seedDemoData } = await import("../src/features/demo/server/demo.seed");
const { createBookingHandlers } = await import("../src/features/booking/server/booking.handlers");
const { start: startBooking, pay: payForBooking } = createBookingHandlers(prisma);
const { DomainError } = await import("../src/server/errors");

type Booking = Awaited<ReturnType<typeof payForBooking>>;

const line = (label: string, value: string) => console.log(`   ${label.padEnd(44, ".")} ${value}`);
const heading = (text: string) => console.log(`\n${text}`);
const seats = async (classId: string) => {
  const c = await prisma.trialClass.findUniqueOrThrow({ where: { id: classId } });
  return `${c.confirmedCount}/${c.capacity}`;
};
const roster = async (classId: string) =>
  (await prisma.booking.findMany({ where: { trialClassId: classId, status: "confirmed" }, include: { student: true } }))
    .map((b) => b.student.name.split(" ")[0])
    .join(", ");
const describe = (b: Booking) =>
  [b.status, b.statusReason && `"${b.statusReason}"`, b.payments.map((p) => `payment ${p.status}`).join(", ") || "card never touched"]
    .filter(Boolean)
    .join(" · ");

async function attempt(fn: () => Promise<unknown>) {
  try {
    await fn();
    return "accepted";
  } catch (error) {
    if (error instanceof DomainError) return `rejected: ${error.code} — ${error.message}`;
    throw error;
  }
}

try {
  await seedDemoData(prisma);
  console.log("Ottodot trial booking demo (fresh temporary database)");

  heading(`1. Class with available seats — Tom books Zara into Kitchen Chemistry (${await seats("cls_open")})`);
  const zara = await startBooking("par_tom", { trialClassId: "cls_open", studentId: "stu_zara" });
  line("move to payment", "pending_payment (no seat held)");
  line("pay", describe(await payForBooking("par_tom", { bookingId: zara.bookingId, cardOutcome: "approve" })));
  line("seats", await seats("cls_open"));

  heading("2. Duplicate — Priya books Arjun into Fractions with Pizza again");
  line("move to payment", await attempt(() => startBooking("par_priya", { trialClassId: "cls_last_seat", studentId: "stu_arjun" })));

  heading("3. Payment failure — Nadia books Omar into Kitchen Chemistry, card declined");
  const omar = await startBooking("par_nadia", { trialClassId: "cls_open", studentId: "stu_omar" });
  line("pay (card_declined)", describe(await payForBooking("par_nadia", { bookingId: omar.bookingId, cardOutcome: "card_declined" })));
  line("seats / roster", `${await seats("cls_open")} · ${await roster("cls_open")} (no Omar)`);
  const retry = await startBooking("par_nadia", { trialClassId: "cls_open", studentId: "stu_omar" });
  line("retry with a good card (new booking)", describe(await payForBooking("par_nadia", { bookingId: retry.bookingId, cardOutcome: "approve" })));

  heading(`4. Last-seat race, the brief's sequence — Fractions with Pizza (${await seats("cls_last_seat")})`);
  const a = await startBooking("par_nadia", { trialClassId: "cls_last_seat", studentId: "stu_aisha" });
  line("A (Nadia → Aisha) moves to payment", "pending_payment");
  const b = await startBooking("par_lena", { trialClassId: "cls_last_seat", studentId: "stu_emil" });
  line("B (Lena → Emil) moves to payment", "pending_payment");
  line("B pays first", describe(await payForBooking("par_lena", { bookingId: b.bookingId, cardOutcome: "approve" })));
  line("A then pays", describe(await payForBooking("par_nadia", { bookingId: a.bookingId, cardOutcome: "approve" })));
  line("roster", `${await seats("cls_last_seat")} · ${await roster("cls_last_seat")}`);

  heading("5. Both parents press Pay at the same moment (fresh data, A's gateway is slower)");
  await seedDemoData(prisma);
  const a2 = await startBooking("par_nadia", { trialClassId: "cls_last_seat", studentId: "stu_aisha" });
  const b2 = await startBooking("par_lena", { trialClassId: "cls_last_seat", studentId: "stu_emil" });
  const [aPaid, bPaid] = await Promise.all([
    payForBooking("par_nadia", { bookingId: a2.bookingId, cardOutcome: "approve", gatewayDelayMs: 200 }),
    payForBooking("par_lena", { bookingId: b2.bookingId, cardOutcome: "approve" }),
  ]);
  line("B", describe(bPaid));
  line("A", describe(aPaid));
  line("roster", `${await seats("cls_last_seat")} · ${await roster("cls_last_seat")}`);

  heading("Invariants");
  const classes = await prisma.trialClass.findMany({ include: { bookings: { include: { payments: true } } } });
  const ok = classes.every((c) => {
    const confirmed = c.bookings.filter((bk) => bk.status === "confirmed");
    const chargedOnce = c.bookings.every(
      (bk) => bk.payments.filter((p) => p.status === "captured").length === (bk.status === "confirmed" ? 1 : 0)
    );
    return confirmed.length <= c.capacity && c.confirmedCount === confirmed.length && chargedOnce;
  });
  line("capacity · seat counter · charged once", ok ? "all hold" : "VIOLATED");
  process.exitCode = ok ? 0 : 1;
} finally {
  await prisma.$disconnect();
  cleanup();
}
