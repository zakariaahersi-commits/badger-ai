import test from "node:test";
import assert from "node:assert/strict";
import { layersEventName, layersEventProperties } from "../lib/layers-events.ts";

test("Layers uses the requested canonical commerce and auth event names", () => {
  assert.equal(layersEventName("account_created"), "sign_up");
  assert.equal(layersEventName("signed_in"), "login");
  assert.equal(layersEventName("checkout_completed"), "purchase_success");
  assert.equal(layersEventName("task_completed"), "task_completed");
});

test("Layers properties preserve verified purchase fields and sanitize unsupported values", () => {
  assert.deepEqual(layersEventProperties({
    product_id: "badger-28-day",
    revenue: 49,
    currency: "USD",
    transaction_id: "pi_123",
    active: true,
    ignored: undefined,
    nested: { source: "stripe" },
  }), {
    product_id: "badger-28-day",
    revenue: 49,
    currency: "USD",
    transaction_id: "pi_123",
    active: true,
    nested: '{"source":"stripe"}',
  });
});
