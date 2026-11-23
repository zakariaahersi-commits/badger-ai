import test from "node:test";
import assert from "node:assert/strict";
import { normalizeApprovedEmail } from "../lib/orchestration/executor.ts";

test("normalizes the exact approved email payload", () => {
  assert.deepEqual(normalizeApprovedEmail({
    to: " Founder@Example.com ",
    subject: " Quick question ",
    text: " Would this solve your problem? ",
    from: "attacker@example.com",
  }), {
    to: "founder@example.com",
    subject: "Quick question",
    text: "Would this solve your problem?",
  });
});

test("rejects invalid or incomplete email payloads", () => {
  assert.throws(() => normalizeApprovedEmail({ to: "not-an-email", subject: "Hello", text: "Body" }), /invalid_recipient/);
  assert.throws(() => normalizeApprovedEmail({ to: "a@example.com", subject: "", text: "Body" }), /invalid_subject/);
  assert.throws(() => normalizeApprovedEmail({ to: "a@example.com", subject: "Hello", text: "" }), /invalid_body/);
});
