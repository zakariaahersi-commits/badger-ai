import test from "node:test";
import assert from "node:assert/strict";

import { paidAccessState } from "../lib/paid-access.ts";

function authWith(entitlementResult) {
  return {
    userId: "user-a",
    email: "founder@example.com",
    invalid: false,
    service: {
      from() {
        return {
          select() { return this; },
          eq() { return this; },
          async maybeSingle() { return entitlementResult; },
        };
      },
    },
  };
}

test("paid access requires a valid authenticated account", async () => {
  assert.equal(await paidAccessState({ userId: null, email: null, service: null, invalid: false }), "missing");
  assert.equal(await paidAccessState({ userId: null, email: null, service: null, invalid: true }), "missing");
});

test("only an active Badger entitlement unlocks paid APIs", async () => {
  assert.equal(await paidAccessState(authWith({ data: { status: "active" }, error: null })), "active");
  assert.equal(await paidAccessState(authWith({ data: { status: "refunded" }, error: null })), "missing");
  assert.equal(await paidAccessState(authWith({ data: null, error: null })), "missing");
});

test("database errors fail closed", async () => {
  assert.equal(await paidAccessState(authWith({ data: null, error: { code: "database_error" } })), "unavailable");
});
