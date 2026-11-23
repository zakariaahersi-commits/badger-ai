import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { renderBoEmail } from "@/lib/bo-email";
import { cleanTaskTitle } from "@/lib/nudge-copy";
import { serverAuth } from "@/lib/server-auth";
import { newFounderTelegramMessage, sendOwnerTelegramAlert } from "@/lib/telegram";

export const runtime = "nodejs";

const WELCOME_KEY = "lifecycle/welcome-email/v1";
const MAX_WELCOME_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function shortText(value: unknown, fallback: string, max: number): string {
  return typeof value === "string" && value.trim()
    ? value.trim().replace(/\s+/g, " ").slice(0, max)
    : fallback;
}

export async function POST(req: NextRequest) {
  const auth = await serverAuth(req);
  if (auth.invalid || !auth.userId || !auth.service) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const resendKey = process.env.RESEND_API_KEY;
  const from = process.env.NUDGE_FROM;
  if (!resendKey || !from) {
    return NextResponse.json({ configured: false, sent: false }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  const startedAt = Date.parse(typeof body.planStart === "string" ? body.planStart : "");
  const age = Date.now() - startedAt;
  if (!Number.isFinite(startedAt) || age < -5 * 60 * 1000 || age > MAX_WELCOME_AGE_MS) {
    return NextResponse.json({ configured: true, sent: false, reason: "not_new" });
  }

  const { data: existing } = await auth.service
    .from("domain_events")
    .select("id")
    .eq("user_id", auth.userId)
    .eq("idempotency_key", WELCOME_KEY)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ configured: true, sent: false, reason: "already_sent" });
  }

  const { data: userData, error: userError } = await auth.service.auth.admin.getUserById(auth.userId);
  const email = userData.user?.email;
  if (userError || !email) {
    return NextResponse.json({ error: "email_unavailable" }, { status: 422 });
  }

  const name = shortText(body.name, "there", 80);
  const taskTitle = cleanTaskTitle(shortText(body.firstTask?.title, "", 180)) ?? "open Badger AI and complete your first clear step";
  const minutes = Math.max(5, Math.min(120, Number(body.firstTask?.minutes) || 30));
  const appUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://badger.example.com";
  const emailContent = renderBoEmail({
    name,
    preview: `Day 1 is ready: ${taskTitle}`,
    paragraphs: [
      "I have your plan. We start now.",
      `Your Day 1 step is: ${taskTitle}.`,
      `Give it about ${minutes} minutes. Do the smallest useful version, then reply and tell me what happened.`,
      "I will keep track of the plan, help with the work and notice when you go quiet. You do not need to feel ready. You only need to begin.",
    ],
    action: { label: "Open Day 1", href: `${appUrl}/app` },
    footer: "You are receiving this because you started your 28-day launch with Badger AI. You can change daily email check-ins in Settings.",
  });

  const resend = new Resend(resendKey);
  const { data, error } = await resend.emails.send({
    from,
    to: email,
    subject: `${name.split(/\s+/)[0]}, we start now`,
    html: emailContent.html,
    text: emailContent.text,
    tags: [
      { name: "user_id", value: auth.userId },
      { name: "category", value: "welcome" },
    ],
  }, { idempotencyKey: `welcome-email-v1/${auth.userId}` });
  if (error) {
    return NextResponse.json({ error: `resend_${error.name ?? "failed"}` }, { status: 502 });
  }

  const { error: eventError } = await auth.service.from("domain_events").upsert({
    user_id: auth.userId,
    event_type: "lifecycle.welcome_email_sent",
    entity_type: "user",
    entity_id: auth.userId,
    payload: { provider: "resend", messageId: data?.id ?? null },
    idempotency_key: WELCOME_KEY,
  }, { onConflict: "user_id,idempotency_key" });
  if (eventError) {
    return NextResponse.json({ configured: true, sent: true, recorded: false });
  }

  // Owner alerts are deliberately best-effort. Telegram must never delay or
  // block a founder's welcome flow.
  await sendOwnerTelegramAlert(newFounderTelegramMessage({ name, email }));

  return NextResponse.json({ configured: true, sent: true, recorded: true });
}
