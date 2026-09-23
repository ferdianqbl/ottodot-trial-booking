import { apiResponse } from "@/lib/utils/api-response";
import { publicProcedure } from "@/server/trpc";
import { createDemoHandlers } from "./demo.handlers";

export const DemoService = {
  /** Who you can act as in the demo (stands in for sign-in). */
  personas: publicProcedure.query(async ({ ctx }) => {
    const data = await createDemoHandlers(ctx.prisma).listPersonas();
    return apiResponse(data, "Personas retrieved successfully", 200);
  }),

  reset: publicProcedure.mutation(async ({ ctx }) => {
    const data = await createDemoHandlers(ctx.prisma).reset();
    return apiResponse(data, "Demo data reset successfully", 200);
  }),
};
