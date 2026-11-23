import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { CompanyDecisionError, decideCompanyAction, requestCompanyActionRevision } from "@/lib/company-os/decisions";
import { executeCompanyAction } from "@/lib/company-os/executor";
import {
  acknowledgeOwnerTelegramCallback,
  finalizeOwnerTelegramDecision,
  isOwnerTelegramChat,
  telegramDecisionActionIdFromReplyMarkup,
  telegramOwnerReplyIntent,
  verifyTelegramDecisionCallback,
} from "@/lib/telegram";

export const runtime = "nodejs";
export const maxDuration = 60;

type TelegramMessage = {
  message_id?: number;
  text?: string;
  from?: { id?: number; is_bot?: boolean };
  chat?: { id?: number | string };
  reply_to_message?: { message_id?: number; reply_markup?: unknown };
};

type TelegramUpdate = {
  callback_query?: {
    id?: string;
    data?: string;
    from?: { id?: number };
    message?: TelegramMessage;
  };
  message?: TelegramMessage;
};

function companyService(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
}

async function applyOwnerDecision(input: {
  service: SupabaseClient;
  actionId: string;
  decision: "approve" | "reject";
  fromId: number;
  chatId: string | number;
  decisionMessageId: number;
  callbackQueryId?: string;
}) {
  if (input.callbackQueryId) await acknowledgeOwnerTelegramCallback({ callbackQueryId: input.callbackQueryId, text: "Recording your decision…" });
  try {
    const result = await decideCompanyAction({
      service: input.service,
      actionId: input.actionId,
      decision: input.decision,
      actorId: `telegram:${input.fromId}`,
      channel: "telegram",
    });
    const execution = input.decision === "approve" && result.action.status === "approved"
      ? await executeCompanyAction(input.service, result.action.id)
      : null;
    const outcome = execution?.message ?? result.execution;
    await finalizeOwnerTelegramDecision({
      chatId: input.chatId,
      messageId: input.decisionMessageId,
      confirmation: input.decision === "approve"
        ? `✅ Approved · ${result.action.title}\n${outcome}`
        : `⛔ Rejected · ${result.action.title}\nNo work was executed.`,
    });
    return NextResponse.json({ received: true, action: result.action, execution });
  } catch (error) {
    const stale = error instanceof CompanyDecisionError && ["not_found", "not_pending"].includes(error.code);
    const connector = error instanceof CompanyDecisionError && error.code === "connector_missing";
    await finalizeOwnerTelegramDecision({
      chatId: input.chatId,
      messageId: input.decisionMessageId,
      confirmation: connector
        ? "⚠️ Approval was not applied because this action's connector is missing. Open Company OS to finish setup."
        : stale
          ? "ℹ️ This action was already decided. Company OS has the current state."
          : "⚠️ The decision failed safely and no action was triggered. Open Company OS and try again.",
      removeButtons: stale,
    });
    return NextResponse.json({ received: true, applied: false, reason: connector ? "connector_missing" : stale ? "stale" : "failed" });
  }
}

export async function POST(req: NextRequest) {
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) return NextResponse.json({ error: "telegram webhook not configured" }, { status: 503 });
  if (req.headers.get("x-telegram-bot-api-secret-token") !== webhookSecret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const update = await req.json().catch(() => null) as TelegramUpdate | null;
  const service = companyService();

  const query = update?.callback_query;
  if (query) {
    const chatId = query.message?.chat?.id;
    const messageId = query.message?.message_id;
    const fromId = query.from?.id;
    if (!query.id || (typeof chatId !== "string" && typeof chatId !== "number") || !isOwnerTelegramChat(chatId) || !fromId || !isOwnerTelegramChat(fromId) || !messageId) {
      return NextResponse.json({ error: "owner callback required" }, { status: 403 });
    }
    const decision = verifyTelegramDecisionCallback(query.data);
    if (!decision) {
      await acknowledgeOwnerTelegramCallback({ callbackQueryId: query.id, text: "This decision has expired." });
      await finalizeOwnerTelegramDecision({ chatId, messageId, confirmation: "⚠️ This decision is no longer valid. Open Company OS to see the current state." });
      return NextResponse.json({ received: true, stale: true });
    }
    if (!service) {
      await finalizeOwnerTelegramDecision({ chatId, messageId, confirmation: "⚠️ Company OS is not configured, so no decision was applied. The buttons remain available after setup.", removeButtons: false });
      return NextResponse.json({ error: "not configured" }, { status: 503 });
    }
    return applyOwnerDecision({ service, actionId: decision.actionId, decision: decision.decision, fromId, chatId, decisionMessageId: messageId, callbackQueryId: query.id });
  }

  const message = update?.message;
  const chatId = message?.chat?.id;
  const fromId = message?.from?.id;
  if (!message || message.from?.is_bot || (typeof chatId !== "string" && typeof chatId !== "number") || !fromId || !isOwnerTelegramChat(chatId) || !isOwnerTelegramChat(fromId)) {
    return NextResponse.json({ error: "owner message required" }, { status: 403 });
  }
  const decisionMessageId = message.reply_to_message?.message_id;
  const actionId = telegramDecisionActionIdFromReplyMarkup(message.reply_to_message?.reply_markup);
  const intent = telegramOwnerReplyIntent(message.text);
  if (!decisionMessageId || !actionId || intent.type === "invalid") {
    return NextResponse.json({ received: true, applied: false, reason: "reply_to_decision_required" });
  }
  if (!service) return NextResponse.json({ error: "not configured" }, { status: 503 });
  if (intent.type === "approve" || intent.type === "reject") {
    return applyOwnerDecision({ service, actionId, decision: intent.type, fromId, chatId, decisionMessageId });
  }
  if (intent.type !== "feedback") return NextResponse.json({ received: true, applied: false, reason: "reply_to_decision_required" });
  try {
    const revision = await requestCompanyActionRevision({ service, actionId, feedback: intent.feedback, actorId: `telegram:${fromId}`, channel: "telegram" });
    await finalizeOwnerTelegramDecision({
      chatId,
      messageId: decisionMessageId,
      confirmation: `✏️ Feedback received · ${revision.action.title}\nThe rejected version will not run. ${revision.action.agent_id.replaceAll("_", " ")} has been woken to revise it within the same scope.`,
    });
    return NextResponse.json({ received: true, revisionRequested: true, action: revision.action });
  } catch (error) {
    const stale = error instanceof CompanyDecisionError && ["not_found", "not_pending"].includes(error.code);
    await finalizeOwnerTelegramDecision({
      chatId,
      messageId: decisionMessageId,
      confirmation: stale ? "ℹ️ That action was already decided, so the feedback was not attached." : "⚠️ Feedback was not recorded. Open Company OS and try again.",
      removeButtons: stale,
    });
    return NextResponse.json({ received: true, revisionRequested: false, reason: stale ? "stale" : "failed" });
  }
}
