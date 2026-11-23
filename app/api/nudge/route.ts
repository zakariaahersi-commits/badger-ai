import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import webpush from "web-push";
import { renderBoEmail } from "@/lib/bo-email";
import { cleanTaskTitle, dailyMailCopy } from "@/lib/nudge-copy";
import { buildFallbackPlan } from "@/lib/planEngine";
import { calendarSprintDay, journeyNudgeReason, localSchedule, scheduledNudgeHour } from "@/lib/sprint-calendar";
import type { Profile } from "@/lib/types";
import { messagingConfigured } from "@/lib/messaging/crypto";
import { sendProactiveMessage, shouldSendFollowUp, type ActiveMessagingChannel } from "@/lib/messaging/nudge";
import { drainMessagingEvents } from "@/lib/messaging/drain";

// Bo's regular check-ins. The cron runs hourly, then each founder is filtered
// by their timezone and the weekdays they selected during onboarding.

export const runtime = "nodejs";
export const maxDuration = 60;

interface SprintState {
  tasks?: { day: number; title: string; minutes: number; type: string }[];
  logs?: Record<string, { day: number }>;
  profile?: Profile;
}

function missedBefore(day: number, logs: Record<string, { day: number }>): number {
  let n = 0;
  for (let d = day - 1; d >= 1; d--) {
    if (logs[String(d)] || logs[d]) break;
    n++;
  }
  return n;
}

function checkpointName(day: number): string | null {
  if (day === 7) return "Week 1 check-in";
  if (day === 14) return "midpoint decision";
  if (day === 21) return "final-week check-in";
  if (day === 28) return "final decision";
  return null;
}

type StandingOrderRow = {
  user_id: string;
  timezone?: string;
  quiet_start?: string;
  quiet_end?: string;
  email_enabled?: boolean;
  push_enabled?: boolean;
};

export async function GET(req: NextRequest) {
  // Vercel cron sends Authorization: Bearer CRON_SECRET when configured.
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const edition = req.nextUrl.searchParams.get("edition") === "evening" ? "evening" : "morning";

  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supaUrl || !serviceKey) {
    return NextResponse.json({ configured: false, edition, emailSent: 0, pushSent: 0 });
  }

  const sb = createClient(supaUrl, serviceKey);
  const resendKey = process.env.RESEND_API_KEY;
  const resend = resendKey ? new Resend(resendKey) : null;
  const appUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://badger.example.com";
  const from = process.env.NUDGE_FROM ?? "Bo at Badger AI <onboarding@resend.dev>";
  const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  const pushReady = Boolean(vapidPublic && vapidPrivate);
  const messagingReady = messagingConfigured();
  const messagingEventsProcessed = messagingReady ? await drainMessagingEvents(sb).catch(() => 0) : 0;
  if (pushReady) webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? appUrl, vapidPublic!, vapidPrivate!);
  if (!resend && !pushReady && !messagingReady) {
    return NextResponse.json({ configured: false, edition, emailSent: 0, pushSent: 0, imessageSent: 0 });
  }

  const { data: profiles, error } = await sb
    .from("profiles")
    .select("user_id, email, name, notify")
    .not("email", "is", null);
  if (error) return NextResponse.json({ configured: true, error: error.message }, { status: 500 });

  // Pull each builder's synced sprint so the email talks about their actual
  // task and their actual streak, not a generic line.
  const ids = (profiles ?? []).map((p) => p.user_id);
  const states = new Map<string, SprintState>();
  const ordersByUser = new Map<string, StandingOrderRow>();
  const startsByUser = new Map<string, string>();
  const messagingByUser = new Map<string, ActiveMessagingChannel>();
  if (ids.length) {
    const [{ data: sprints }, { data: orders }, { data: entitlements }, { data: messagingChannels }] = await Promise.all([
      sb.from("sprints").select("user_id, state").in("user_id", ids),
      sb.from("coach_standing_orders").select("user_id, timezone, quiet_start, quiet_end, email_enabled, push_enabled").in("user_id", ids),
      sb.from("entitlements").select("user_id, granted_at").eq("product", "badger-28-day").eq("status", "active").in("user_id", ids),
      messagingReady
        ? sb.from("messaging_channels").select("id, user_id, provider, provider_chat_id, phone_ciphertext, status, last_inbound_at").eq("status", "active").in("user_id", ids)
        : Promise.resolve({ data: [] }),
    ]);
    for (const s of sprints ?? []) states.set(s.user_id as string, (s.state ?? {}) as SprintState);
    for (const order of orders ?? []) ordersByUser.set(order.user_id as string, order as StandingOrderRow);
    for (const entitlement of entitlements ?? []) {
      if (entitlement.granted_at) startsByUser.set(entitlement.user_id as string, entitlement.granted_at as string);
    }
    for (const channel of messagingChannels ?? []) messagingByUser.set(channel.user_id as string, channel as ActiveMessagingChannel);
  }

  const pushByUser = new Map<string, { endpoint: string; p256dh: string; auth: string; timezone?: string }[]>();
  if (pushReady && ids.length) {
    const { data: subscriptions } = await sb
      .from("push_subscriptions")
      .select("user_id, endpoint, p256dh, auth, timezone")
      .in("user_id", ids);
    for (const subscription of subscriptions ?? []) {
      const userId = subscription.user_id as string;
      const list = pushByUser.get(userId) ?? [];
      list.push({ endpoint: subscription.endpoint, p256dh: subscription.p256dh, auth: subscription.auth, timezone: subscription.timezone });
      pushByUser.set(userId, list);
    }
  }

  let emailSent = 0;
  let pushSent = 0;
  let imessageSent = 0;
  const failures: string[] = [];
  const now = new Date();
  for (const p of profiles ?? []) {
    const paidStart = startsByUser.get(p.user_id as string);
    if (!paidStart) continue;
    const st = states.get(p.user_id as string) ?? {};
    const orders = ordersByUser.get(p.user_id as string);
    const timezone = st.profile?.timezone || orders?.timezone || pushByUser.get(p.user_id as string)?.[0]?.timezone || "UTC";
    const local = localSchedule(now, timezone);
    const targetHour = scheduledNudgeHour(edition, orders?.quiet_start, orders?.quiet_end);
    if (local.hour !== targetHour) continue;
    const day = calendarSprintDay(paidStart, now, timezone);
    if (day > 28) continue;
    const scheduleReason = journeyNudgeReason(st.profile?.days, local.weekday, day);
    if (!scheduleReason) continue;
    const logs = (st.logs ?? {}) as Record<string, { day: number }>;
    const task = (st.tasks ?? []).find((t) => t.day === day);
    const fallbackTask = st.profile ? buildFallbackPlan(st.profile)[day - 1] : undefined;
    const taskTitle = cleanTaskTitle(task?.title) ?? fallbackTask?.title ?? "open Badger AI and complete today’s step";
    const ctx = {
      day,
      name: p.name || "builder",
      taskTitle,
      minutes: task?.minutes ?? 30,
      missed: missedBefore(day, logs),
      loggedToday: Boolean(logs[String(day)] || logs[day]),
    };
    // Evening edition is the account-for touch: only chase the unlogged.
    if (edition === "evening" && ctx.loggedToday) continue;
    if (edition === "evening" && (day === 14 || day === 28)) continue; // decision days handle themselves
    const mail = dailyMailCopy(edition, ctx);
    const checkpoint = checkpointName(day);
    const messagingChannel = messagingByUser.get(p.user_id as string);
    if (messagingChannel) {
      try {
        if (edition === "morning" && !ctx.loggedToday) {
          const result = await sendProactiveMessage(sb, messagingChannel, {
            localDate: local.dateKey,
            kind: "morning_task",
            scheduleReason,
            body: `Bo · Day ${day}${checkpoint ? ` · ${checkpoint}` : ""}\n\n${taskTitle}\n\n${ctx.minutes} minutes. Reply NOW, LATER or STUCK.`,
          });
          if (result === "sent") imessageSent++;
        }
        if (edition === "evening" && !ctx.loggedToday) {
          const { data: morning } = await sb.from("messaging_daily_sends")
            .select("sent_at")
            .eq("channel_id", messagingChannel.id)
            .eq("local_date", local.dateKey)
            .eq("send_kind", "morning_task")
            .eq("status", "sent")
            .maybeSingle();
          if (shouldSendFollowUp(messagingChannel.last_inbound_at, morning?.sent_at)) {
            const result = await sendProactiveMessage(sb, messagingChannel, {
              localDate: local.dateKey,
              kind: "follow_up",
              scheduleReason,
              body: `Quick check: did Day ${day} happen, get blocked, or get avoided? Reply DONE or STUCK. No speech needed.`,
            });
            if (result === "sent") imessageSent++;
          }
        }
      } catch (e) {
        failures.push(`${p.user_id}: iMessage ${e instanceof Error ? e.message : "send failed"}`);
      }
      // iMessage is the pilot's complete coaching interface. Avoid stacking
      // the same nudge over email and push for founders who connected it.
      continue;
    }
    if (resend && p.notify && orders?.email_enabled !== false) {
      try {
        const emailContent = renderBoEmail({
          name: p.name,
          preview: mail.paragraphs[0],
          paragraphs: mail.paragraphs,
          action: {
            label: edition === "evening" ? "Send me today's result" : "Open today's step",
            href: `${appUrl}/app`,
          },
          footer: scheduleReason === "checkpoint"
            ? "This is a key checkpoint in your 28-day journey. Regular check-ins follow the days you chose in Badger AI."
            : "You chose your regular check-in days in Badger AI. You can change them in Settings.",
        });
        const { error: sendError } = await resend.emails.send({
          from,
          to: p.email,
          subject: mail.subject,
          html: emailContent.html,
          text: emailContent.text,
          tags: [
            { name: "user_id", value: p.user_id },
            { name: "category", value: `daily_${edition}` },
          ],
        }, { idempotencyKey: `daily-nudge/${edition}/${p.user_id}/${local.dateKey}` });
        if (sendError) throw new Error(sendError.name ?? "send failed");
        emailSent++;
      } catch (e) {
        failures.push(`${p.user_id}: email ${e instanceof Error ? e.message : "send failed"}`);
      }
    }

    if (orders?.push_enabled === false) continue;
    for (const subscription of pushByUser.get(p.user_id as string) ?? []) {
      try {
        await webpush.sendNotification({
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        }, JSON.stringify({
          title: `Bo · Day ${day}`,
          body: edition === "evening"
            ? "How did today’s step go? Reply with the result or tell Bo what blocked you."
            : taskTitle,
          url: "/app",
          tag: `bo-${edition}-${day}`,
        }));
        pushSent++;
      } catch (e) {
        const statusCode = typeof e === "object" && e && "statusCode" in e ? Number(e.statusCode) : 0;
        if (statusCode === 404 || statusCode === 410) {
          await sb.from("push_subscriptions").delete().eq("endpoint", subscription.endpoint);
        } else {
          failures.push(`${p.user_id}: push failed`);
        }
      }
    }
  }

  return NextResponse.json({ configured: true, edition, emailSent, pushSent, imessageSent, messagingEventsProcessed, failures });
}
