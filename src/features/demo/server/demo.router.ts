import { apiResponse } from "@/lib/utils/api-response";
import { publicProcedure, router } from "@/server/trpc";
import { createDemoService } from "./demo.service";

export const demoRouter = router({
  /** Who you can act as in the demo (stands in for sign-in). */
  personas: publicProcedure.query(async ({ ctx }) => {
    const data = await createDemoService(ctx.prisma).listPersonas();
    return apiResponse(data, "Personas retrieved successfully", 200);
  }),

  reset: publicProcedure.mutation(async ({ ctx }) => {
    const data = await createDemoService(ctx.prisma).reset();
    return apiResponse(data, "Demo data reset successfully", 200);
  }),
});
