import type { SupabaseClient } from "@supabase/supabase-js";
import { runCoachTurn } from "../coach-service.ts";
import type { SprintTask, TaskLog } from "../types.ts";
import { appendChat, coachContextFromSprint, loadSprintSnapshot, saveSprintSnapshot, sprintDay, type SprintSnapshot } from "./context.ts";
import { bodyLengthBucket, normalizePhone, privateDigest, protectText } from "./crypto.ts";
import { parseLinqEvent } from "./linq.ts";
import { inboundReplyTarget, outboundTarget, sendProviderText, startProviderTyping, type MessagingInboundEvent, type MessagingProvider } from "./provider.ts";
import { parseSendblueEvent } from "./sendblue.ts";
import { hasActiveMessagingAccess } from "./access.ts";
import { commandMessageBody, messagingCommand, type PilotCommand } from "./commands.ts";
import { IMESSAGE_RECONNECT_EVENT_KEY } from "./recovery-policy.ts";

type ChannelStatus = "active" | "paused" | "opted_out";
type ConversationState = "coaching" | "awaiting_done_learning";

interface MessagingChannel {
  id: number;
  user_id: string;
  provider: MessagingProvider;
  provider_chat_id: string;
  phone_ciphertext?: string | null;
  status: ChannelStatus;
  timezone: string;
  conversation_state: ConversationState;
  last_inbound_at?: string | null;
  last_outbound_at?: string | null;
}

function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : "processing_failed").replace(/[^a-zA-Z0-9_.:-]/g, "_").slice(0, 500);
}

async function activity(service: SupabaseClient, input: {
  provider: MessagingProvider;
  channelId?: number;
  userId?: string;
  direction: "inbound" | "outbound" | "system";
  eventKind: "linked" | "message" | "command" | "evidence" | "delivered" | "read" | "failed" | "paused" | "resumed" | "opted_out";
  providerMessageId?: string;
  command?: PilotCommand;
  bodyLength?: number;
  metadata?: Record<string, unknown>;
}) {
  await service.from("messaging_activity").insert({
    channel_id: input.channelId ?? null,
    user_id: input.userId ?? null,
    provider: input.provider,
    direction: input.direction,
    event_kind: input.eventKind,
    provider_message_id: input.providerMessageId ?? null,
    command: input.command ?? null,
    body_length_bucket: input.bodyLength === undefined ? null : bodyLengthBucket(input.bodyLength),
    metadata: input.metadata ?? {},
  });
}

async function sendReply(
  service: SupabaseClient,
  provider: MessagingProvider,
  event: MessagingInboundEvent,
  body: string,
  idempotencyKey: string,
  channel?: MessagingChannel,
): Promise<void> {
  const target = channel ? outboundTarget(channel) : inboundReplyTarget(provider, event);
  const sent = await sendProviderText(provider, target, body, idempotencyKey);
  if (channel) {
    await service.from("messaging_channels").update({
      last_outbound_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", channel.id);
  }
  await activity(service, {
    provider,
    channelId: channel?.id,
    userId: channel?.user_id,
    direction: "outbound",
    eventKind: "message",
    providerMessageId: sent.messageId,
    bodyLength: body.length,
  });
}

function currentTask(snapshot: SprintSnapshot): { day: number; task?: SprintTask; log?: TaskLog } {
  const day = sprintDay(snapshot);
  return { day, task: snapshot.tasks?.find((entry) => entry.day === day), log: snapshot.logs?.[String(day)] };
}

function todayMessage(snapshot: SprintSnapshot): string {
  const { day, task, log } = currentTask(snapshot);
  if (!task) return `I can't see your Day ${day} task right now. Open Badger and refresh your plan: ${appOrigin()}/app/plan`;
  if (log) return `Day ${day} is logged. You wrote: “${log.did.slice(0, 400)}”\n\nOpen your progress: ${appOrigin()}/app/activity`;
  return `Your Day ${day} task (${task.minutes} min): ${task.title}\n\nWhat counts: ${task.verify}\n\nReply NOW, LATER, or STUCK.`;
}

function welcomeMessage(snapshot: SprintSnapshot): string {
  const name = snapshot.profile?.name?.trim() || "Founder";
  const { day, task } = currentTask(snapshot);
  const taskLine = task
    ? `Your Day ${day} task takes ${task.minutes} minutes: ${task.title}`
    : `Open Badger to see your Day ${day} task: ${appOrigin()}/app`;
  return `${name}, it’s Bo. I’ve got your idea, your goal and the thing you said keeps stopping you.\n\n${taskLine}\n\nAre you doing it now, later today, or avoiding it?`;
}

async function loadChannel(service: SupabaseClient, provider: MessagingProvider, phoneHash: string): Promise<MessagingChannel | null> {
  const { data, error } = await service.from("messaging_channels")
    .select("id, user_id, provider, provider_chat_id, phone_ciphertext, status, timezone, conversation_state, last_inbound_at, last_outbound_at")
    .eq("provider", provider)
    .eq("phone_hash", phoneHash)
    .maybeSingle();
  if (error) throw new Error("channel_lookup_failed");
  return data as MessagingChannel | null;
}

async function linkChannel(service: SupabaseClient, provider: MessagingProvider, event: MessagingInboundEvent, code: string): Promise<MessagingChannel | null> {
  const sender = normalizePhone(event.sender);
  if (!sender) return null;
  const now = new Date().toISOString();
  const codeDigest = privateDigest(code.toUpperCase());
  const { data: link, error: linkError } = await service.from("messaging_link_codes")
    .select("id, user_id")
    .eq("provider", provider)
    .eq("code_digest", codeDigest)
    .is("used_at", null)
    .gt("expires_at", now)
    .maybeSingle();
  if (linkError) throw new Error("link_lookup_failed");
  if (!link) return null;

  const { data: entitlement, error: accessError } = await service.from("entitlements")
    .select("status")
    .eq("user_id", link.user_id)
    .eq("product", "badger-28-day")
    .maybeSingle();
  if (accessError) throw new Error("access_check_failed");
  if (entitlement?.status !== "active") return null;

  const snapshot = await loadSprintSnapshot(service, link.user_id);
  const timezone = snapshot?.profile?.timezone || "UTC";
  const phoneHash = privateDigest(sender);
  const row = {
    user_id: link.user_id,
    provider,
    provider_chat_id: provider === "sendblue" ? phoneHash : event.chatId,
    phone_hash: phoneHash,
    phone_ciphertext: protectText(sender),
    status: "active",
    consent_at: now,
    paused_at: null,
    opted_out_at: null,
    timezone,
    conversation_state: "coaching",
    last_inbound_at: now,
    updated_at: now,
  };
  const { data: channel, error: channelError } = await service.from("messaging_channels")
    .upsert(row, { onConflict: "user_id,provider" })
    .select("id, user_id, provider, provider_chat_id, phone_ciphertext, status, timezone, conversation_state, last_inbound_at, last_outbound_at")
    .single();
  if (channelError) {
    if (channelError.code === "23505") throw new Error("phone_already_linked");
    throw new Error("channel_link_failed");
  }
  await service.from("messaging_link_codes").update({ used_at: now }).eq("id", link.id).is("used_at", null);
  await activity(service, { provider, channelId: channel.id, userId: channel.user_id, direction: "system", eventKind: "linked", command: "START" });
  const { data: recovery } = await service.from("domain_events")
    .select("id")
    .eq("user_id", channel.user_id)
    .eq("idempotency_key", IMESSAGE_RECONNECT_EVENT_KEY)
    .maybeSingle();
  await service.from("product_events").insert({
    user_id: channel.user_id,
    event_name: "imessage_connected",
    path: "/app",
    properties: { provider, source: recovery ? "reconnect_email" : "direct" },
  });
  return channel as MessagingChannel;
}

async function saveEvidence(service: SupabaseClient, channel: MessagingChannel, event: MessagingInboundEvent, snapshot: SprintSnapshot): Promise<void> {
  if (!event.media.length) return;
  const { day, task } = currentTask(snapshot);
  for (const [index, media] of event.media.slice(0, 4).entries()) {
    await service.from("evidence_records").insert({
      user_id: channel.user_id,
      day_num: day,
      claim_type: task?.type ?? "other",
      source_type: "screenshot",
      status: "submitted",
      claim_summary: `Screenshot sent to Bo for Day ${day}`,
      source_url: media.url.slice(0, 2_000),
      external_ref: `${event.messageId}:${index}`.slice(0, 500),
      occurred_at: new Date().toISOString(),
      metadata: { provider: channel.provider, filename: media.filename, mime_type: media.mimeType },
    });
  }
  await activity(service, { provider: channel.provider, channelId: channel.id, userId: channel.user_id, direction: "inbound", eventKind: "evidence", providerMessageId: event.messageId, metadata: { count: event.media.length, day } });
}

async function handleKnownChannel(service: SupabaseClient, channel: MessagingChannel, event: MessagingInboundEvent): Promise<void> {
  const now = new Date().toISOString();
  const command = messagingCommand(event.text);
  await service.from("messaging_channels").update({ last_inbound_at: now, updated_at: now }).eq("id", channel.id);
  await activity(service, { provider: channel.provider, channelId: channel.id, userId: channel.user_id, direction: "inbound", eventKind: command ? "command" : "message", providerMessageId: event.messageId, command: command ?? undefined, bodyLength: event.text.length, metadata: { media_count: event.media.length } });

  if (command === "STOP") {
    await service.from("messaging_channels").update({ status: "opted_out", opted_out_at: now, paused_at: null, updated_at: now }).eq("id", channel.id);
    await activity(service, { provider: channel.provider, channelId: channel.id, userId: channel.user_id, direction: "system", eventKind: "opted_out", command: "STOP" });
    await sendReply(service, channel.provider, event, "You’re opted out. Bo won’t message you again. Your plan and data stay in Badger, and you can delete or restart them in Settings.", `${event.eventId}:stop`, channel);
    return;
  }
  if (command === "PAUSE") {
    await service.from("messaging_channels").update({ status: "paused", paused_at: now, opted_out_at: null, updated_at: now }).eq("id", channel.id);
    await activity(service, { provider: channel.provider, channelId: channel.id, userId: channel.user_id, direction: "system", eventKind: "paused", command: "PAUSE" });
    await sendReply(service, channel.provider, event, "Paused. I won’t send proactive messages. Text RESUME whenever you want me back.", `${event.eventId}:pause`, channel);
    return;
  }
  if (channel.status === "opted_out") {
    await sendReply(service, channel.provider, event, "You opted out. Open Badger and create a new connection code if you want to reconnect.", `${event.eventId}:inactive`, channel);
    return;
  }
  if (channel.status === "paused" && command !== "RESUME") {
    await sendReply(service, channel.provider, event, "Your coaching is paused. Text RESUME to continue.", `${event.eventId}:inactive`, channel);
    return;
  }

  const hasAccess = await hasActiveMessagingAccess(service, channel.user_id);
  if (!hasAccess) {
    if (channel.status !== "paused") {
      await service.from("messaging_channels").update({ status: "paused", paused_at: now, opted_out_at: null, updated_at: now }).eq("id", channel.id);
      await activity(service, { provider: channel.provider, channelId: channel.id, userId: channel.user_id, direction: "system", eventKind: "paused" });
    }
    await sendReply(service, channel.provider, event, `Your Badger access is not active, so I can’t continue coaching in iMessage. Open Badger to review your account: ${appOrigin()}/app/profile`, `${event.eventId}:access`, channel);
    return;
  }

  if (command === "RESUME") {
    await service.from("messaging_channels").update({ status: "active", paused_at: null, opted_out_at: null, consent_at: now, updated_at: now }).eq("id", channel.id);
    await activity(service, { provider: channel.provider, channelId: channel.id, userId: channel.user_id, direction: "system", eventKind: "resumed", command: "RESUME" });
    channel.status = "active";
    await sendReply(service, channel.provider, event, "I’m back. One task, one honest result. Text TODAY for your current step or tell me what’s getting in the way.", `${event.eventId}:resume`, channel);
    return;
  }
  let snapshot = await loadSprintSnapshot(service, channel.user_id);
  if (!snapshot?.profile) {
    await sendReply(service, channel.provider, event, `I can’t load your journey safely right now. Open Badger and refresh: ${appOrigin()}/app`, `${event.eventId}:missing-sprint`, channel);
    return;
  }
  await saveEvidence(service, channel, event, snapshot);

  if (command === "TODAY") {
    await sendReply(service, channel.provider, event, todayMessage(snapshot), `${event.eventId}:today`, channel);
    return;
  }
  if (command === "PLAN") {
    await sendReply(service, channel.provider, event, `Your full 28-day plan is here:\n${appOrigin()}/app/plan`, `${event.eventId}:plan`, channel);
    return;
  }
  if (command === "DONE") {
    const inlineLearning = commandMessageBody(event.text, "DONE");
    if (!inlineLearning) {
      await service.from("messaging_channels").update({ conversation_state: "awaiting_done_learning", updated_at: now }).eq("id", channel.id);
      await sendReply(service, channel.provider, event, "Good. What actually happened—and what did you learn? Send the result in one message. You can attach a screenshot as evidence.", `${event.eventId}:done`, channel);
      return;
    }
  }

  let coachMessage = event.text;
  const inlineDoneLearning = command === "DONE" ? commandMessageBody(event.text, "DONE") : "";
  if (channel.conversation_state === "awaiting_done_learning" || inlineDoneLearning) {
    coachMessage = inlineDoneLearning || coachMessage;
    if (!coachMessage) {
      await sendReply(service, channel.provider, event, "I got the screenshot. Now tell me what happened and what you learned so I can log the task honestly.", `${event.eventId}:need-learning`, channel);
      return;
    }
    const { day } = currentTask(snapshot);
    const logs = { ...(snapshot.logs ?? {}) };
    logs[String(day)] = {
      day,
      did: coachMessage.slice(0, 1_000),
      learned: coachMessage.slice(0, 1_000),
      next: "",
      proof: event.media.length ? `Screenshot received via iMessage (${event.messageId})` : undefined,
      loggedAt: now,
    };
    snapshot = { ...snapshot, logs };
    await service.from("product_events").insert({
      user_id: channel.user_id,
      event_name: "task_completed",
      path: "/app",
      properties: { source: "imessage", day, evidence: event.media.length > 0 },
    });
    await service.from("messaging_channels").update({ conversation_state: "coaching", updated_at: now }).eq("id", channel.id);
    channel.conversation_state = "coaching";
    coachMessage = `I completed today's task. Here is what happened and what I learned: ${coachMessage}`;
  } else if (command === "STUCK") {
    coachMessage = commandMessageBody(event.text, "STUCK") || "I'm stuck on today's task. Help me make it smaller without letting me avoid the real learning.";
  }
  if (!coachMessage && event.media.length) {
    await sendReply(service, channel.provider, event, "I received the screenshot as evidence. Tell me what it proves or what happened, and I’ll connect it to your next step.", `${event.eventId}:evidence`, channel);
    return;
  }
  if (!coachMessage) return;

  snapshot = appendChat(snapshot, "me", event.text || "[Screenshot attached]");
  await startProviderTyping(channel.provider, outboundTarget(channel));
  const result = await runCoachTurn(
    { userId: channel.user_id, service },
    coachContextFromSprint(snapshot, coachMessage, `${channel.provider}:${event.eventId}`),
  );
  const reply = typeof result.body.reply === "string" ? result.body.reply : "I’m here. Say that once more and I’ll meet the exact thing you’re stuck on.";
  const actions = Array.isArray(result.body.actions) ? result.body.actions : [];
  const outbound = actions.length
    ? `${reply}\n\nI prepared an action for your approval. Review it safely in Badger: ${appOrigin()}/app/bo`
    : reply;
  snapshot = appendChat(snapshot, "bo", outbound);
  await saveSprintSnapshot(service, channel.user_id, snapshot);
  await sendReply(service, channel.provider, event, outbound, `${event.eventId}:coach`, channel);
}

async function handleMessageReceived(service: SupabaseClient, provider: MessagingProvider, event: MessagingInboundEvent): Promise<void> {
  if (event.isGroup || event.service.toLowerCase() !== "imessage") return;
  const sender = normalizePhone(event.sender);
  if (!sender || !event.chatId || !event.messageId) return;
  const phoneHash = privateDigest(sender);
  let channel = await loadChannel(service, provider, phoneHash);
  const startMatch = /^START\s+([2-9A-HJ-NP-Z]{4,10})\s*$/i.exec(event.text);
  if (startMatch) {
    try {
      channel = await linkChannel(service, provider, event, startMatch[1]);
    } catch (error) {
      const message = safeError(error) === "phone_already_linked"
        ? "This phone is already connected to another Badger account. Disconnect it there before trying again."
        : "That connection didn’t complete. Open Badger and generate a fresh code, then text it exactly as shown.";
      await sendReply(service, provider, event, message, `${event.eventId}:link-error`, channel ?? undefined);
      return;
    }
    if (!channel) {
      await sendReply(service, provider, event, "That code is invalid or expired. Open Badger and generate a fresh code—it lasts 15 minutes.", `${event.eventId}:expired`);
      return;
    }
    const snapshot = await loadSprintSnapshot(service, channel.user_id);
    await sendReply(service, provider, event, snapshot ? welcomeMessage(snapshot) : "You’re connected. Open Badger once so I can load your journey, then text TODAY.", `${event.eventId}:welcome`, channel);
    return;
  }
  if (!channel) {
    await sendReply(service, provider, event, "I can’t connect this number without your one-time code. Open Badger, tap Connect iMessage, then text START plus the code.", `${event.eventId}:unlinked`);
    return;
  }
  await handleKnownChannel(service, channel, event);
}

export async function processMessagingWebhookEvent(service: SupabaseClient, provider: MessagingProvider, eventRowId: number, payload: unknown): Promise<void> {
  const parsed = provider === "sendblue" ? parseSendblueEvent(payload) : parseLinqEvent(payload);
  const startedAt = new Date().toISOString();
  const { data: current } = await service.from("messaging_webhook_events").select("attempt_count").eq("id", eventRowId).in("status", ["queued", "failed"]).maybeSingle();
  if (!current || Number(current.attempt_count) >= 3) return;
  const attempt = Number(current.attempt_count) + 1;
  const { data: claimed } = await service.from("messaging_webhook_events")
    .update({ status: "processing", attempt_count: attempt, last_error: null })
    .eq("id", eventRowId)
    .in("status", ["queued", "failed"])
    .select("id")
    .maybeSingle();
  if (!claimed) return;
  try {
    if (!parsed) throw new Error("invalid_event");
    if (parsed.eventType === "message.received") {
      await handleMessageReceived(service, provider, parsed);
    } else if (["message.delivered", "message.read", "message.failed"].includes(parsed.eventType)) {
      const providerChatId = provider === "sendblue" ? privateDigest(parsed.sender) : parsed.chatId;
      const { data: channel } = await service.from("messaging_channels").select("id, user_id").eq("provider", provider).eq("provider_chat_id", providerChatId).maybeSingle();
      if (channel) {
        await activity(service, {
          provider,
          channelId: channel.id,
          userId: channel.user_id,
          direction: "system",
          eventKind: parsed.eventType === "message.delivered" ? "delivered" : parsed.eventType === "message.read" ? "read" : "failed",
          providerMessageId: parsed.messageId,
        });
      }
    }
    await service.from("messaging_webhook_events").update({ status: "processed", processed_at: new Date().toISOString(), last_error: null, payload_ciphertext: protectText("{}") }).eq("id", eventRowId);
  } catch (error) {
    await service.from("messaging_webhook_events").update({ status: "failed", last_error: safeError(error), processed_at: null, ...(attempt >= 3 ? { payload_ciphertext: protectText("{}") } : {}) }).eq("id", eventRowId);
    console.error("[messaging] webhook processing failed", { eventRowId, startedAt, error: safeError(error) });
  }
}

export async function processLinqWebhookEvent(service: SupabaseClient, eventRowId: number, payload: unknown): Promise<void> {
  return processMessagingWebhookEvent(service, "linq", eventRowId, payload);
}

function appOrigin(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000").replace(/\/$/, "");
}
