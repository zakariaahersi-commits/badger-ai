import test from "node:test";
import assert from "node:assert/strict";

import { authoritativeCheckoutEvent, normalizeCheckoutAttribution } from "../lib/checkout-attribution.ts";

test("checkout attribution accepts only bounded first-touch fields", () => {
  assert.deepEqual(normalizeCheckoutAttribution({
    utm_source: "newsletter",
    utm_campaign: "relaunch",
    standalone: true,
    email: "must-not-leak@example.com",
    extra: "ignored",
  }), { utm_source: "newsletter", utm_campaign: "relaunch", standalone: "true" });
});

test("the Stripe receipt becomes an authoritative attributed purchase event", () => {
  const event = authoritativeCheckoutEvent({
    id: "cs_test_1",
    client_reference_id: "user-a",
    amount_total: 4900,
    currency: "usd",
    payment_intent: "pi_1",
    metadata: { product: "badger-28-day", user_id: "user-a", utm_source: "instagram", utm_campaign: "badger-20260824-social" },
  });
  assert.deepEqual(event, {
    userId: "user-a",
    path: "/app",
    properties: {
      product_id: "badger-28-day",
      revenue: 49,
      currency: "USD",
      transaction_id: "pi_1",
      purchase_model: "one_time",
      source: "stripe_webhook",
      utm_source: "instagram",
      utm_campaign: "badger-20260824-social",
    },
  });
});
