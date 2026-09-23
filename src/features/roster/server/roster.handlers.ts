import type { TPrismaClient } from "@/lib/db/prisma";
import { DomainError } from "@/server/errors";
import { RosterRepository } from "./roster.repository";

/**
 * Class rosters for teachers/ops. The roster is exactly the `confirmed` bookings;
 * everything else (pending, payment_failed, cancelled) is listed separately as "not on roster"
 * so staff can see why a child is missing.
 */
export const createRosterHandlers = (prisma: TPrismaClient) => {
  const rosterRepo = RosterRepository(prisma);

  const list = async (classId?: string) => {
    const classes = await rosterRepo.listClassesWithBookings(classId);

    return classes.map((c) => {
      const confirmed = c.bookings.filter((b) => b.status === "confirmed");
      return {
        id: c.id,
        subject: c.subject,
        title: c.title,
        startsAt: c.startsAt,
        capacity: c.capacity,
        /** The seat counter used by the seat claim; must always equal roster.length. */
        seatCounter: c.confirmedCount,
        roster: confirmed.map((b) => ({
          bookingId: b.id,
          studentName: b.student.name,
          studentAge: b.student.age,
          parentName: b.student.parent.name,
          parentEmail: b.student.parent.email,
          confirmedAt: b.confirmedAt,
        })),
        notOnRoster: c.bookings
          .filter((b) => b.status !== "confirmed")
          .map((b) => ({
            bookingId: b.id,
            studentName: b.student.name,
            status: b.status,
            statusReason: b.statusReason,
            createdAt: b.createdAt,
          })),
      };
    });
  };

  return {
    list,

    async getByClass(classId: string) {
      const [roster] = await list(classId);
      if (!roster) throw new DomainError("NOT_FOUND", "Trial class not found.");
      return roster;
    },
  };
};

export type TRosterHandlers = ReturnType<typeof createRosterHandlers>;
