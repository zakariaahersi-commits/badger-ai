import { createHmac, timingSafeEqual } from "node:crypto";
import type { MessagingInboundEvent } from "./provider.ts";

const LINQ_BASE_URL = "https://api.linqapp.com/api/partner/v3";

export interface LinqMessagePart {
  type: "text" | "media" | "link";
  value?: string;
  url?: string;
  id?: string;
  filename?: string;
  mime_type?: string;
}

export type LinqInboundEvent = MessagingInboundEvent;

function headerValue(headers: Headers | Record<string, string | undefined>, name: string): string | null {
  if (headers instanceof Headers) return headers.get(name);
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === target && value) return value;
  }
  return null;
}

export function verifyLinqWebhook(
  rawBody: string,
  headers: Headers | Record<string, string | undefined>,
  secret = process.env.LINQ_WEBHOOK_SECRET ?? "",
  nowMs = Date.now(),
): boolean {
  const messageId = headerValue(headers, "webhook-id");
  const timestamp = headerValue(headers, "webhook-timestamp");
  const signature = headerValue(headers, "webhook-signature");
  if (!messageId || !timestamp || !signature || !secret) return false;
  const sentAt = Number(timestamp) * 1_000;
  if (!Number.isFinite(sentAt) || Math.abs(nowMs - sentAt) > 5 * 60_000) return false;
  try {
    const key = Buffer.from(secret.startsWith("whsec_") ? secret.slice(6) : secret, "base64");
    if (!key.length) return false;
    const expected = createHmac("sha256", key)
      .update(`${messageId}.${timestamp}.${rawBody}`)
      .digest();
    return signature.split(" ").some((candidate) => {
      if (!candidate.startsWith("v1,")) return false;
      const actual = Buffer.from(candidate.slice(3), "base64");
      return actual.length === expected.length && timingSafeEqual(actual, expected);
    });
  } catch {
    return false;
  }
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function parseLinqEvent(payload: unknown): LinqInboundEvent | null {
  const envelope = object(payload);
  const eventId = text(envelope.event_id);
  const eventType = text(envelope.event_type);
  const data = object(envelope.data);
  const chat = object(data.chat);
  const message = object(data.message);
  const senderHandle = object(data.sender_handle);
  const fromHandle = object(data.from_handle);
  const partsValue = Array.isArray(data.parts) ? data.parts : Array.isArray(message.parts) ? message.parts : [];
  const parts = partsValue.map(object) as unknown as LinqMessagePart[];
  const chatId = text(chat.id) || text(data.chat_id);
  const messageId = text(data.id) || text(message.id);
  const sender = text(senderHandle.handle) || text(fromHandle.handle) || text(data.from);
  const service = text(data.service) || text(senderHandle.service) || text(fromHandle.service);
  if (!eventId || !eventType) return null;
  return {
    eventId,
    eventType,
    chatId,
    messageId,
    sender,
    service,
    isGroup: data.is_group === true || chat.is_group === true,
    text: parts.filter((part) => part.type === "text").map((part) => text(part.value)).filter(Boolean).join("\n").trim(),
    media: parts.flatMap((part) => part.type === "media" && text(part.url) ? [{
      id: text(part.id) || undefined,
      url: text(part.url),
      filename: text(part.filename) || undefined,
      mimeType: text(part.mime_type) || undefined,
    }] : []),
  };
}

async function linqRequest(path: string, init: RequestInit): Promise<Record<string, unknown>> {
  const apiKey = process.env.LINQ_API_KEY;
  if (!apiKey) throw new Error("linq_not_configured");
  const response = await fetch(`${LINQ_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(8_000),
  });
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const code = typeof body.error === "string" ? body.error : typeof body.code === "string" ? body.code : `http_${response.status}`;
    throw new Error(`linq_${code}`.slice(0, 160));
  }
  return body;
}

export async function sendLinqText(chatId: string, value: string, idempotencyKey: string): Promise<{ messageId?: string }> {
  const body = await linqRequest(`/chats/${encodeURIComponent(chatId)}/messages`, {
    method: "POST",
    body: JSON.stringify({
      message: {
        parts: [{ type: "text", value: value.slice(0, 4_000) }],
        preferred_service: "iMessage",
        idempotency_key: idempotencyKey.slice(0, 255),
      },
    }),
  });
  const message = object(body.message);
  return { messageId: text(body.id) || text(body.message_id) || text(message.id) || undefined };
}

export async function startLinqTyping(chatId: string): Promise<void> {
  try {
    await linqRequest(`/chats/${encodeURIComponent(chatId)}/typing`, { method: "POST" });
  } catch {
    // Typing indicators are best-effort and must never block coaching.
  }
}
