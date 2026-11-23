import "server-only";

import { Resend } from "resend";
import type { SupabaseClient } from "@supabase/supabase-js";
import { renderBoEmail } from "../bo-email.ts";
import { IMESSAGE_RECONNECT_EVENT_KEY, latestExpiredMessagingLinks, MESSAGING_RECONNECT_LOOKBACK_MS, type MessagingLinkAttempt } from "./recovery-policy.ts";

const RECOVERY_LIMIT = 20;

export type MessagingReconnectResult = {
  examined: number;
  sent: number;
  skipped: number;
};

export async function processMessagingReconnects(
  service: SupabaseClient,
  resend: Resend,
  from: string,
  appUrl: string,
  now = new Date(),
): Promise<MessagingReconnectResult> {
  const since = new Date(now.getTime() - MESSAGING_RECONNECT_LOOKBACK_MS).toISOString();
  const links = await service.from("messaging_link_codes")
    .select("user_id, provider, used_at, expires_at, created_at")
    .is("used_at", null)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(500);
  if (links.error) throw new Error("messaging_recovery_unavailable");

  const due = latestExpiredMessagingLinks((links.data ?? []) as MessagingLinkAttempt[], now).slice(0, RECOVERY_LIMIT);
  if (!due.length) return { examined: 0, sent: 0, skipped: 0 };

  const ids = due.map((candidate) => candidate.userId);
  const [profiles, channels, entitlements, alreadySent] = await Promise.all([
    service.from("profiles").select("user_id, email, name, notify").in("user_id", ids),
    service.from("messaging_channels").select("user_id").in("user_id", ids).in("provider", ["linq", "sendblue"]),
    service.from("entitlements").select("user_id").eq("product", "badger-28-day").eq("status", "active").in("user_id", ids),
    service.from("domain_events").select("user_id").eq("idempotency_key", IMESSAGE_RECONNECT_EVENT_KEY).in("user_id", ids),
  ]);
  if ([profiles, channels, entitlements, alreadySent].some((result) => result.error)) {
    throw new Error("messaging_recovery_context_unavailable");
  }

  const profileByUser = new Map((profiles.data ?? []).map((row) => [row.user_id, row]));
  const connected = new Set((channels.data ?? []).map((row) => row.user_id));
  const activeAccess = new Set((entitlements.data ?? []).map((row) => row.user_id));
  const reminded = new Set((alreadySent.data ?? []).map((row) => row.user_id));
  let sent = 0;
  let skipped = 0;

  for (const candidate of due) {
    const profile = profileByUser.get(candidate.userId);
    if (connected.has(candidate.userId) || reminded.has(candidate.userId) || !activeAccess.has(candidate.userId) || profile?.notify === false) {
      skipped += 1;
      continue;
    }

    let email = typeof profile?.email === "string" ? profile.email.trim() : "";
    if (!email) {
      const user = await service.auth.admin.getUserById(candidate.userId);
      email = user.data.user?.email?.trim() ?? "";
    }
    if (!email) {
      skipped += 1;
      continue;
    }

    const content = renderBoEmail({
      name: profile?.name,
      preview: "Finish connecting Bo to iMessage",
      paragraphs: [
        "You started connecting Bo, but the private code expired before the connection was completed.",
        "Connecting lets you speak with Bo directly in iMessage. Bo can send your daily task, check in on your progress and help when you feel stuck—without needing to open Badger every time.",
        "Open Badger, create a new code and send the prepared START message within 15 minutes.",
      ],
      action: { label: "Finish connecting Bo", href: `${appUrl}/app#connect-bo` },
      footer: "This is a one-off account support email because you tried to connect iMessage. If that was not you, you can ignore it.",
    });
    const result = await resend.emails.send({
      from,
      to: email,
      subject: "Finish connecting Bo to iMessage",
      html: content.html,
      text: content.text,
      tags: [
        { name: "user_id", value: candidate.userId },
        { name: "category", value: "imessage_reconnect" },
      ],
    }, { idempotencyKey: `imessage-reconnect/${candidate.userId}/v1` });
    if (result.error) {
      skipped += 1;
      continue;
    }

    const recorded = await service.from("domain_events").upsert({
      user_id: candidate.userId,
      event_type: "messaging.imessage_reconnect_email_sent",
      entity_type: "user",
      entity_id: candidate.userId,
      payload: { provider: "resend", messageId: result.data?.id ?? null, messagingProvider: candidate.provider },
      idempotency_key: IMESSAGE_RECONNECT_EVENT_KEY,
    }, { onConflict: "user_id,idempotency_key" });
    if (recorded.error) {
      console.warn("[messaging-recovery] email sent but event unavailable", recorded.error.code ?? "database_error");
    }
    await service.from("product_events").insert({
      user_id: candidate.userId,
      event_name: "imessage_reconnect_email_sent",
      path: "/app",
      properties: { provider: candidate.provider },
    });
    sent += 1;
  }

  return { examined: due.length, sent, skipped };
}
