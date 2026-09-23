import { z } from "zod";

export const TRIAL_FEE_CENTS = 2500;
export const CURRENCY = "USD";
export const CLASS_FULL_REASON = "The class filled up before your payment completed";

export const cardOutcomeSchema = z.enum(["approve", "card_declined", "insufficient_funds"]);
export type TCardOutcome = z.infer<typeof cardOutcomeSchema>;

/** Step 1: choose a child and a class, move to payment. */
export const startBookingSchema = z.object({
  trialClassId: z.string().min(1),
  studentId: z.string().min(1),
});
export type TStartBookingInput = z.infer<typeof startBookingSchema>;

/** Step 2: pay for a pending booking with a mock card. */
export const payBookingSchema = z.object({
  bookingId: z.string().min(1),
  cardOutcome: cardOutcomeSchema.default("approve"),
  /** Slows the mock gateway down to widen the race window in demos and tests. */
  gatewayDelayMs: z.number().int().min(0).max(5000).default(0),
  /** One key per Pay click. A retry of the same click reuses it, so the card is authorized once. */
  idempotencyKey: z.string().min(8).max(64).optional(),
});
export type TPayBookingInput = z.input<typeof payBookingSchema>;

export const bookingIdSchema = z.object({ bookingId: z.string().min(1) });
export type TBookingIdInput = z.infer<typeof bookingIdSchema>;
