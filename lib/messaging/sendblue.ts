import { timingSafeEqual } from "node:crypto";
import type { MessagingInboundEvent } from "./provider.ts";

const SENDBLUE_BASE_URL = "https://api.sendblue.com";

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function headerValue(headers: Headers | Record<string, string | undefined>, name: string): string | null {
  if (headers instanceof Headers) return headers.get(name);
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === target && value) return value;
  }
  return null;
}

export function verifySendblueWebhook(
  headers: Headers | Record<string, string | undefined>,
  secret = process.env.SENDBLUE_WEBHOOK_SECRET ?? "",
): boolean {
  const supplied = headerValue(headers, "sb-signing-secret");
  if (!supplied || !secret) return false;
  const expectedBuffer = Buffer.from(secret);
  const suppliedBuffer = Buffer.from(supplied);
  return suppliedBuffer.length === expectedBuffer.length && timingSafeEqual(suppliedBuffer, expectedBuffer);
}

export function parseSendblueEvent(payload: unknown): MessagingInboundEvent | null {
  const data = object(payload);
  const messageId = text(data.message_handle);
  const status = text(data.status).toUpperCase();
  const outbound = data.is_outbound === true;
  const endUser = text(data.number) || (outbound ? text(data.to_number) : text(data.from_number));
  if (!messageId || !status || !endUser) return null;
  const eventType = outbound
    ? status === "DELIVERED" ? "message.delivered"
      : status === "READ" ? "message.read"
        : ["ERROR", "FAILED", "DECLINED"].includes(status) ? "message.failed"
          : "message.sent"
    : "message.received";
  const mediaUrl = text(data.media_url);
  return {
    eventId: `${messageId}:${outbound ? status : "RECEIVED"}`,
    eventType,
    chatId: endUser,
    messageId,
    sender: endUser,
    service: text(data.service) || "iMessage",
    isGroup: Boolean(text(data.group_id)),
    text: text(data.content).trim(),
    media: mediaUrl ? [{ id: messageId, url: mediaUrl }] : [],
  };
}

async function sendblueRequest(path: string, init: RequestInit): Promise<Record<string, unknown>> {
  const apiKey = process.env.SENDBLUE_API_KEY_ID;
  const apiSecret = process.env.SENDBLUE_API_SECRET_KEY;
  if (!apiKey || !apiSecret) throw new Error("sendblue_not_configured");
  const response = await fetch(`${SENDBLUE_BASE_URL}${path}`, {
    ...init,
    headers: {
      "sb-api-key-id": apiKey,
      "sb-api-secret-key": apiSecret,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(8_000),
  });
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const code = typeof body.message === "string" ? body.message : typeof body.error === "string" ? body.error : `http_${response.status}`;
    throw new Error(`sendblue_${code}`.replace(/[^a-zA-Z0-9_.:-]/g, "_").slice(0, 160));
  }
  return body;
}

export async function createSendblueContact(phone: string, firstName?: string): Promise<void> {
  await sendblueRequest("/api/v2/contacts", {
    method: "POST",
    body: JSON.stringify({
      number: phone,
      first_name: firstName?.slice(0, 80) || undefined,
      sendblue_number: process.env.SENDBLUE_PHONE_NUMBER,
      tags: ["Badger iMessage pilot"],
      update_if_exists: true,
    }),
  });
}

export async function sendSendblueText(number: string, value: string): Promise<{ messageId?: string }> {
  const body = await sendblueRequest("/api/send-message", {
    method: "POST",
    body: JSON.stringify({
      number,
      from_number: process.env.SENDBLUE_PHONE_NUMBER,
      content: value.slice(0, 4_000),
    }),
  });
  return { messageId: text(body.message_handle) || text(body.message_id) || text(body.id) || undefined };
}
