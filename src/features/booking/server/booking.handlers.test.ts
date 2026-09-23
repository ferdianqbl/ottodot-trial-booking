import { afterEach, beforeEach, describe, expect, it } from "vitest";
import prisma from "@/lib/db/prisma";
import { gatewayLog } from "@/features/payment/server/payment.gateway";
import { createRosterHandlers } from "@/features/roster/server/roster.handlers";
import { expectInvariants, paymentsFor, resetDemoData, rosterIds } from "@/test/helpers";
import { createBookingHandlers } from "./booking.handlers";

const { getBooking, start: startBooking, pay: payForBooking } = createBookingHandlers(prisma);
const listRosters = (classId?: string) => createRosterHandlers(prisma).list(classId);

describe("seed data", () => {
  beforeEach(resetDemoData);

  it("covers the cases the brief asks for", async () => {
    const [open, lastSeat, full] = await Promise.all(
      ["cls_open", "cls_last_seat", "cls_full"].map((id) => prisma.trialClass.findUniqueOrThrow({ where: { id } }))
    );
    expect(open.confirmedCount).toBeLessThan(open.capacity); // available seats
    expect(lastSeat.confirmedCount).toBe(3); // exactly 3 confirmed
    expect(full.confirmedCount).toBe(4);
    expect(await rosterIds("cls_last_seat")).toContain("stu_arjun"); // duplicate candidate

    const failed = await prisma.booking.findUniqueOrThrow({ where: { id: "bkg_open_aisha" } });
    expect(failed.status).toBe("payment_failed"); // payment failure case…
    expect(await rosterIds("cls_open")).not.toContain("stu_aisha"); // …not on the roster
    await expectInvariants();
  });
});

describe("booking lifecycle", () => {
  beforeEach(resetDemoData);
  afterEach(expectInvariants);

  it("happy path: checkout is pending and holds no seat; payment confirms and captures", async () => {
    const { bookingId, resumed } = await startBooking("par_tom", { trialClassId: "cls_open", studentId: "stu_zara" });
    expect(resumed).toBe(false);

    const pending = await getBooking("par_tom", bookingId);
    expect(pending.status).toBe("pending_payment");
    expect(pending.trialClass.confirmedCount).toBe(1); // no seat taken yet
    expect(await rosterIds("cls_open")).not.toContain("stu_zara");

    const paid = await payForBooking("par_tom", { bookingId, cardOutcome: "approve" });
    expect(paid.status).toBe("confirmed");
    expect(paid.confirmedAt).toBeInstanceOf(Date);
    expect(paid.trialClass.confirmedCount).toBe(2);
    expect(paid.payments.map((p) => p.status)).toEqual(["captured"]);
    expect(await rosterIds("cls_open")).toContain("stu_zara");
  });

  it("duplicate: a child already confirmed in the class is rejected and nothing is written", async () => {
    const before = await prisma.booking.count();
    await expect(
      startBooking("par_priya", { trialClassId: "cls_last_seat", studentId: "stu_arjun" })
    ).rejects.toMatchObject({ code: "DUPLICATE_BOOKING" });
    expect(await prisma.booking.count()).toBe(before);
  });

  it("starting again while a checkout is pending resumes the same booking", async () => {
    const first = await startBooking("par_nadia", { trialClassId: "cls_puzzle", studentId: "stu_omar" });
    const again = await startBooking("par_nadia", { trialClassId: "cls_puzzle", studentId: "stu_omar" });
    expect(again).toEqual({ bookingId: first.bookingId, resumed: true });
  });

  it("concurrent checkouts for the same child produce one booking (partial unique index)", async () => {
    const input = { trialClassId: "cls_puzzle", studentId: "stu_omar" };
    const results = await Promise.all(Array.from({ length: 5 }, () => startBooking("par_nadia", input)));
    expect(new Set(results.map((r) => r.bookingId)).size).toBe(1);
    expect(await prisma.booking.count({ where: { trialClassId: "cls_puzzle" } })).toBe(1);
  });

  it("declined card: booking is payment_failed, the attempt is recorded, no seat is used", async () => {
    const { bookingId } = await startBooking("par_nadia", { trialClassId: "cls_open", studentId: "stu_omar" });
    const result = await payForBooking("par_nadia", { bookingId, cardOutcome: "card_declined" });

    expect(result.status).toBe("payment_failed");
    expect(result.statusReason).toMatch(/declined/i);
    expect(result.payments).toMatchObject([{ status: "declined", providerRef: null }]);
    expect(result.trialClass.confirmedCount).toBe(1);
    expect(await rosterIds("cls_open")).not.toContain("stu_omar");
  });

  it("retrying after a decline is a new booking; the failed one stays as history", async () => {
    // Aisha's seeded booking in cls_open was declined.
    const retry = await startBooking("par_nadia", { trialClassId: "cls_open", studentId: "stu_aisha" });
    expect(retry.bookingId).not.toBe("bkg_open_aisha");

    const paid = await payForBooking("par_nadia", { bookingId: retry.bookingId, cardOutcome: "approve" });
    expect(paid.status).toBe("confirmed");
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: "bkg_open_aisha" } })).status).toBe("payment_failed");
  });

  it("a finished checkout cannot be paid; the card is not touched", async () => {
    await expect(
      payForBooking("par_nadia", { bookingId: "bkg_open_aisha", cardOutcome: "approve" })
    ).rejects.toMatchObject({ code: "NOT_PAYABLE" });
    expect(gatewayLog).toHaveLength(0);
  });

  it("paying an already-confirmed booking returns it without a second charge", async () => {
    const result = await payForBooking("par_ben", { bookingId: "bkg_open_mia", cardOutcome: "approve" });
    expect(result.status).toBe("confirmed");
    expect(await paymentsFor("bkg_open_mia")).toHaveLength(1);
    expect(gatewayLog).toHaveLength(0);
  });

  it("full class: rejected at checkout, nothing written", async () => {
    const before = await prisma.booking.count();
    await expect(
      startBooking("par_nadia", { trialClassId: "cls_full", studentId: "stu_omar" })
    ).rejects.toMatchObject({ code: "CLASS_FULL" });
    expect(await prisma.booking.count()).toBe(before);
  });

  it("a class that has already started cannot be booked", async () => {
    const afterStart = new Date(Date.now() + 30 * 24 * 3600 * 1000);
    await expect(
      startBooking("par_nadia", { trialClassId: "cls_puzzle", studentId: "stu_omar" }, afterStart)
    ).rejects.toMatchObject({ code: "CLASS_STARTED" });
  });

  it("ownership: parents can only book for, pay for and see their own children", async () => {
    await expect(
      startBooking("par_ben", { trialClassId: "cls_open", studentId: "stu_omar" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const { bookingId } = await startBooking("par_nadia", { trialClassId: "cls_open", studentId: "stu_omar" });
    await expect(payForBooking("par_ben", { bookingId, cardOutcome: "approve" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(getBooking("par_ben", bookingId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(gatewayLog).toHaveLength(0);
  });

  it("roster: only confirmed bookings; pending, failed and cancelled are listed separately", async () => {
    await startBooking("par_nadia", { trialClassId: "cls_open", studentId: "stu_omar" }); // stays pending
    const [open] = await listRosters("cls_open");

    expect(open.roster.map((r) => r.studentName)).toEqual(["Mia Carter"]);
    expect(open.seatCounter).toBe(open.roster.length);
    expect(open.notOnRoster.map((b) => [b.studentName, b.status])).toEqual(
      expect.arrayContaining([
        ["Aisha Rahman", "payment_failed"],
        ["Omar Rahman", "pending_payment"],
      ])
    );
  });
});
