import { beforeEach, describe, expect, it } from "vitest";
import { gatewayLog, paymentGateway, resetGateway } from "./payment.gateway";

const charge = (idempotencyKey: string, outcome: "approve" | "card_declined" = "approve") =>
  paymentGateway.authorize({ amountCents: 2500, currency: "USD", outcome, idempotencyKey });

const authorizeCalls = () => gatewayLog.filter((e) => e.type === "authorize" || e.type === "decline").length;

describe("mock gateway idempotency", () => {
  beforeEach(resetGateway);

  it("a retried request reuses the first authorization instead of holding the card twice", async () => {
    const first = await charge("pay-click-0001");
    const retry = await charge("pay-click-0001");

    expect(retry).toEqual(first);
    expect(authorizeCalls()).toBe(1);
  });

  it("a second, deliberate attempt uses a new key and authorizes again", async () => {
    const first = await charge("pay-click-0001");
    const second = await charge("pay-click-0002");

    expect(first.approved && second.approved && first.authorizationId !== second.authorizationId).toBe(true);
    expect(authorizeCalls()).toBe(2);
  });

  it("a decline is remembered too, so a retry does not re-run the card", async () => {
    const first = await charge("pay-click-0003", "card_declined");
    const retry = await charge("pay-click-0003", "card_declined");

    expect(first.approved).toBe(false);
    expect(retry).toEqual(first);
    expect(authorizeCalls()).toBe(1);
  });
});
