import test from "node:test";
import assert from "node:assert/strict";

import {
  applyStripeEvent,
  claimStripeEvent,
  markStripeEventProcessed,
} from "../lib/stripe-webhook.ts";

test("a new Stripe event is claimed exactly once", async () => {
  let inserted;
  const service = {
    from(table) {
      assert.equal(table, "stripe_webhook_events");
      return { async insert(value) { inserted = value; return { error: null }; } };
    },
  };
  assert.equal(await claimStripeEvent(service, { id: "evt_1", type: "checkout.session.completed" }), "process");
  assert.equal(inserted.stripe_event_id, "evt_1");
  assert.equal(inserted.status, "processing");
});

test("an already processed event is acknowledged as a duplicate", async () => {
  const service = {
    from() {
      return {
        async insert() { return { error: { code: "23505" } }; },
        select() { return this; },
        eq() { return this; },
        async single() {
          return { data: { status: "processed", attempt_count: 1, updated_at: new Date().toISOString() }, error: null };
        },
      };
    },
  };
  assert.equal(await claimStripeEvent(service, { id: "evt_1", type: "checkout.session.completed" }), "duplicate");
});

test("a webhook is not marked processed when the ledger update fails", async () => {
  const service = {
    from() {
      return {
        update() { return this; },
        async eq() { return { error: { code: "db_down" } }; },
      };
    },
  };
  await assert.rejects(() => markStripeEventProcessed(service, "evt_1"), /stripe_event_complete/);
});

test("a checkout database failure is surfaced so Stripe can retry", async () => {
  const event = {
    id: "evt_checkout",
    type: "checkout.session.completed",
    data: { object: {
      id: "cs_badger",
      mode: "payment",
      status: "complete",
      payment_status: "paid",
      customer: "cus_badger",
      payment_intent: "pi_badger",
      client_reference_id: "user-a",
      metadata: { product: "badger-28-day", user_id: "user-a" },
    } },
  };
  const service = {
    from(table) {
      assert.equal(table, "entitlements");
      return { async upsert() { return { error: { code: "db_down" } }; } };
    },
  };
  await assert.rejects(() => applyStripeEvent(service, event), /entitlement_grant_failed/);
});

test("refund mutation errors are surfaced instead of acknowledged", async () => {
  const event = {
    id: "evt_refund",
    type: "charge.refunded",
    data: { object: { amount: 4900, amount_refunded: 4900, payment_intent: "pi_badger" } },
  };
  const service = {
    from(table) {
      assert.equal(table, "entitlements");
      return {
        update() { return this; },
        eq() { return this; },
        async select() { return { data: null, error: { code: "db_down" } }; },
      };
    },
  };
  await assert.rejects(() => applyStripeEvent(service, event), /refund_entitlement/);
});

test("a settled Checkout records the authoritative payment source even without a browser return", async () => {
  let purchase;
  const service = {
    from(table) {
      if (table === "entitlements") return { async upsert() { return { error: null }; } };
      if (table === "checkout_recoveries") {
        return { update() { return this; }, eq() { return this; } };
      }
      if (table === "product_events") {
        return { async insert(value) { purchase = value; return { error: null }; } };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
  const event = {
    id: "evt_attributed_checkout",
    type: "checkout.session.completed",
    data: { object: {
      id: "cs_attributed",
      mode: "payment",
      status: "complete",
      payment_status: "paid",
      amount_total: 4900,
      currency: "usd",
      customer: "cus_badger",
      payment_intent: "pi_attributed",
      client_reference_id: "35f5eab4-73bd-4a28-95a8-b73b3ac7787f",
      metadata: {
        product: "badger-28-day",
        user_id: "35f5eab4-73bd-4a28-95a8-b73b3ac7787f",
        utm_source: "newsletter",
        utm_campaign: "relaunch",
      },
    } },
  };
  assert.equal(await applyStripeEvent(service, event), "applied");
  assert.equal(purchase.event_name, "checkout_completed");
  assert.equal(purchase.properties.transaction_id, "pi_attributed");
  assert.equal(purchase.properties.utm_source, "newsletter");
  assert.equal(purchase.properties.revenue, 49);
});
