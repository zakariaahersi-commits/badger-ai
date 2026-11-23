import type { SupabaseClient } from "@supabase/supabase-js";
import { outboundTarget, sendProviderText, type MessagingProvider } from "./provider.ts";
import type { JourneyNudgeReason } from "../sprint-calendar.ts";

export interface ActiveMessagingChannel {
  id: number;
  user_id: string;
  provider: MessagingProvider;
  provider_chat_id: string;
  phone_ciphertext?: string | null;
  status: "active";
  last_inbound_at?: string | null;
}

export function shouldSendFollowUp(lastInboundAt: string | null | undefined, morningSentAt: string | null | undefined): boolean {
  if (!morningSentAt) return false;
  const morning = Date.parse(morningSentAt);
  if (!Number.isFinite(morning)) return false;
  const inbound = lastInboundAt ? Date.parse(lastInboundAt) : Number.NaN;
  return !Number.isFinite(inbound) || inbound <= morning;
}

export async function sendProactiveMessage(
  service: SupabaseClient,
  channel: ActiveMessagingChannel,
  input: { localDate: string; kind: "morning_task" | "follow_up"; body: string; scheduleReason: JourneyNudgeReason },
): Promise<"sent" | "duplicate"> {
  const { data: reservation, error: reserveError } = await service.from("messaging_daily_sends").insert({
    channel_id: channel.id,
    user_id: channel.user_id,
    local_date: input.localDate,
    send_kind: input.kind,
    status: "reserved",
    attempt_count: 1,
  }).select("id").single();
  if (reserveError?.code === "23505") return "duplicate";
  if (reserveError || !reservation) throw new Error("message_reservation_failed");

  try {
    const sent = await sendProviderText(
      channel.provider,
      outboundTarget(channel),
      input.body,
      `proactive:${channel.id}:${input.localDate}:${input.kind}`,
    );
    const now = new Date().toISOString();
    await Promise.all([
      service.from("messaging_daily_sends").update({ status: "sent", provider_message_id: sent.messageId ?? null, sent_at: now }).eq("id", reservation.id),
      service.from("messaging_channels").update({ last_outbound_at: now, updated_at: now }).eq("id", channel.id),
      service.from("messaging_activity").insert({
        channel_id: channel.id,
        user_id: channel.user_id,
        provider: channel.provider,
        direction: "outbound",
        event_kind: "message",
        provider_message_id: sent.messageId ?? null,
        body_length_bucket: input.body.length <= 40 ? "1-40" : input.body.length <= 160 ? "41-160" : input.body.length <= 500 ? "161-500" : "501+",
        metadata: { proactive: true, send_kind: input.kind, local_date: input.localDate, schedule_reason: input.scheduleReason },
      }),
    ]);
    return "sent";
  } catch (error) {
    await service.from("messaging_daily_sends").update({ status: "failed" }).eq("id", reservation.id);
    throw error;
  }
}

export const sendProactiveLinqMessage = sendProactiveMessage;
