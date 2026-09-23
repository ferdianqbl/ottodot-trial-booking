import { bookingRouter } from "@/features/booking/server/booking.router";
import { demoRouter } from "@/features/demo/server/demo.router";
import { rosterRouter } from "@/features/roster/server/roster.router";
import { router } from "@/server/trpc";

export const appRouter = router({
  booking: bookingRouter,
  roster: rosterRouter,
  demo: demoRouter,
});

export type AppRouter = typeof appRouter;
