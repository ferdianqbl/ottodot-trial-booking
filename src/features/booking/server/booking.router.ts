import { apiResponse } from "@/lib/utils/api-response";
import { parentProcedure, publicProcedure, router } from "@/server/trpc";
import { bookingIdSchema, payBookingSchema, startBookingSchema } from "./booking.schema";
import { createBookingService } from "./booking.service";

/** Transport only: validate the input, pick the procedure type, call the service, wrap the result. */
export const bookingRouter = router({
  /** Upcoming trial classes with live seat counts. */
  classes: publicProcedure.query(async ({ ctx }) => {
    const data = await createBookingService(ctx.prisma).listClasses();
    return apiResponse(data, "Trial classes retrieved successfully", 200);
  }),

  myChildren: parentProcedure.query(async ({ ctx }) => {
    const data = await createBookingService(ctx.prisma).listChildren(ctx.parentId);
    return apiResponse(data, "Children retrieved successfully", 200);
  }),

  myBookings: parentProcedure.query(async ({ ctx }) => {
    const data = await createBookingService(ctx.prisma).listBookings(ctx.parentId);
    return apiResponse(data, "Bookings retrieved successfully", 200);
  }),

  byId: parentProcedure.input(bookingIdSchema).query(async ({ ctx, input }) => {
    const data = await createBookingService(ctx.prisma).getBooking(ctx.parentId, input.bookingId);
    return apiResponse(data, "Booking retrieved successfully", 200);
  }),

  /** Step 1: create (or resume) a pending_payment booking. Holds no seat. */
  start: parentProcedure.input(startBookingSchema).mutation(async ({ ctx, input }) => {
    const data = await createBookingService(ctx.prisma).start(ctx.parentId, input);
    return apiResponse(
      data,
      data.resumed ? "Checkout already in progress" : "Checkout started successfully",
      data.resumed ? 200 : 201
    );
  }),

  /** Step 2: authorize, claim a seat atomically, then capture or void. Returns the booking with its final status. */
  pay: parentProcedure.input(payBookingSchema).mutation(async ({ ctx, input }) => {
    const data = await createBookingService(ctx.prisma).pay(ctx.parentId, input);
    return apiResponse(data, `Payment processed: booking ${data.status}`, 200);
  }),
});
