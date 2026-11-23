import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

import {
  bodyLengthBucket,
  generateLinkCode,
  normalizePhone,
  privateDigest,
  protectText,
  revealText,
} from "../lib/messaging/crypto.ts";
import { parseLinqEvent, verifyLinqWebhook } from "../lib/messaging/linq.ts";
import { parseSendblueEvent, verifySendblueWebhook } from "../lib/messaging/sendblue.ts";
import { shouldSendFollowUp } from "../lib/messaging/nudge.ts";
import { inboundReplyTarget } from "../lib/messaging/provider.ts";
import { commandMessageBody, messagingCommand } from "../lib/messaging/commands.ts";
import { hasActiveMessagingAccess } from "../lib/messaging/access.ts";
import { latestExpiredMessagingLinks } from "../lib/messaging/recovery-policy.ts";

const KEY = Buffer.alloc(32, 7).toString("base64");

test("protects phone and webhook content with authenticated encryption", () => {
  const protectedValue = protectText("+12025550123", KEY);
  assert.notEqual(protectedValue, "+12025550123");
  assert.equal(revealText(protectedValue, KEY), "+12025550123");
  const tampered = protectedValue.split(".");
  const ciphertext = Buffer.from(tampered[3], "base64url");
  ciphertext[0] ^= 1;
  tampered[3] = ciphertext.toString("base64url");
  assert.throws(() => revealText(tampered.join("."), KEY));
  assert.equal(privateDigest("+12025550123", KEY).length, 64);
});

test("creates unambiguous link codes and normalizes E.164 phone numbers", () => {
  const code = generateLinkCode(Buffer.from([0, 1, 2, 3, 4, 5]));
  assert.equal(code.length, 6);
  assert.doesNotMatch(code, /[01IO]/);
  assert.equal(normalizePhone("+1 202-555-0123"), "+12025550123");
  assert.equal(normalizePhone("0701234567"), null);
});

test("offers one reconnect only after an unused code has been expired for thirty minutes", () => {
  const now = new Date("2026-08-30T12:00:00.000Z");
  const candidates = latestExpiredMessagingLinks([
    { user_id: "ready", provider: "linq", used_at: null, created_at: "2026-08-30T10:55:00.000Z", expires_at: "2026-08-30T11:10:00.000Z" },
    { user_id: "too-soon", provider: "linq", used_at: null, created_at: "2026-08-30T11:25:00.000Z", expires_at: "2026-08-30T11:40:00.000Z" },
    { user_id: "connected", provider: "linq", used_at: "2026-08-30T11:00:00.000Z", created_at: "2026-08-30T10:40:00.000Z", expires_at: "2026-08-30T10:55:00.000Z" },
    { user_id: "ready", provider: "linq", used_at: null, created_at: "2026-08-30T10:20:00.000Z", expires_at: "2026-08-30T10:35:00.000Z" },
  ], now);
  assert.deepEqual(candidates, [{ userId: "ready", provider: "linq", attemptedAt: "2026-08-30T10:55:00.000Z", expiredAt: "2026-08-30T11:10:00.000Z" }]);
});

test("verifies current Linq Standard Webhooks signatures and rejects replay or tampering", () => {
  const raw = JSON.stringify({ event_type: "message.received", event_id: "evt_1", data: {} });
  const timestamp = "1787072400";
  const id = "evt_1";
  const secretBytes = Buffer.alloc(32, 11);
  const secret = `whsec_${secretBytes.toString("base64")}`;
  const signature = createHmac("sha256", secretBytes).update(`${id}.${timestamp}.${raw}`).digest("base64");
  const headers = { "webhook-id": id, "webhook-timestamp": timestamp, "webhook-signature": `v1,${signature}` };
  const now = Number(timestamp) * 1_000;
  assert.equal(verifyLinqWebhook(raw, headers, secret, now), true);
  assert.equal(verifyLinqWebhook(`${raw} `, headers, secret, now), false);
  assert.equal(verifyLinqWebhook(raw, headers, secret, now + 301_000), false);
});

test("parses the versioned Linq inbound envelope without retaining unrelated fields", () => {
  const event = parseLinqEvent({
    event_type: "message.received",
    event_id: "evt_2",
    data: {
      chat: { id: "chat_1", is_group: false },
      id: "msg_1",
      sender_handle: { handle: "+12025550123", service: "iMessage" },
      service: "iMessage",
      parts: [
        { type: "text", value: "STUCK on the opening" },
        { type: "media", id: "att_1", url: "https://cdn.linqapp.com/proof.jpg", mime_type: "image/jpeg" },
      ],
    },
  });
  assert.deepEqual(event, {
    eventId: "evt_2",
    eventType: "message.received",
    chatId: "chat_1",
    messageId: "msg_1",
    sender: "+12025550123",
    service: "iMessage",
    isGroup: false,
    text: "STUCK on the opening",
    media: [{ id: "att_1", url: "https://cdn.linqapp.com/proof.jpg", filename: undefined, mimeType: "image/jpeg" }],
  });
});

test("verifies Sendblue's configured signing secret without accepting a near match", () => {
  const secret = "pilot-webhook-secret";
  assert.equal(verifySendblueWebhook({ "sb-signing-secret": secret }, secret), true);
  assert.equal(verifySendblueWebhook({ "sb-signing-secret": `${secret}!` }, secret), false);
  assert.equal(verifySendblueWebhook({}, secret), false);
});

test("normalizes an inbound Sendblue message and media for the shared coach", () => {
  const event = parseSendblueEvent({
    content: "START 7K4P",
    is_outbound: false,
    status: "RECEIVED",
    message_handle: "message-1",
    from_number: "+12025550123",
    number: "+12025550123",
    to_number: "+12025550124",
    media_url: "https://cdn.sendblue.com/proof.jpg",
    service: "iMessage",
    group_id: "",
  });
  assert.deepEqual(event, {
    eventId: "message-1:RECEIVED",
    eventType: "message.received",
    chatId: "+12025550123",
    messageId: "message-1",
    sender: "+12025550123",
    service: "iMessage",
    isGroup: false,
    text: "START 7K4P",
    media: [{ id: "message-1", url: "https://cdn.sendblue.com/proof.jpg" }],
  });
});

test("keeps Sendblue delivery updates distinct from the inbound event", () => {
  const event = parseSendblueEvent({
    content: "Your task",
    is_outbound: true,
    status: "DELIVERED",
    message_handle: "message-2",
    number: "+12025550123",
    service: "iMessage",
  });
  assert.equal(event?.eventId, "message-2:DELIVERED");
  assert.equal(event?.eventType, "message.delivered");
  assert.equal(event?.sender, "+12025550123");
});

test("the follow-up is allowed only when the founder has not replied after the morning task", () => {
  assert.equal(shouldSendFollowUp(null, "2026-08-18T07:00:00.000Z"), true);
  assert.equal(shouldSendFollowUp("2026-08-18T07:30:00.000Z", "2026-08-18T07:00:00.000Z"), false);
  assert.equal(shouldSendFollowUp("2026-08-18T06:30:00.000Z", "2026-08-18T07:00:00.000Z"), true);
  assert.equal(shouldSendFollowUp(null, null), false);
  assert.equal(bodyLengthBucket(0), "0");
  assert.equal(bodyLengthBucket(501), "501+");
});

test("unlinked replies use the provider's correct destination", () => {
  const event = { chatId: "9c41148c-991e-4e9b-a0f5-3143f4db2742", sender: "+12025550123" };
  assert.equal(inboundReplyTarget("linq", event), event.chatId);
  assert.equal(inboundReplyTarget("sendblue", event), event.sender);
});

test("natural DONE and STUCK messages preserve the founder's explanation", () => {
  assert.equal(messagingCommand("DONE — I called three people and two replied"), "DONE");
  assert.equal(commandMessageBody("DONE — I called three people and two replied", "DONE"), "I called three people and two replied");
  assert.equal(commandMessageBody("STUCK: I keep rewriting the offer", "STUCK"), "I keep rewriting the offer");
  assert.equal(messagingCommand("I am done thinking about it"), null);
});

test("iMessage coaching rechecks current paid or tester access", async () => {
  const service = {
    from(table) {
      assert.equal(table, "entitlements");
      return {
        select() { return this; },
        eq() { return this; },
        async maybeSingle() { return { data: { status: "active" }, error: null }; },
      };
    },
  };
  assert.equal(await hasActiveMessagingAccess(service, "00000000-0000-4000-8000-000000000001"), true);
});
