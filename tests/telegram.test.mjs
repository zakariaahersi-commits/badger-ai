import assert from "node:assert/strict";
import test from "node:test";
import {
  checkoutTelegramMessage,
  newFounderTelegramMessage,
  telegramDecisionActionIdFromReplyMarkup,
  telegramDecisionCallbackData,
  telegramOwnerAlertPayload,
  telegramOwnerReplyIntent,
  verifyTelegramDecisionCallback,
} from "../lib/telegram.ts";

test("formats an activated founder without leaking multiline input", () => {
  assert.equal(
    newFounderTelegramMessage({ name: "  Mina\nBuilder  ", email: "mina@example.com" }),
    "🦡 New founder activated\nName: Mina Builder\nEmail: mina@example.com\nStatus: onboarding complete",
  );
});

test("labels a no-cost Checkout as tester access rather than a payment", () => {
  assert.equal(
    checkoutTelegramMessage({ email: "tester@example.com", amountTotal: 0, currency: "usd" }),
    "🧪 Tester activated\nAmount: $0.00\nEmail: tester@example.com\nAccess: no-cost Checkout",
  );
});

test("shows the actual amount for a paid Checkout", () => {
  assert.match(
    checkoutTelegramMessage({ email: "founder@example.com", amountTotal: 4900, currency: "usd" }),
    /Payment received[\s\S]*\$49\.00/,
  );
});

test("chairman decisions are signed, bounded and reject tampering", () => {
  const secret = "test-secret-that-is-long-enough";
  const actionId = "3b8323fe-262f-42b1-aaef-24d2a7ce9d7f";
  const callback = telegramDecisionCallbackData(actionId, "approve", secret);
  assert.ok(callback);
  assert.ok(callback.length <= 64);
  assert.deepEqual(verifyTelegramDecisionCallback(callback, secret), { actionId, decision: "approve" });
  assert.equal(verifyTelegramDecisionCallback(callback.replace("ca:a:", "ca:r:"), secret), null);
  assert.equal(verifyTelegramDecisionCallback(callback, `${secret}-wrong`), null);
});

test("a Telegram reply is bound only to a complete signed decision keyboard", () => {
  const secret = "test-secret-that-is-long-enough";
  const actionId = "3b8323fe-262f-42b1-aaef-24d2a7ce9d7f";
  const markup = { inline_keyboard: [[
    { text: "Approve", callback_data: telegramDecisionCallbackData(actionId, "approve", secret) },
    { text: "Reject", callback_data: telegramDecisionCallbackData(actionId, "reject", secret) },
  ]] };
  assert.equal(telegramDecisionActionIdFromReplyMarkup(markup, secret), actionId);
  assert.equal(telegramDecisionActionIdFromReplyMarkup({ inline_keyboard: [[markup.inline_keyboard[0][0]]] }, secret), null);
  assert.equal(telegramDecisionActionIdFromReplyMarkup(markup, `${secret}-wrong`), null);
});

test("chairman reply intent requires an exact decision or preserves bounded feedback", () => {
  assert.deepEqual(telegramOwnerReplyIntent("Approved."), { type: "approve" });
  assert.deepEqual(telegramOwnerReplyIntent("no"), { type: "reject" });
  assert.deepEqual(telegramOwnerReplyIntent("Make the opening less generic and name the founder's actual blocker."), {
    type: "feedback",
    feedback: "Make the opening less generic and name the founder's actual blocker.",
  });
  assert.deepEqual(telegramOwnerReplyIntent(" "), { type: "invalid" });
});

test("owner alerts can carry one safe link without depending on a callback", () => {
  const payload = telegramOwnerAlertPayload("Send the five notes.", { text: "Open outreach cohort", url: "https://badger.example.com/ops/company#outreach" });
  assert.deepEqual(payload.reply_markup, { inline_keyboard: [[{ text: "Open outreach cohort", url: "https://badger.example.com/ops/company#outreach" }]] });
  assert.equal(payload.text, "Send the five notes.");
});

test("owner alerts drop unsafe action URLs but still deliver their text", () => {
  const payload = telegramOwnerAlertPayload("Review the cohort.", { text: "Open", url: "javascript:alert(1)" });
  assert.equal(payload.reply_markup, undefined);
  assert.equal(payload.text, "Review the cohort.");
});
