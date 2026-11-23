import test from "node:test";
import assert from "node:assert/strict";

import { isGoogleOAuthSession, isOwnerEmail, ownerEmails } from "../lib/ops-auth.ts";

test("owner allowlist is normalized and exact", () => {
  assert.deepEqual(ownerEmails(" Owner@Example.com, second@example.com "), ["owner@example.com", "second@example.com"]);
  assert.equal(isOwnerEmail("OWNER@example.com", "owner@example.com"), true);
  assert.equal(isOwnerEmail("other@example.com", "owner@example.com"), false);
});

test("ops requires both an OAuth session and a linked Google identity", () => {
  assert.equal(isGoogleOAuthSession(["oauth"], ["google"]), true);
  assert.equal(isGoogleOAuthSession(["password"], ["email", "google"]), false);
  assert.equal(isGoogleOAuthSession(["oauth"], ["github"]), false);
});
