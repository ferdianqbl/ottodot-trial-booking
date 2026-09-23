/**
 * npm run test:multiprocess — the last-seat race across several OS processes, i.e. several server
 * instances with their own database connections. Nothing in-process (locks, mutexes) can help here;
 * only the database decides.
 *
 * Each round: seed (cls_last_seat at 3/4), then WORKERS processes each fire PER_WORKER checkouts +
 * payments for the last seat at the same instant. Asserts exactly one confirmed booking, no errors,
 * no unsettled authorization, and exactly one captured payment.
 */
import { spawn } from "node:child_process";
import { createTempDatabase } from "./temp-database";

const WORKERS = 4;
const PER_WORKER = 5;
const ROUNDS = 3;
const childId = (i: number) => `stu_mp_${i}`;

async function worker(index: number, startAt: number) {
  const { default: prisma } = await import("../src/lib/db/prisma");
  const { createBookingHandlers } = await import("../src/features/booking/server/booking.handlers");
  const { start: startBooking, pay: payForBooking } = createBookingHandlers(prisma);
  while (Date.now() < startAt) await new Promise((r) => setTimeout(r, 1));

  const outcomes = await Promise.all(
    Array.from({ length: PER_WORKER }, async (_, i) => {
      try {
        const studentId = childId(index * PER_WORKER + i);
        const { bookingId } = await startBooking("par_sam", { trialClassId: "cls_last_seat", studentId });
        const booking = await payForBooking("par_sam", { bookingId, cardOutcome: "approve", gatewayDelayMs: Math.floor(Math.random() * 20) });
        return booking.status;
      } catch (error) {
        return `error: ${error instanceof Error ? error.message.split("\n").pop() : String(error)}`;
      }
    })
  );
  process.stdout.write(JSON.stringify(outcomes));
  await prisma.$disconnect();
}

function runWorker(index: number, startAt: number): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const child = spawn("npx", ["tsx", process.argv[1], "worker", String(index), String(startAt)], { env: process.env });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.on("error", reject);
    child.on("close", () => {
      try {
        resolve(JSON.parse(out.slice(out.indexOf("["))));
      } catch {
        reject(new Error(`worker ${index} produced no result: ${out}`));
      }
    });
  });
}

async function main() {
  const cleanup = createTempDatabase("multiprocess"); // workers inherit DATABASE_URL
  const { default: prisma } = await import("../src/lib/db/prisma");
  const { seedDemoData } = await import("../src/features/demo/server/demo.seed");
  let failed = false;

  try {
    for (let round = 1; round <= ROUNDS; round++) {
      await seedDemoData(prisma);
      await prisma.student.createMany({
        data: Array.from({ length: WORKERS * PER_WORKER }, (_, i) => ({ id: childId(i), parentId: "par_sam", name: `Child ${i}`, age: 8 })),
      });

      const startAt = Date.now() + 3000; // let every process boot, then fire together
      const outcomes = (await Promise.all(Array.from({ length: WORKERS }, (_, w) => runWorker(w, startAt)))).flat();

      const [confirmed, counter, captured, unsettled] = await Promise.all([
        prisma.booking.count({ where: { trialClassId: "cls_last_seat", status: "confirmed" } }),
        prisma.trialClass.findUniqueOrThrow({ where: { id: "cls_last_seat" } }).then((c) => c.confirmedCount),
        prisma.paymentAttempt.count({ where: { status: "captured", booking: { studentId: { startsWith: "stu_mp_" } } } }),
        prisma.paymentAttempt.count({ where: { status: "authorized" } }),
      ]);

      const tally = outcomes.reduce<Record<string, number>>((acc, o) => ({ ...acc, [o]: (acc[o] ?? 0) + 1 }), {});
      const ok =
        tally.confirmed === 1 &&
        !outcomes.some((o) => o.startsWith("error")) &&
        confirmed === 4 &&
        counter === 4 &&
        captured === 1 &&
        unsettled === 0;
      failed ||= !ok;
      console.log(
        `round ${round}: ${ok ? "PASS" : "FAIL"}  ${JSON.stringify(tally)}  roster=${confirmed}/4 counter=${counter} captured=${captured} unsettled=${unsettled}`
      );
    }
  } finally {
    await prisma.$disconnect();
    cleanup();
  }
  process.exit(failed ? 1 : 0);
}

if (process.argv[2] === "worker") await worker(Number(process.argv[3]), Number(process.argv[4]));
else await main();
