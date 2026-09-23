import { router } from "@/server/trpc";
import { BookingService } from "./booking.service";

export const bookingRouter = router({
  ...BookingService,
});
