import { beforeEach, describe, expect, it } from "vitest";
import prisma from "@/lib/db/prisma";
import { resetDemoData } from "@/test/helpers";

/**
 * The invariants hold in the database itself, not only in application code.
 * These writes deliberately bypass booking.handlers.ts.
 */
describe("database constraints", () => {
  beforeEach(resetDemoData);

  it("a class can never record more confirmed students than its capacity", async () => {
    await expect(
      prisma.trialClass.update({ where: { id: "cls_full" }, data: { confirmedCount: 5 } })
    ).rejects.toThrow(/CHECK constraint failed/);
  });

  it("a child can have only one active booking per class", async () => {
    // Arjun is already confirmed in cls_last_seat.
    await expect(
      prisma.booking.create({ data: { trialClassId: "cls_last_seat", studentId: "stu_arjun" } })
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("finished bookings do not block a new one (the unique index is partial)", async () => {
    // Aisha's booking in cls_open is payment_failed.
    const retry = await prisma.booking.create({ data: { trialClassId: "cls_open", studentId: "stu_aisha" } });
    expect(retry.status).toBe("pending_payment");
  });

  it("a booking is confirmed exactly when it has a confirmedAt", async () => {
    const pending = await prisma.booking.create({ data: { trialClassId: "cls_puzzle", studentId: "stu_omar" } });
    await expect(
      prisma.booking.update({ where: { id: pending.id }, data: { status: "confirmed" } })
    ).rejects.toThrow(/CHECK constraint failed/);
  });
});
