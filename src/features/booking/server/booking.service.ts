import { apiResponse } from "@/lib/utils/api-response";
import { parentProcedure, publicProcedure } from "@/server/trpc";
import { createBookingHandlers } from "./booking.handlers";
import { bookingIdSchema, payBookingSchema, startBookingSchema } from "./booking.schema";

export const BookingService = {
  /** Upcoming trial classes with live seat counts. */
  classes: publicProcedure.query(async ({ ctx }) => {
    const data = await createBookingHandlers(ctx.prisma).listClasses();
    return apiResponse(data, "Trial classes retrieved successfully", 200);
  }),

  myChildren: parentProcedure.query(async ({ ctx }) => {
    const data = await createBookingHandlers(ctx.prisma).listChildren(ctx.parentId);
    return apiResponse(data, "Children retrieved successfully", 200);
  }),

  myBookings: parentProcedure.query(async ({ ctx }) => {
    const data = await createBookingHandlers(ctx.prisma).listBookings(ctx.parentId);
    return apiResponse(data, "Bookings retrieved successfully", 200);
  }),

  byId: parentProcedure.input(bookingIdSchema).query(async ({ ctx, input }) => {
    const data = await createBookingHandlers(ctx.prisma).getBooking(ctx.parentId, input.bookingId);
    return apiResponse(data, "Booking retrieved successfully", 200);
  }),

  /** Step 1: create (or resume) a pending_payment booking. Holds no seat. */
  start: parentProcedure.input(startBookingSchema).mutation(async ({ ctx, input }) => {
    const data = await createBookingHandlers(ctx.prisma).start(ctx.parentId, input);
    return apiResponse(
      data,
      data.resumed ? "Checkout already in progress" : "Checkout started successfully",
      data.resumed ? 200 : 201
    );
  }),

  /** Step 2: authorize, claim a seat atomically, then capture or void. Returns the booking with its final status. */
  pay: parentProcedure.input(payBookingSchema).mutation(async ({ ctx, input }) => {
    const data = await createBookingHandlers(ctx.prisma).pay(ctx.parentId, input);
    return apiResponse(data, `Payment processed: booking ${data.status}`, 200);
  }),
};
