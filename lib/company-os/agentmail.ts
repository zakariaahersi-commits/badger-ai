import type { SupabaseClient } from "@supabase/supabase-js";
import { Webhook } from "svix";

const AGENTMAIL_API = "https://api.agentmail.to/v0";
const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

export type AgentMailMessageEvent = {
  type: "event";
  event_type: "message.received";
  event_id: string;
  message: {
    inbox_id: string;
    thread_id: string;
    message_id: string;
    timestamp: string;
    from: string;
    to: string[];
    subject?: string;
    preview?: string;
    text?: string;
    extracted_text?: string;
  };
};

export type CompanyInboxConfig = {
  apiKey: string;
  inboxId: string;
  inboxEmail: string | null;
  webhookSecret: string | null;
};

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\u0000/g, "").trim().slice(0, max) : "";
}

export function normalizedEmailAddress(value: unknown): { email: string; name: string | null } | null {
  const raw = clean(value, 500);
  const bracketed = raw.match(/^(.*?)\s*<([^<>]+)>$/);
  const email = (bracketed?.[2] ?? raw).trim().toLowerCase();
  if (!EMAIL.test(email) || email.length > 320) return null;
  const name = bracketed?.[1]?.trim().replace(/^['"]|['"]$/g, "").slice(0, 200) || null;
  return { email, name };
}

export function agentMailConfig(): CompanyInboxConfig | null {
  const apiKey = process.env.AGENTMAIL_API_KEY?.trim();
  const inboxId = process.env.AGENTMAIL_INBOX_ID?.trim() || process.env.AGENTMAIL_INBOX?.trim();
  const inboxEmail = normalizedEmailAddress(process.env.AGENTMAIL_INBOX_EMAIL)?.email ?? null;
  const webhookSecret = process.env.AGENTMAIL_WEBHOOK_SECRET?.trim() || null;
  return apiKey && inboxId ? { apiKey, inboxId, inboxEmail, webhookSecret } : null;
}

export function companyInboxConnectorReady(): boolean {
  const config = agentMailConfig();
  return Boolean(config?.apiKey && config.inboxId);
}

export function companyInboxWebhookReady(): boolean {
  return Boolean(agentMailConfig()?.webhookSecret);
}

export function verifyAgentMailWebhook(rawBody: string, headers: Headers, secret = agentMailConfig()?.webhookSecret): unknown {
  if (!secret) throw new Error("agentmail_webhook_not_configured");
  const id = headers.get("svix-id");
  const timestamp = headers.get("svix-timestamp");
  const signature = headers.get("svix-signature");
  if (!id || !timestamp || !signature) throw new Error("agentmail_signature_missing");
  return new Webhook(secret).verify(rawBody, {
    "svix-id": id,
    "svix-timestamp": timestamp,
    "svix-signature": signature,
  });
}

export function parseAgentMailReceivedEvent(value: unknown, config = agentMailConfig()): AgentMailMessageEvent | null {
  if (!config || !value || typeof value !== "object" || Array.isArray(value)) return null;
  const event = value as Record<string, unknown>;
  if (event.type !== "event" || event.event_type !== "message.received") return null;
  if (!event.message || typeof event.message !== "object" || Array.isArray(event.message)) return null;
  const message = event.message as Record<string, unknown>;
  const inboxId = clean(message.inbox_id, 240);
  const from = normalizedEmailAddress(message.from);
  const to = Array.isArray(message.to) ? message.to.map((item) => clean(item, 500)).filter(Boolean) : [];
  const recipientMatches = !config.inboxEmail || to.some((item) => normalizedEmailAddress(item)?.email === config.inboxEmail);
  const timestamp = clean(message.timestamp, 80);
  if (!clean(event.event_id, 240) || inboxId !== config.inboxId || !from || !recipientMatches || !Number.isFinite(Date.parse(timestamp))) return null;
  if (config.inboxEmail && from.email === config.inboxEmail) return null;
  const threadId = clean(message.thread_id, 240);
  const messageId = clean(message.message_id, 240);
  if (!threadId || !messageId) return null;
  return {
    type: "event",
    event_type: "message.received",
    event_id: clean(event.event_id, 240),
    message: {
      inbox_id: inboxId,
      thread_id: threadId,
      message_id: messageId,
      timestamp,
      from: from.name ? `${from.name} <${from.email}>` : from.email,
      to,
      subject: clean(message.subject, 500) || "(no subject)",
      preview: clean(message.preview, 1000),
      text: clean(message.text, 20000),
      extracted_text: clean(message.extracted_text, 20000),
    },
  };
}

export async function ingestAgentMailEvent(service: SupabaseClient, event: AgentMailMessageEvent) {
  const sender = normalizedEmailAddress(event.message.from)!;
  const body = clean(event.message.extracted_text, 20000) || clean(event.message.text, 20000) || clean(event.message.preview, 1000);
  const inserted = await service.from("company_email_messages").insert({
    provider_event_id: event.event_id,
    inbox_id: event.message.inbox_id,
    thread_id: event.message.thread_id,
    message_id: event.message.message_id,
    sender_email: sender.email,
    sender_name: sender.name,
    subject: clean(event.message.subject, 500) || "(no subject)",
    preview: clean(event.message.preview, 1000),
    body_text: body,
    received_at: event.message.timestamp,
  }).select("id").maybeSingle();
  if (inserted.error?.code === "23505") return { accepted: true, duplicate: true, id: null };
  if (inserted.error || !inserted.data) throw new Error("company_inbox_store_failed");
  await service.from("company_audit_log").insert({
    actor_type: "system",
    actor_id: "agentmail_webhook",
    event_type: "company_email.received",
    object_type: "company_email_message",
    object_id: String(inserted.data.id),
    details: { provider: "agentmail", eventId: event.event_id, messageId: event.message.message_id },
  });
  return { accepted: true, duplicate: false, id: inserted.data.id as number };
}

export async function replyToAgentMailMessage(input: { inboxId: string; messageId: string; content: string; actionId: string }) {
  const config = agentMailConfig();
  if (!config || input.inboxId !== config.inboxId) throw new Error("agentmail_not_configured");
  const response = await fetch(`${AGENTMAIL_API}/inboxes/${encodeURIComponent(input.inboxId)}/messages/${encodeURIComponent(input.messageId)}/reply`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}`, "Idempotency-Key": `badger-company-${input.actionId}` },
    body: JSON.stringify({ text: input.content, reply_all: false, headers: { "X-Badger-Action-ID": input.actionId } }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`agentmail_provider_${response.status}`);
  const body = await response.json().catch(() => null) as { message_id?: unknown; thread_id?: unknown } | null;
  const messageId = clean(body?.message_id, 240);
  const threadId = clean(body?.thread_id, 240);
  if (!messageId || !threadId) throw new Error("agentmail_invalid_response");
  return { messageId, threadId };
}
