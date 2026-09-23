import { expect } from "vitest";
import prisma from "@/lib/db/prisma";
import { seedDemoData } from "@/features/demo/server/demo.seed";
import { gatewayLog } from "@/features/payment/server/payment.gateway";
import { parseDemoUser } from "@/server/context";
import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";

export async function resetDemoData() {
  await seedDemoData(prisma);
  gatewayLog.length = 0;
}

/** Call the tRPC API in-process as a parent id, "staff", or nobody (null). */
export const callerAs = (who: string | null) => createCallerFactory(appRouter)({ user: parseDemoUser(who), prisma });

export const paymentsFor = (bookingId: string) =>
  prisma.paymentAttempt.findMany({ where: { bookingId }, orderBy: { createdAt: "asc" } });

export const rosterIds = async (classId: string) =>
  (await prisma.booking.findMany({ where: { trialClassId: classId, status: "confirmed" } })).map((b) => b.studentId);

/** What reached the mock "bank" for one authorization. */
export const gatewayCallsFor = (authorizationId: string | null | undefined) =>
  gatewayLog.filter((e) => e.authorizationId === authorizationId).map((e) => e.type);

/** Invariants that must hold after every scenario, whatever the timing. */
export async function expectInvariants() {
  const classes = await prisma.trialClass.findMany({ include: { bookings: { include: { payments: true } } } });
  for (const c of classes) {
    const confirmed = c.bookings.filter((b) => b.status === "confirmed");
    expect(confirmed.length, `${c.id}: confirmed within capacity`).toBeLessThanOrEqual(c.capacity);
    expect(c.confirmedCount, `${c.id}: seat counter matches the roster`).toBe(confirmed.length);

    const active = c.bookings.filter((b) => b.status === "pending_payment" || b.status === "confirmed");
    const children = active.map((b) => b.studentId);
    expect(new Set(children).size, `${c.id}: one active booking per child`).toBe(children.length);

    for (const b of c.bookings) {
      const captured = b.payments.filter((p) => p.status === "captured").length;
      expect(captured, `${b.id}: charged once if confirmed, never otherwise`).toBe(b.status === "confirmed" ? 1 : 0);
      expect(b.payments.some((p) => p.status === "authorized"), `${b.id}: no authorization left unsettled`).toBe(false);
    }
  }
}
