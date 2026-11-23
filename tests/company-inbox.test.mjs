import test from "node:test";
import assert from "node:assert/strict";
import { Webhook } from "svix";

import { parseAgentMailReceivedEvent, verifyAgentMailWebhook } from "../lib/company-os/agentmail.ts";
import { normalizeCompanyInboxReply } from "../lib/company-os/execution-policy.ts";

const config = { apiKey: "test-key", inboxId: "example-inbox@agentmail.to", inboxEmail: "example-inbox@agentmail.to", webhookSecret: null };
const received = {
  type: "event",
  event_type: "message.received",
  event_id: "evt_123",
  message: {
    inbox_id: "example-inbox@agentmail.to",
    thread_id: "thread_123",
    message_id: "message_123",
    timestamp: "2026-08-19T10:00:00.000Z",
    from: "Maya <maya@example.com>",
    to: ["Badger AI <example-inbox@agentmail.to>"],
    subject: "Partnership question",
    preview: "Could we explore a founder sprint?",
    text: "Could we explore a founder sprint?",
    extracted_text: "Could we explore a founder sprint?",
  },
};

test("AgentMail accepts only the configured inbox and inbound event type", () => {
  const parsed = parseAgentMailReceivedEvent(received, config);
  assert.equal(parsed?.message.from, "Maya <maya@example.com>");
  assert.equal(parsed?.message.subject, "Partnership question");
  assert.equal(parseAgentMailReceivedEvent({ ...received, event_type: "message.sent" }, config), null);
  assert.equal(parseAgentMailReceivedEvent({ ...received, message: { ...received.message, inbox_id: "other@agentmail.to" } }, config), null);
  assert.equal(parseAgentMailReceivedEvent({ ...received, message: { ...received.message, from: "example-inbox@agentmail.to" } }, config), null);
});

test("AgentMail Svix signatures are verified against the raw body", () => {
  const secret = `whsec_${Buffer.from("badger-company-inbox-test-secret").toString("base64")}`;
  const webhook = new Webhook(secret);
  const payload = JSON.stringify(received);
  const id = "msg_test_123";
  const timestamp = new Date();
  const headers = new Headers({ "svix-id": id, "svix-timestamp": String(Math.floor(timestamp.getTime() / 1000)), "svix-signature": webhook.sign(id, timestamp, payload) });
  assert.deepEqual(verifyAgentMailWebhook(payload, headers, secret), received);
  assert.throws(() => verifyAgentMailWebhook(`${payload} `, headers, secret));
});

test("company inbox replies require exact bounded thread context", () => {
  assert.deepEqual(normalizeCompanyInboxReply({ inboxId: "example-inbox@agentmail.to", messageId: "message_123", threadId: "thread_123", recipientEmail: "MAYA@EXAMPLE.COM", subject: "Re: Partnership question", content: "Thanks, Maya. I would be happy to explore this." }), {
    inboxId: "example-inbox@agentmail.to",
    messageId: "message_123",
    threadId: "thread_123",
    recipientEmail: "maya@example.com",
    subject: "Re: Partnership question",
    content: "Thanks, Maya. I would be happy to explore this.",
  });
  assert.throws(() => normalizeCompanyInboxReply({ inboxId: "inbox", messageId: "message", threadId: "thread", recipientEmail: "not-an-email", subject: "Hello", content: "Reply" }), /invalid_recipient_email/);
  assert.throws(() => normalizeCompanyInboxReply({ inboxId: "inbox", messageId: "message", threadId: "thread", recipientEmail: "maya@example.com", subject: "Hello", content: "" }), /invalid_content/);
});
