import test from "node:test";
import assert from "node:assert/strict";

import { grantCheckoutEntitlement, isBadgerCheckout, isSettledCheckout } from "../lib/entitlements.ts";

function session(overrides = {}) {
  return {
    id: "cs_live_badger",
    mode: "payment",
    status: "complete",
    payment_status: "paid",
    customer: "cus_badger",
    payment_intent: "pi_badger",
    client_reference_id: "user-a",
    metadata: { product: "badger-28-day", user_id: "user-a" },
    ...overrides,
  };
}

test("a settled Badger checkout grants the matching account only", async () => {
  let upserted;
  let recoveredUser;
  const service = {
    from(table) {
      if (table === "checkout_recoveries") {
        const recoveryBuilder = {
          update() { return recoveryBuilder; },
          eq(column, value) {
            if (column === "user_id") recoveredUser = value;
            return recoveryBuilder;
          },
        };
        return recoveryBuilder;
      }
      assert.equal(table, "entitlements");
      const builder = {
        select() { return builder; },
        eq() { return builder; },
        async maybeSingle() { return { data: null, error: null }; },
        async upsert(value) { upserted = value; return { error: null }; },
      };
      return builder;
    },
  };

  assert.equal(await grantCheckoutEntitlement(service, session(), "user-a"), true);
  assert.equal(upserted.user_id, "user-a");
  assert.equal(upserted.status, "active");
  assert.equal(upserted.stripe_payment_intent_id, "pi_badger");
  assert.equal(recoveredUser, "user-a");
});

test("rechecking an active checkout preserves the original Day 1 timestamp", async () => {
  let upserted;
  const service = {
    from(table) {
      if (table === "checkout_recoveries") {
        const recoveryBuilder = { update() { return recoveryBuilder; }, eq() { return recoveryBuilder; } };
        return recoveryBuilder;
      }
      const builder = {
        select() { return builder; },
        eq() { return builder; },
        async upsert(value) { upserted = value; return { error: null }; },
      };
      return builder;
    },
  };
  assert.equal(await grantCheckoutEntitlement(service, session(), "user-a"), true);
  assert.equal(Object.prototype.hasOwnProperty.call(upserted, "granted_at"), false);
});

test("a checkout session cannot unlock a different account", async () => {
  let wrote = false;
  const service = { from() { wrote = true; return {}; } };
  assert.equal(await grantCheckoutEntitlement(service, session(), "user-b"), false);
  assert.equal(wrote, false);
});

test("unpaid or unrelated checkout sessions are rejected", () => {
  assert.equal(isSettledCheckout(session({ payment_status: "unpaid" })), false);
  assert.equal(isBadgerCheckout(session({ metadata: { product: "another-product" } })), false);
});
