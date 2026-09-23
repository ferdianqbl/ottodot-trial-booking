import type { TPrisma } from "@/lib/db/prisma";

export const DemoRepository = (prisma: TPrisma) => ({
  /** Parents and their children: who you can act as in the demo. */
  listPersonas() {
    return prisma.parent.findMany({
      include: { students: { orderBy: { name: "asc" } } },
      orderBy: { name: "asc" },
    });
  },
});
