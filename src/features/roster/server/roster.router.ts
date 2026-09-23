import { apiResponse } from "@/lib/utils/api-response";
import { router, staffProcedure } from "@/server/trpc";
import { classIdSchema } from "./roster.schema";
import { createRosterService } from "./roster.service";

export const rosterRouter = router({
  all: staffProcedure.query(async ({ ctx }) => {
    const data = await createRosterService(ctx.prisma).list();
    return apiResponse(data, "Rosters retrieved successfully", 200);
  }),

  byClass: staffProcedure.input(classIdSchema).query(async ({ ctx, input }) => {
    const data = await createRosterService(ctx.prisma).getByClass(input.classId);
    return apiResponse(data, "Roster retrieved successfully", 200);
  }),
});
