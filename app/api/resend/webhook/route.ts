import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

export const runtime = "nodejs";

const EMAIL_EVENTS = new Set([
  "email.sent", "email.delivered", "email.delivery_delayed", "email.opened",
  "email.clicked", "email.bounced", "email.complained", "email.failed", "email.suppressed",
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ResendEvent = {
  type?: string;
  created_at?: string;
  data?: {
    email_id?: string;
    to?: string[];
    subject?: string;
    tags?: Record<string, string>;
    click?: { link?: string };
    [key: string]: unknown;
  };
};

export async function POST(req: NextRequest) {
  const apiKey = process.env.RESEND_API_KEY;
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!apiKey || !webhookSecret || !supabaseUrl || !serviceKey) return NextResponse.json({ received: false }, { status: 503 });

  const svixId = req.headers.get("svix-id");
  const timestamp = req.headers.get("svix-timestamp");
  const signature = req.headers.get("svix-signature");
  if (!svixId || !timestamp || !signature) return NextResponse.json({ received: false }, { status: 400 });

  let event: ResendEvent;
  try {
    const resend = new Resend(apiKey);
    event = resend.webhooks.verify({
      payload: await req.text(),
      headers: { id: svixId, timestamp, signature },
      webhookSecret,
    }) as unknown as ResendEvent;
  } catch {
    return NextResponse.json({ received: false }, { status: 400 });
  }
  if (!event.type || !EMAIL_EVENTS.has(event.type) || !event.data?.email_id) {
    return NextResponse.json({ received: true, ignored: true });
  }

  const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const recipient = event.data.to?.[0]?.trim().toLowerCase() ?? "";
  let userId = event.data.tags?.user_id;
  if (!userId || !UUID.test(userId)) {
    userId = undefined;
    if (recipient) {
      const profile = await service.from("profiles").select("user_id").eq("email", recipient).maybeSingle();
      if (!profile.error && profile.data?.user_id) userId = profile.data.user_id;
    }
  }
  const occurredAt = Number.isFinite(Date.parse(event.created_at ?? "")) ? event.created_at! : new Date().toISOString();
  const stored = await service.from("email_events").insert({
    svix_id: svixId,
    resend_email_id: event.data.email_id,
    user_id: userId ?? null,
    recipient: recipient || "unknown@invalid.local",
    event_type: event.type,
    subject: typeof event.data.subject === "string" ? event.data.subject.slice(0, 300) : null,
    link_url: typeof event.data.click?.link === "string" ? event.data.click.link.slice(0, 2000) : null,
    payload: event.data,
    occurred_at: occurredAt,
  });
  if (stored.error && stored.error.code !== "23505") {
    console.error("[resend-webhook] store failed", stored.error.code ?? "database_error");
    return NextResponse.json({ received: false }, { status: 503 });
  }
  return NextResponse.json({ received: true, duplicate: stored.error?.code === "23505" });
}
