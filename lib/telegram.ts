import { createHmac, timingSafeEqual } from "node:crypto";

export type TelegramResult = "sent" | "not_configured" | "failed";
export type TelegramAlertAction = { text: string; url: string };
type TelegramDecision = "approve" | "reject";
export type TelegramOwnerReplyIntent = { type: TelegramDecision } | { type: "feedback"; feedback: string } | { type: "invalid" };

type TelegramDecisionAction = {
  id: string;
  agent_id: string;
  action_type: string;
  risk: string;
  title: string;
  rationale: string;
};

function clean(value: unknown, fallback: string, max = 160): string {
  return typeof value === "string" && value.trim()
    ? value.trim().replace(/\s+/g, " ").slice(0, max)
    : fallback;
}

function cleanMessage(value: string): string {
  return value.trim()
    .replace(/\r\n/g, "\n")
    .replace(/[\t ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .slice(0, 3500);
}

function amountLabel(amountTotal: number | null | undefined, currency: string | null | undefined): string {
  const amount = Number.isFinite(amountTotal) ? Number(amountTotal) / 100 : 0;
  const code = clean(currency, "usd", 3).toUpperCase();
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: code }).format(amount);
  } catch {
    return `${code} ${amount.toFixed(2)}`;
  }
}

export function newFounderTelegramMessage(input: { name?: string; email?: string }): string {
  return [
    "🦡 New founder activated",
    `Name: ${clean(input.name, "Not provided")}`,
    `Email: ${clean(input.email, "Unavailable")}`,
    "Status: onboarding complete",
  ].join("\n");
}

export function checkoutTelegramMessage(input: {
  email?: string | null;
  amountTotal?: number | null;
  currency?: string | null;
}): string {
  const noCost = input.amountTotal === 0;
  return [
    noCost ? "🧪 Tester activated" : "💳 Payment received",
    `Amount: ${amountLabel(input.amountTotal, input.currency)}`,
    `Email: ${clean(input.email, "Unavailable")}`,
    noCost ? "Access: no-cost Checkout" : "Access: 28-day launch",
  ].join("\n");
}

function telegramConfig() {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID?.trim();
  return token && chatId ? { token, chatId } : null;
}

function decisionSecret(): string | null {
  const value = process.env.COMPANY_AUTOMATION_CALLBACK_SECRET?.trim() || process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  return value && value.length >= 16 ? value : null;
}

async function telegramRequest(method: string, body: Record<string, unknown>): Promise<Response | null> {
  const config = telegramConfig();
  if (!config) return null;
  return fetch(`https://api.telegram.org/bot${config.token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(6_000),
  });
}

function decisionSignature(actionId: string, decision: TelegramDecision, secret: string): string {
  return createHmac("sha256", secret).update(`${actionId}:${decision}`).digest("base64url").slice(0, 12);
}

export function telegramDecisionCallbackData(actionId: string, decision: TelegramDecision, secret = decisionSecret()): string | null {
  if (!secret || !/^[0-9a-f-]{36}$/i.test(actionId)) return null;
  const choice = decision === "approve" ? "a" : "r";
  return `ca:${choice}:${actionId}:${decisionSignature(actionId, decision, secret)}`;
}

export function verifyTelegramDecisionCallback(value: unknown, secret = decisionSecret()): { actionId: string; decision: TelegramDecision } | null {
  if (typeof value !== "string" || !secret) return null;
  const match = /^ca:([ar]):([0-9a-f-]{36}):([A-Za-z0-9_-]{12})$/i.exec(value);
  if (!match) return null;
  const decision: TelegramDecision = match[1] === "a" ? "approve" : "reject";
  const expected = decisionSignature(match[2], decision, secret);
  const supplied = match[3];
  if (expected.length !== supplied.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))) return null;
  return { actionId: match[2], decision };
}

export function telegramDecisionActionIdFromReplyMarkup(value: unknown, secret = decisionSecret()): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const keyboard = (value as { inline_keyboard?: unknown }).inline_keyboard;
  if (!Array.isArray(keyboard)) return null;
  const decisions = keyboard.flatMap((row) => Array.isArray(row) ? row : []).flatMap((button) => {
    if (!button || typeof button !== "object" || Array.isArray(button)) return [];
    const verified = verifyTelegramDecisionCallback((button as { callback_data?: unknown }).callback_data, secret);
    return verified ? [verified] : [];
  });
  const ids = new Set(decisions.map((item) => item.actionId));
  const choices = new Set(decisions.map((item) => item.decision));
  return ids.size === 1 && choices.has("approve") && choices.has("reject") ? [...ids][0] : null;
}

export function telegramOwnerReplyIntent(value: unknown): TelegramOwnerReplyIntent {
  if (typeof value !== "string") return { type: "invalid" };
  const clean = value.replace(/[\u0000-\u001F\u007F]/g, " ").trim().replace(/\s+/g, " ").slice(0, 800);
  const command = clean.toLowerCase().replace(/[.!]+$/g, "");
  if (["approve", "approved", "yes"].includes(command)) return { type: "approve" };
  if (["reject", "rejected", "no"].includes(command)) return { type: "reject" };
  return clean.length >= 3 ? { type: "feedback", feedback: clean } : { type: "invalid" };
}

export function telegramOwnerAlertPayload(message: string, action?: TelegramAlertAction): Record<string, unknown> {
  const config = telegramConfig();
  const payload: Record<string, unknown> = {
    chat_id: config?.chatId ?? "",
    text: cleanMessage(message || "Badger AI activity"),
    disable_web_page_preview: true,
  };
  if (!action) return payload;
  try {
    const url = new URL(action.url);
    const text = clean(action.text, "Open Company OS", 50);
    if (url.protocol === "https:") payload.reply_markup = { inline_keyboard: [[{ text, url: url.toString() }]] };
  } catch {
    // An invalid action URL never prevents delivery of the operational alert.
  }
  return payload;
}

export async function sendOwnerTelegramAlert(message: string, action?: TelegramAlertAction): Promise<TelegramResult> {
  const config = telegramConfig();
  if (!config) return "not_configured";

  try {
    const response = await telegramRequest("sendMessage", telegramOwnerAlertPayload(message, action));
    if (!response?.ok) {
      console.error("[telegram] owner alert failed", response?.status ?? "no_response");
      return "failed";
    }
    return "sent";
  } catch (error) {
    console.error("[telegram] owner alert failed", error instanceof Error ? error.name : "unknown_error");
    return "failed";
  }
}

export async function sendOwnerTelegramDecision(action: TelegramDecisionAction, site = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://badger.example.com"): Promise<TelegramResult> {
  const config = telegramConfig();
  const approve = telegramDecisionCallbackData(action.id, "approve");
  const reject = telegramDecisionCallbackData(action.id, "reject");
  if (!config || !approve || !reject) return "not_configured";
  const webhook = await ensureOwnerTelegramWebhook(site);
  if (!webhook.configured) {
    console.error("[telegram] decision webhook unavailable", webhook.reason);
    return "failed";
  }
  const text = cleanMessage([
    "🦡 Chairman decision",
    `${action.title}`,
    `${action.rationale}`,
    `Agent: ${action.agent_id.replaceAll("_", " ")} · Risk: ${action.risk} · Action: ${action.action_type.replaceAll("_", " ")}`,
  ].join("\n"));
  try {
    const response = await telegramRequest("sendMessage", {
      chat_id: config.chatId,
      text,
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [
          [{ text: "Approve", callback_data: approve }, { text: "Reject", callback_data: reject }],
          [{ text: "Open Company OS", url: `${site.replace(/\/$/, "")}/ops/company#decisions` }],
        ],
      },
    });
    return response?.ok ? "sent" : "failed";
  } catch {
    return "failed";
  }
}

export async function acknowledgeOwnerTelegramCallback(input: { callbackQueryId: string; text: string }) {
  const config = telegramConfig();
  if (!config) return "not_configured" as const;
  try {
    const answer = await telegramRequest("answerCallbackQuery", { callback_query_id: input.callbackQueryId, text: clean(input.text, "Recorded", 180), show_alert: false });
    return answer?.ok ? "sent" as const : "failed" as const;
  } catch {
    return "failed" as const;
  }
}

export async function finalizeOwnerTelegramDecision(input: {
  chatId: string | number;
  messageId: number;
  confirmation: string;
  removeButtons?: boolean;
}) {
  const config = telegramConfig();
  if (!config) return "not_configured" as const;
  try {
    if (input.removeButtons !== false) {
      await telegramRequest("editMessageReplyMarkup", { chat_id: input.chatId, message_id: input.messageId, reply_markup: { inline_keyboard: [] } });
    }
    const confirmation = await telegramRequest("sendMessage", {
      chat_id: input.chatId,
      text: cleanMessage(input.confirmation),
      disable_web_page_preview: true,
    });
    return confirmation?.ok ? "sent" as const : "failed" as const;
  } catch {
    return "failed" as const;
  }
}

export async function configureOwnerTelegramWebhook(site = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://badger.example.com") {
  const config = telegramConfig();
  if (!config) return { configured: false, reason: "telegram_not_configured" } as const;
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) return { configured: false, reason: "telegram_webhook_secret_missing" } as const;
  const url = new URL("/api/telegram/company", site).toString();
  const response = await telegramRequest("setWebhook", {
    url,
    allowed_updates: ["callback_query", "message"],
    secret_token: webhookSecret,
  });
  return { configured: Boolean(response?.ok), url, reason: response?.ok ? null : "telegram_unavailable" } as const;
}

export async function ensureOwnerTelegramWebhook(site = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://badger.example.com") {
  const expectedUrl = new URL("/api/telegram/company", site).toString();
  const current = await ownerTelegramWebhookInfo();
  if (current.configured && current.url === expectedUrl && !current.lastError && current.allowedUpdates.includes("callback_query") && current.allowedUpdates.includes("message")) {
    return { configured: true, url: expectedUrl, reason: null } as const;
  }
  return configureOwnerTelegramWebhook(site);
}

export async function ownerTelegramWebhookInfo() {
  const config = telegramConfig();
  if (!config) return { configured: false, reason: "telegram_not_configured" } as const;
  const response = await telegramRequest("getWebhookInfo", {});
  if (!response?.ok) return { configured: false, reason: "telegram_unavailable" } as const;
  const payload = await response.json().catch(() => null) as { result?: { url?: string; pending_update_count?: number; last_error_message?: string; allowed_updates?: string[] } } | null;
  return {
    configured: Boolean(payload?.result?.url),
    url: payload?.result?.url ?? "",
    pendingUpdates: payload?.result?.pending_update_count ?? 0,
    lastError: payload?.result?.last_error_message ?? null,
    allowedUpdates: Array.isArray(payload?.result?.allowed_updates) ? payload.result.allowed_updates : [],
  } as const;
}

export function isOwnerTelegramChat(value: unknown): boolean {
  const expected = process.env.TELEGRAM_ADMIN_CHAT_ID?.trim();
  return Boolean(expected && String(value) === expected);
}
