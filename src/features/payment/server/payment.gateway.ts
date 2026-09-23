/**
 * Mock card gateway with the authorize → capture / void flow real providers use
 * (e.g. Stripe PaymentIntents with manual capture). Authorizing only reserves funds;
 * money moves on capture. A voided authorization is never charged.
 *
 * The caller picks the outcome, so demos and tests are deterministic.
 */
export type TCardOutcome = "approve" | "card_declined" | "insufficient_funds";

export type TAuthorization =
  | { approved: true; authorizationId: string }
  | { approved: false; declineReason: string };

export type TGatewayEvent = { type: "authorize" | "decline" | "capture" | "void"; authorizationId?: string };

const DECLINE_REASONS: Record<Exclude<TCardOutcome, "approve">, string> = {
  card_declined: "Card declined by the issuing bank",
  insufficient_funds: "Insufficient funds",
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
let sequence = 0;

/** In-memory record of calls, so tests can assert what reached the "bank". */
export const gatewayLog: TGatewayEvent[] = [];

export const paymentGateway = {
  async authorize(input: { amountCents: number; currency: string; outcome: TCardOutcome; delayMs?: number }): Promise<TAuthorization> {
    if (input.delayMs) await sleep(input.delayMs);
    if (input.outcome !== "approve") {
      gatewayLog.push({ type: "decline" });
      return { approved: false, declineReason: DECLINE_REASONS[input.outcome] };
    }
    const authorizationId = `auth_${Date.now().toString(36)}_${(++sequence).toString(36)}`;
    gatewayLog.push({ type: "authorize", authorizationId });
    return { approved: true, authorizationId };
  },

  async capture(authorizationId: string): Promise<void> {
    gatewayLog.push({ type: "capture", authorizationId });
  },

  async void(authorizationId: string): Promise<void> {
    gatewayLog.push({ type: "void", authorizationId });
  },
};
