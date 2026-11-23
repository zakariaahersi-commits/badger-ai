import "server-only";

import { Resend } from "resend";
import type { SupabaseClient } from "@supabase/supabase-js";
import { renderBoEmail } from "./bo-email.ts";
import { emailUnsubscribeUrl } from "./email-preferences.ts";
import { FIRST_RECOVERY_MS, JOURNEY_RECOVERY_LOOKBACK_MS, journeyReadyReminderDue, latestJourneyRecoveryCandidates, recoveryReminderDue } from "./checkout-recovery-policy.ts";
import { hasRecoveryConsent } from "./recovery-consent.ts";
import { processMessagingReconnects } from "./messaging/recovery.ts";

const JOURNEY_RECOVERY_LIMIT = 20;

type RecoveryRow = {
  user_id: string;
  checkout_started_at: string;
  reminder_count: number;
};

type JourneyRecoveryResult = { examined: number; sent: number; skipped: number };
type OnboardingRecoveryRow = {
  user_id: string;
  track: "undecided" | "A" | "B" | "C";
  remind_at: string;
  reminder_count: number;
};

async function processOnboardingRecoveries(
  service: SupabaseClient,
  resend: Resend,
  from: string,
  appUrl: string,
  now: Date,
): Promise<JourneyRecoveryResult> {
  const rows = await service.from("onboarding_recoveries")
    .select("user_id, track, remind_at, reminder_count")
    .eq("status", "pending")
    .eq("reminder_count", 0)
    .lte("remind_at", now.toISOString())
    .order("remind_at")
    .limit(20);
  if (rows.error) throw new Error("onboarding_recovery_unavailable");
  if (!rows.data?.length) return { examined: 0, sent: 0, skipped: 0 };

  const recoveries = rows.data as OnboardingRecoveryRow[];
  const ids = recoveries.map((row) => row.user_id);
  const [profiles, preferences, entitlements] = await Promise.all([
    service.from("profiles").select("user_id, email, name, notify").in("user_id", ids),
    service.from("email_preferences").select("user_id, journey_nudges_enabled").in("user_id", ids),
    service.from("entitlements").select("user_id").eq("product", "badger-28-day").eq("status", "active").in("user_id", ids),
  ]);
  if (profiles.error || preferences.error || entitlements.error) throw new Error("onboarding_recovery_context_unavailable");

  const profileByUser = new Map((profiles.data ?? []).map((row) => [row.user_id, row]));
  const preferenceByUser = new Map((preferences.data ?? []).map((row) => [row.user_id, row.journey_nudges_enabled]));
  const paid = new Set((entitlements.data ?? []).map((row) => row.user_id));
  let sent = 0;
  let skipped = 0;

  for (const row of recoveries) {
    const profile = profileByUser.get(row.user_id);
    const unsubscribeUrl = emailUnsubscribeUrl(row.user_id, appUrl);
    if (paid.has(row.user_id) || !hasRecoveryConsent(preferenceByUser.get(row.user_id)) || profile?.notify === false || !profile?.email || !unsubscribeUrl) {
      skipped += 1;
      continue;
    }
    const firstName = profile.name?.split(/\s+/)[0] || "there";
    const trackLine = row.track === "A"
      ? "You do not need to arrive with a business idea. Bo can help you choose a real problem worth testing."
      : row.track === "C"
        ? "You already built something. The next questions help Bo find the shortest path to real customer evidence."
        : row.track === "B"
          ? "Your idea can stay rough. The next questions turn it into one small test with a real person."
          : "The next step is one tap: tell Bo whether you need an idea, have one already or have built something.";
    const content = renderBoEmail({
      name: profile.name,
      preview: "Pick up your Badger journey when you have a few quiet minutes",
      paragraphs: [
        `${firstName === "there" ? "You" : firstName}, you saved your starting point with Badger.`,
        trackLine,
        "Nothing has been charged. Come back when you have a few quiet minutes—your place is saved.",
      ],
      action: { label: "Continue where I stopped", href: `${appUrl}/start?resume=1` },
      footer: "You received this one reminder because you created a Badger account and saved your onboarding. No subscription has started.",
      footerAction: { label: "Stop journey reminders", href: unsubscribeUrl },
    });
    const result = await resend.emails.send({
      from,
      to: profile.email,
      subject: "Your place with Bo is saved",
      html: content.html,
      text: content.text,
      headers: {
        "List-Unsubscribe": `<${unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
      tags: [
        { name: "user_id", value: row.user_id },
        { name: "category", value: "onboarding_recovery" },
      ],
    }, { idempotencyKey: `onboarding-recovery/${row.user_id}/1` });
    if (result.error) {
      skipped += 1;
      continue;
    }
    const marked = await service.from("onboarding_recoveries").update({
      reminder_count: 1,
      last_reminder_at: now.toISOString(),
      updated_at: now.toISOString(),
    }).eq("user_id", row.user_id).eq("status", "pending").eq("reminder_count", 0);
    if (!marked.error) {
      sent += 1;
      await service.from("product_events").insert({
        user_id: row.user_id,
        event_name: "onboarding_recovery_email_sent",
        properties: { reminder: 1, track: row.track },
      });
    }
  }
  return { examined: recoveries.length, sent, skipped };
}

async function processJourneyReadyRecoveries(
  service: SupabaseClient,
  resend: Resend,
  from: string,
  appUrl: string,
  now: Date,
): Promise<JourneyRecoveryResult> {
  const since = new Date(now.getTime() - JOURNEY_RECOVERY_LOOKBACK_MS).toISOString();
  const journeySignals = await service.from("product_events")
    .select("user_id, event_name, created_at")
    .in("event_name", ["account_save_completed", "paywall_viewed"])
    .not("user_id", "is", null)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1_000);
  if (journeySignals.error) throw new Error("journey_recovery_unavailable");

  const due = latestJourneyRecoveryCandidates(journeySignals.data ?? [])
    .filter((candidate) => journeyReadyReminderDue(candidate.signalledAt, now))
    .slice(0, JOURNEY_RECOVERY_LIMIT);
  if (!due.length) return { examined: 0, sent: 0, skipped: 0 };

  const ids = due.map((candidate) => candidate.userId);
  const [profiles, preferences, entitlements, checkouts, alreadySent] = await Promise.all([
    service.from("profiles").select("user_id, email, name, notify").in("user_id", ids),
    service.from("email_preferences").select("user_id, journey_nudges_enabled").in("user_id", ids),
    service.from("entitlements").select("user_id").eq("product", "badger-28-day").eq("status", "active").in("user_id", ids),
    service.from("checkout_recoveries").select("user_id, status").in("user_id", ids),
    service.from("product_events").select("user_id").eq("event_name", "journey_recovery_email_sent").in("user_id", ids).limit(1_000),
  ]);
  if ([profiles, preferences, entitlements, checkouts, alreadySent].some((result) => result.error)) {
    throw new Error("journey_recovery_context_unavailable");
  }

  const profileByUser = new Map((profiles.data ?? []).map((row) => [row.user_id, row]));
  const preferenceByUser = new Map((preferences.data ?? []).map((row) => [row.user_id, row.journey_nudges_enabled]));
  const blocked = new Set([
    ...(entitlements.data ?? []).map((row) => row.user_id),
    ...(checkouts.data ?? []).map((row) => row.user_id),
    ...(alreadySent.data ?? []).map((row) => row.user_id),
  ]);
  let sent = 0;
  let skipped = 0;

  for (const candidate of due) {
    const userId = candidate.userId;
    const profile = profileByUser.get(userId);
    const unsubscribeUrl = emailUnsubscribeUrl(userId, appUrl);
    if (blocked.has(userId) || !hasRecoveryConsent(preferenceByUser.get(userId)) || profile?.notify === false || !profile?.email || !unsubscribeUrl) {
      skipped += 1;
      continue;
    }
    const content = renderBoEmail({
      name: profile.name,
      preview: "Your personalised journey is ready",
      paragraphs: [
        "Your personalised journey is ready.",
        "You already told Bo what you are building, what keeps getting in the way and how much time you can give it. Your four-week plan and first task are saved.",
        "Review exactly what you get before deciding. Complete access is $49 once—no subscription and no renewal.",
      ],
      action: { label: "Review my journey", href: `${appUrl}/start?checkout=resume` },
      footer: "You received this one reminder because you saved a journey before purchasing.",
      footerAction: { label: "Stop journey reminders", href: unsubscribeUrl },
    });
    const result = await resend.emails.send({
      from,
      to: profile.email,
      subject: `${profile.name?.split(/\s+/)[0] || "Founder"}, your Badger journey is ready`,
      html: content.html,
      text: content.text,
      headers: {
        "List-Unsubscribe": `<${unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
      tags: [
        { name: "user_id", value: userId },
        { name: "category", value: "journey_ready_recovery" },
      ],
    }, { idempotencyKey: `journey-ready-recovery/${userId}/1` });
    if (result.error) {
      skipped += 1;
      continue;
    }
    const recorded = await service.from("product_events").insert({
      user_id: userId,
      event_name: "journey_recovery_email_sent",
      properties: { reminder: 1, source: candidate.source },
    });
    if (recorded.error) console.warn("[checkout-recovery] journey email event unavailable", recorded.error.code ?? "database_error");
    sent += 1;
  }
  return { examined: due.length, sent, skipped };
}

export async function processCheckoutRecoveries(service: SupabaseClient, now = new Date()) {
  const resendKey = process.env.RESEND_API_KEY;
  const from = process.env.NUDGE_FROM;
  const appUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://badger.example.com";
  if (!resendKey || !from || !process.env.EMAIL_UNSUBSCRIBE_SECRET) {
    return { configured: false, messagingExamined: 0, messagingSent: 0, onboardingExamined: 0, onboardingSent: 0, journeyExamined: 0, journeySent: 0, examined: 0, sent: 0, skipped: 0 };
  }

  const resend = new Resend(resendKey);
  const messaging = await processMessagingReconnects(service, resend, from, appUrl, now);
  const onboarding = await processOnboardingRecoveries(service, resend, from, appUrl, now);
  const journey = await processJourneyReadyRecoveries(service, resend, from, appUrl, now);

  const oldestDue = new Date(now.getTime() - FIRST_RECOVERY_MS).toISOString();
  const recoveries = await service.from("checkout_recoveries")
    .select("user_id, checkout_started_at, reminder_count")
    .eq("status", "pending")
    .lt("reminder_count", 2)
    .lte("checkout_started_at", oldestDue)
    .order("checkout_started_at")
    .limit(50);
  if (recoveries.error) throw new Error("checkout_recovery_unavailable");
  if (!recoveries.data?.length) return { configured: true, messagingExamined: messaging.examined, messagingSent: messaging.sent, onboardingExamined: onboarding.examined, onboardingSent: onboarding.sent, journeyExamined: journey.examined, journeySent: journey.sent, examined: 0, sent: 0, skipped: messaging.skipped + onboarding.skipped + journey.skipped };

  const ids = recoveries.data.map((row) => row.user_id);
  const [profiles, preferences, entitlements] = await Promise.all([
    service.from("profiles").select("user_id, email, name").in("user_id", ids),
    service.from("email_preferences").select("user_id, journey_nudges_enabled").in("user_id", ids),
    service.from("entitlements").select("user_id").eq("product", "badger-28-day").eq("status", "active").in("user_id", ids),
  ]);
  if (profiles.error || preferences.error || entitlements.error) throw new Error("checkout_recovery_context_unavailable");

  const profileByUser = new Map((profiles.data ?? []).map((row) => [row.user_id, row]));
  const preferenceByUser = new Map((preferences.data ?? []).map((row) => [row.user_id, row.journey_nudges_enabled]));
  const paid = new Set((entitlements.data ?? []).map((row) => row.user_id));
  let sent = 0;
  let skipped = messaging.skipped + onboarding.skipped + journey.skipped;

  for (const row of recoveries.data as RecoveryRow[]) {
    if (paid.has(row.user_id)) {
      await service.from("checkout_recoveries").update({ status: "converted", converted_at: now.toISOString(), updated_at: now.toISOString() })
        .eq("user_id", row.user_id).eq("status", "pending");
      skipped += 1;
      continue;
    }
    if (!hasRecoveryConsent(preferenceByUser.get(row.user_id))) {
      await service.from("checkout_recoveries").update({ status: "opted_out", updated_at: now.toISOString() })
        .eq("user_id", row.user_id).eq("status", "pending");
      skipped += 1;
      continue;
    }
    const reminder = recoveryReminderDue(row, now);
    const profile = profileByUser.get(row.user_id);
    const unsubscribeUrl = emailUnsubscribeUrl(row.user_id, appUrl);
    if (!reminder || !profile?.email || !unsubscribeUrl) {
      skipped += 1;
      continue;
    }

    const content = renderBoEmail({
      name: profile.name,
      preview: reminder === 1 ? "Your personalised 28-day journey is ready" : "Your journey is saved whenever you are ready",
      paragraphs: reminder === 1 ? [
        "Your personalised 28-day journey is ready.",
        "You already did the thinking: where you are stuck, what you want and how Bo should hold you accountable. I saved all of it.",
        "One $49 payment opens the complete programme immediately: your daily plan, practical help from Bo and the accountability to keep moving toward paying customers.",
      ] : [
        "You built a plan, but you did not start it. That is exactly where good ideas usually stall.",
        "Your answers and first step are still saved. If this idea matters, make the commitment and begin. It is $49 once for the complete 28-day programme—never a subscription.",
        "This is the final checkout reminder I will send.",
      ],
      action: { label: reminder === 1 ? "Open my journey" : "Commit to my 28 days", href: `${appUrl}/start?checkout=resume` },
      footer: "You received this because you created a journey and reached checkout without purchasing.",
      footerAction: { label: "Stop journey reminders", href: unsubscribeUrl },
    });
    const result = await resend.emails.send({
      from,
      to: profile.email,
      subject: reminder === 1 ? `${profile.name?.split(/\s+/)[0] || "Founder"}, your entrepreneurial journey is ready` : "Do you still want to build this?",
      html: content.html,
      text: content.text,
      headers: {
        "List-Unsubscribe": `<${unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
      tags: [
        { name: "user_id", value: row.user_id },
        { name: "category", value: `checkout_recovery_${reminder}` },
      ],
    }, { idempotencyKey: `checkout-recovery/${row.user_id}/${reminder}` });
    if (result.error) {
      skipped += 1;
      continue;
    }
    const timestampField = reminder === 1 ? { first_reminder_at: now.toISOString() } : { final_reminder_at: now.toISOString() };
    const marked = await service.from("checkout_recoveries").update({
      reminder_count: reminder,
      ...timestampField,
      updated_at: now.toISOString(),
    }).eq("user_id", row.user_id).eq("status", "pending").eq("reminder_count", row.reminder_count);
    if (!marked.error) {
      sent += 1;
      await service.from("product_events").insert({
        user_id: row.user_id,
        event_name: "checkout_recovery_email_sent",
        properties: { reminder },
      });
    }
  }
  return { configured: true, messagingExamined: messaging.examined, messagingSent: messaging.sent, onboardingExamined: onboarding.examined, onboardingSent: onboarding.sent, journeyExamined: journey.examined, journeySent: journey.sent, examined: recoveries.data.length, sent, skipped };
}
