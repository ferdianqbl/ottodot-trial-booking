import { apiResponse } from "@/lib/utils/api-response";
import { staffProcedure } from "@/server/trpc";
import { createRosterHandlers } from "./roster.handlers";
import { classIdSchema } from "./roster.schema";

export const RosterService = {
  all: staffProcedure.query(async ({ ctx }) => {
    const data = await createRosterHandlers(ctx.prisma).list();
    return apiResponse(data, "Rosters retrieved successfully", 200);
  }),

  byClass: staffProcedure.input(classIdSchema).query(async ({ ctx, input }) => {
    const data = await createRosterHandlers(ctx.prisma).getByClass(input.classId);
    return apiResponse(data, "Roster retrieved successfully", 200);
  }),
};
