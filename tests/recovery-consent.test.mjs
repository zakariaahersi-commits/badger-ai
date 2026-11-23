import test from "node:test";
import assert from "node:assert/strict";

import { hasRecoveryConsent } from "../lib/recovery-consent.ts";

test("recovery requires an explicit enabled preference", () => {
  assert.equal(hasRecoveryConsent(true), true);
  assert.equal(hasRecoveryConsent(false), false);
  assert.equal(hasRecoveryConsent(null), false);
  assert.equal(hasRecoveryConsent(undefined), false);
});
