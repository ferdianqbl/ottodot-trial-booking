import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TContext } from "./context";
import { DOMAIN_TO_TRPC, DomainError } from "./errors";

const t = initTRPC.context<TContext>().create({
  transformer: superjson,
  // The mirror image of apiResponse(): a failure carries the same success / message / code fields,
  // plus `domainCode`, the machine-readable name of the business rule that refused the request.
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      success: false,
      message: error.message,
      code: shape.data.httpStatus || 500,
      data: { ...shape.data, domainCode: error.cause instanceof DomainError ? error.cause.code : null },
    };
  },
});

/** Turns business-rule violations thrown by a service into the right tRPC/HTTP error code. */
const mapDomainErrors = t.middleware(async ({ next }) => {
  const result = await next();
  if (!result.ok && result.error.cause instanceof DomainError) {
    const cause = result.error.cause;
    throw new TRPCError({ code: DOMAIN_TO_TRPC[cause.code], message: cause.message, cause });
  }
  return result;
});

export const router = t.router;
export const createCallerFactory = t.createCallerFactory;

export const publicProcedure = t.procedure.use(mapDomainErrors);

/** Acting as a parent: bookings are only ever made for that parent's own children. */
export const parentProcedure = publicProcedure.use(async ({ ctx, next }) => {
  const parentId = ctx.user?.role === "parent" ? ctx.user.parentId : null;
  const parent = parentId ? await ctx.prisma.parent.findUnique({ where: { id: parentId } }) : null;
  if (!parent) throw new TRPCError({ code: "UNAUTHORIZED", message: "Choose a parent to act as." });
  return next({ ctx: { parentId: parent.id } });
});

/** Teachers / ops: rosters include children's names and parent contact details. */
export const staffProcedure = publicProcedure.use(({ ctx, next }) => {
  if (ctx.user?.role !== "staff") throw new TRPCError({ code: "FORBIDDEN", message: "Rosters are staff-only." });
  return next();
});
