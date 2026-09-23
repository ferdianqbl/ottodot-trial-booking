import type { TPrismaClient } from "@/lib/db/prisma";
import { DomainError } from "@/server/errors";
import { DemoRepository } from "./demo.repository";
import { seedDemoData } from "./demo.seed";

export const createDemoHandlers = (prisma: TPrismaClient) => {
  const demoRepo = DemoRepository(prisma);

  return {
    listPersonas() {
      return demoRepo.listPersonas();
    },

    /** Restore the seed scenarios. Disabled in production builds. */
    async reset() {
      if (process.env.NODE_ENV === "production") {
        throw new DomainError("FORBIDDEN", "Demo reset is disabled in production.");
      }
      await seedDemoData(prisma);
      return { ok: true };
    },
  };
};

export type TDemoHandlers = ReturnType<typeof createDemoHandlers>;
