import { Resend } from "resend";
import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";
import { renderBoEmail } from "./bo-email.ts";

export interface StandingOrders {
  timezone: string;
  quietStart: string;
  quietEnd: string;
  maxDailyNudges: number;
  minIntervalMinutes: number;
  accountabilityLevel: "gentle" | "direct" | "firm";
  emailEnabled: boolean;
  pushEnabled: boolean;
  pausedUntil: string | null;
}

export interface WakePolicyInput {
  now: Date;
  orders: StandingOrders;
  deliveredInLast24Hours: number;
  lastDeliveredAt: string | null;
}

export type WakePolicyDecision =
  | { decision: "eligible"; reason: "eligible" }
  | { decision: "suppress"; reason: "paused" | "daily_limit" | "notifications_disabled" }
  | { decision: "reschedule"; reason: "quiet_hours" | "cooldown"; retryAt: string };

interface WakeRow {
  id: string;
  user_id: string;
  commitment_id: string | null;
  trigger_type: string;
  scheduled_for: string;
  reason: Record<string, unknown>;
  attempt: number;
  reschedule_count: number;
}

interface WakeMessage {
  title: string;
  body: string;
  url: string;
}

function minutes(value: string): number {
  const match = value.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return 0;
  return Math.min(23, Number(match[1])) * 60 + Math.min(59, Number(match[2]));
}

function localMinutes(date: Date, timezone: string): number {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date);
    const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
    const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
    return hour * 60 + minute;
  } catch {
    return date.getUTCHours() * 60 + date.getUTCMinutes();
  }
}

function inQuietHours(nowMinutes: number, quietStart: number, quietEnd: number): boolean {
  if (quietStart === quietEnd) return false;
  return quietStart < quietEnd
    ? nowMinutes >= quietStart && nowMinutes < quietEnd
    : nowMinutes >= quietStart || nowMinutes < quietEnd;
}

function quietRetryAt(now: Date, nowMinutes: number, quietEnd: number): string {
  let delta = quietEnd - nowMinutes;
  if (delta <= 0) delta += 24 * 60;
  return new Date(now.getTime() + Math.max(15, delta) * 60_000).toISOString();
}

export function evaluateWakePolicy(input: WakePolicyInput): WakePolicyDecision {
  const { now, orders } = input;
  if (orders.pausedUntil && Date.parse(orders.pausedUntil) > now.getTime()) {
    return { decision: "suppress", reason: "paused" };
  }
  if (orders.maxDailyNudges === 0 || (!orders.emailEnabled && !orders.pushEnabled)) {
    return { decision: "suppress", reason: "notifications_disabled" };
  }
  const current = localMinutes(now, orders.timezone);
  const start = minutes(orders.quietStart);
  const end = minutes(orders.quietEnd);
  if (inQuietHours(current, start, end)) {
    return { decision: "reschedule", reason: "quiet_hours", retryAt: quietRetryAt(now, current, end) };
  }
  if (input.deliveredInLast24Hours >= orders.maxDailyNudges) {
    return { decision: "suppress", reason: "daily_limit" };
  }
  const last = input.lastDeliveredAt ? Date.parse(input.lastDeliveredAt) : Number.NaN;
  const nextAllowed = last + orders.minIntervalMinutes * 60_000;
  if (Number.isFinite(last) && nextAllowed > now.getTime()) {
    return { decision: "reschedule", reason: "cooldown", retryAt: new Date(nextAllowed).toISOString() };
  }
  return { decision: "eligible", reason: "eligible" };
}

function validTimezone(value: unknown): string {
  const timezone = typeof value === "string" && value.length <= 80 ? value : "UTC";
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format();
    return timezone;
  } catch {
    return "UTC";
  }
}

function normalizeOrders(row: Record<string, unknown> | null, fallbackTimezone = "UTC"): StandingOrders {
  const accountability = row?.accountability_level;
  return {
    timezone: validTimezone(row?.timezone ?? fallbackTimezone),
    quietStart: typeof row?.quiet_start === "string" ? row.quiet_start : "21:00",
    quietEnd: typeof row?.quiet_end === "string" ? row.quiet_end : "08:00",
    maxDailyNudges: Math.max(0, Math.min(6, Number(row?.max_daily_nudges) || 2)),
    minIntervalMinutes: Math.max(15, Math.min(1440, Number(row?.min_interval_minutes) || 180)),
    accountabilityLevel: accountability === "gentle" || accountability === "firm" ? accountability : "direct",
    emailEnabled: row?.email_enabled !== false,
    pushEnabled: row?.push_enabled !== false,
    pausedUntil: typeof row?.paused_until === "string" ? row.paused_until : null,
  };
}

function safeReason(value: unknown, max = 500): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function messageFor(wake: WakeRow, accountability: StandingOrders["accountabilityLevel"]): WakeMessage {
  const title = safeReason(wake.reason.title, 160) || "Your promise to yourself";
  const outcome = safeReason(wake.reason.outcome, 500);
  const custom = safeReason(wake.reason.message, 500);
  if (custom) return { title: "Bo · one useful move", body: custom, url: "/app/bo" };
  if (wake.trigger_type === "commitment_due") {
    return {
      title: `Bo · ${title}`,
      body: accountability === "gentle"
        ? `This is due now. A smaller honest version still counts.${outcome ? ` ${outcome}` : ""}`
        : `This is due now. Complete it or change the promise honestly.${outcome ? ` ${outcome}` : ""}`,
      url: "/app/bo",
    };
  }
  if (wake.trigger_type === "commitment_missed") {
    return {
      title: "Bo · this promise is still open",
      body: accountability === "firm"
        ? `${title}. No pretending it disappeared. Finish it, reduce it, or tell me what blocked it.`
        : `${title}. What blocked it? We can finish it or make the promise smaller.`,
      url: "/app/bo",
    };
  }
  if (wake.trigger_type === "payment_received") {
    return { title: "Bo · a customer paid", body: "Save why they bought while it is fresh. Then repeat that path once.", url: "/app/bo" };
  }
  if (wake.trigger_type === "customer_reply") {
    return { title: "Bo · a customer replied", body: "There is new evidence waiting. Read it before deciding the next move.", url: "/app/bo" };
  }
  return { title: "Bo · one useful move", body: outcome || "Your next useful move is ready.", url: "/app/bo" };
}

async function recordDelivery(
  service: SupabaseClient,
  wake: WakeRow,
  channel: "in_app" | "push" | "email",
  status: "sent" | "failed" | "suppressed",
  providerId?: string | null,
  errorCode?: string | null,
): Promise<void> {
  const now = new Date().toISOString();
  await service.from("coach_deliveries").upsert({
    user_id: wake.user_id,
    wake_id: wake.id,
    channel,
    status,
    idempotency_key: `${wake.id}:${channel}`,
    provider_id: providerId ?? null,
    error_code: errorCode?.slice(0, 120) ?? null,
    sent_at: status === "sent" ? now : null,
    updated_at: now,
  }, { onConflict: "wake_id,channel" });
}

async function processWake(service: SupabaseClient, wake: WakeRow, now: Date): Promise<{ id: string; status: string; reason?: string }> {
  const { data: claimed, error: claimError } = await service.from("coach_wakes")
    .update({ status: "evaluating", claimed_at: now.toISOString(), attempt: wake.attempt + 1, updated_at: now.toISOString() })
    .eq("id", wake.id).eq("status", "queued").select("id").maybeSingle();
  if (claimError || !claimed) return { id: wake.id, status: "skipped", reason: claimError ? "claim_failed" : "already_claimed" };

  if (wake.commitment_id) {
    const { data: commitment } = await service.from("founder_commitments")
      .select("status").eq("id", wake.commitment_id).eq("user_id", wake.user_id).maybeSingle();
    if (!commitment || commitment.status === "completed" || commitment.status === "cancelled") {
      await service.from("coach_wakes").update({ status: "cancelled", policy_outcome: "commitment_closed", completed_at: now.toISOString(), updated_at: now.toISOString() }).eq("id", wake.id);
      return { id: wake.id, status: "cancelled", reason: "commitment_closed" };
    }
    if (wake.trigger_type === "commitment_missed" && commitment.status === "open") {
      await service.from("founder_commitments").update({ status: "missed", updated_at: now.toISOString() }).eq("id", wake.commitment_id).eq("user_id", wake.user_id);
    }
  }

  const [orderResult, deliveryResult, subscriptionResult, profileResult] = await Promise.all([
    service.from("coach_standing_orders").select("*").eq("user_id", wake.user_id).maybeSingle(),
    service.from("coach_deliveries").select("wake_id, sent_at").eq("user_id", wake.user_id).eq("status", "sent")
      .gte("sent_at", new Date(now.getTime() - 86_400_000).toISOString()).order("sent_at", { ascending: false }).limit(20),
    service.from("push_subscriptions").select("endpoint, p256dh, auth, timezone").eq("user_id", wake.user_id),
    service.from("profiles").select("email, name, notify").eq("user_id", wake.user_id).maybeSingle(),
  ]);
  const subscriptions = subscriptionResult.data ?? [];
  const orders = normalizeOrders(orderResult.data as Record<string, unknown> | null, subscriptions[0]?.timezone ?? "UTC");
  const deliveries = deliveryResult.data ?? [];
  const policy = evaluateWakePolicy({
    now,
    orders,
    deliveredInLast24Hours: new Set(deliveries.map((delivery) => delivery.wake_id)).size,
    lastDeliveredAt: deliveries[0]?.sent_at ?? null,
  });
  if (policy.decision === "suppress") {
    await service.from("coach_wakes").update({ status: "suppressed", policy_outcome: policy.reason, completed_at: now.toISOString(), updated_at: now.toISOString() }).eq("id", wake.id);
    return { id: wake.id, status: "suppressed", reason: policy.reason };
  }
  if (policy.decision === "reschedule") {
    const reschedules = Math.min(24, wake.reschedule_count + 1);
    await service.from("coach_wakes").update({
      status: reschedules >= 24 ? "suppressed" : "queued",
      policy_outcome: policy.reason,
      scheduled_for: policy.retryAt,
      reschedule_count: reschedules,
      claimed_at: null,
      completed_at: reschedules >= 24 ? now.toISOString() : null,
      updated_at: now.toISOString(),
    }).eq("id", wake.id);
    return { id: wake.id, status: reschedules >= 24 ? "suppressed" : "rescheduled", reason: policy.reason };
  }

  await service.from("coach_wakes").update({ status: "delivering", policy_outcome: "eligible", updated_at: now.toISOString() }).eq("id", wake.id);
  const message = messageFor(wake, orders.accountabilityLevel);
  await recordDelivery(service, wake, "in_app", "sent");
  let externalSent = 0;

  const resendKey = process.env.RESEND_API_KEY;
  const email = typeof profileResult.data?.email === "string" ? profileResult.data.email : "";
  if (orders.emailEnabled && profileResult.data?.notify && resendKey && email) {
    try {
      const resend = new Resend(resendKey);
      const appUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://badger.example.com";
      const from = process.env.NUDGE_FROM ?? "Bo at Badger AI <onboarding@resend.dev>";
      const emailContent = renderBoEmail({
        name: typeof profileResult.data?.name === "string" ? profileResult.data.name : null,
        preview: message.body,
        paragraphs: [message.body],
        action: { label: "Reply to Bo", href: appUrl + message.url },
        footer: "You asked me to keep you accountable. You can change email check-ins in Settings.",
      });
      const { data, error } = await resend.emails.send({
        from,
        to: email,
        subject: message.title,
        html: emailContent.html,
        text: emailContent.text,
        tags: [
          { name: "user_id", value: wake.user_id },
          { name: "category", value: "coach_wake" },
        ],
      }, { idempotencyKey: `bo-wake/${wake.id}/email` });
      if (error) throw new Error(`resend_${error.name ?? "error"}`);
      await recordDelivery(service, wake, "email", "sent", data?.id ?? null);
      externalSent += 1;
    } catch (error) {
      await recordDelivery(service, wake, "email", "failed", null, error instanceof Error ? error.message : "email_failed");
    }
  }

  const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  if (orders.pushEnabled && vapidPublic && vapidPrivate && subscriptions.length) {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? process.env.NEXT_PUBLIC_SITE_URL ?? "mailto:support@badger.example.com", vapidPublic, vapidPrivate);
    let pushSent = 0;
    for (const subscription of subscriptions) {
      try {
        await webpush.sendNotification({
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        }, JSON.stringify({ title: message.title, body: message.body, url: message.url, tag: `bo-wake-${wake.id}` }));
        pushSent += 1;
      } catch (error) {
        const statusCode = typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : 0;
        if (statusCode === 404 || statusCode === 410) {
          await service.from("push_subscriptions").delete().eq("endpoint", subscription.endpoint).eq("user_id", wake.user_id);
        }
      }
    }
    await recordDelivery(service, wake, "push", pushSent ? "sent" : "failed", pushSent ? String(pushSent) : null, pushSent ? null : "push_failed");
    if (pushSent) externalSent += 1;
  }

  await service.from("coach_wakes").update({
    status: "delivered",
    policy_outcome: externalSent ? "external_and_in_app" : "in_app_only",
    completed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", wake.id);
  return { id: wake.id, status: "delivered", reason: externalSent ? "external_and_in_app" : "in_app_only" };
}

export async function processDueWakes(service: SupabaseClient, limit = 25): Promise<{ processed: number; results: { id: string; status: string; reason?: string }[] }> {
  const now = new Date();
  const { data, error } = await service.from("coach_wakes")
    .select("id, user_id, commitment_id, trigger_type, scheduled_for, reason, attempt, reschedule_count")
    .eq("status", "queued").lt("attempt", 5).lte("scheduled_for", now.toISOString()).order("scheduled_for").limit(Math.max(1, Math.min(50, limit)));
  if (error) throw new Error(`wake_queue_unavailable:${error.message}`);
  const results = [];
  for (const wake of (data ?? []) as WakeRow[]) results.push(await processWake(service, wake, now));
  return { processed: results.length, results };
}
