import type { TPrisma } from "@/lib/db/prisma";

export const RosterRepository = (prisma: TPrisma) => ({
  /** Classes with every booking, its child and that child's parent — the raw material of a roster. */
  listClassesWithBookings(classId?: string) {
    return prisma.trialClass.findMany({
      where: classId ? { id: classId } : undefined,
      orderBy: { startsAt: "asc" },
      include: {
        bookings: {
          include: { student: { include: { parent: true } } },
          orderBy: [{ confirmedAt: "asc" }, { createdAt: "asc" }],
        },
      },
    });
  },
});
