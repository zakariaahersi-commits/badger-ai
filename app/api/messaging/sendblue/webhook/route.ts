import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { after, NextRequest, NextResponse } from "next/server";
import { messagingConfigured, protectText } from "@/lib/messaging/crypto";
import { parseSendblueEvent, verifySendblueWebhook } from "@/lib/messaging/sendblue";
import { processMessagingWebhookEvent } from "@/lib/messaging/service";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  if (!messagingConfigured()) return NextResponse.json({ error: "not configured" }, { status: 503 });
  if (!verifySendblueWebhook(req.headers)) return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  const rawBody = await req.text();
  if (rawBody.length > 100_000) return NextResponse.json({ error: "payload too large" }, { status: 413 });
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const parsed = parseSendblueEvent(payload);
  if (!parsed) return NextResponse.json({ error: "invalid event" }, { status: 400 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "storage unavailable" }, { status: 503 });
  const service = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await service.from("messaging_webhook_events").insert({
    provider: "sendblue",
    provider_event_id: parsed.eventId,
    event_type: parsed.eventType,
    payload_digest: createHash("sha256").update(rawBody).digest("hex"),
    payload_ciphertext: protectText(rawBody),
    status: "queued",
  }).select("id").single();
  if (error?.code === "23505") return NextResponse.json({ accepted: true, duplicate: true }, { status: 202 });
  if (error || !data) return NextResponse.json({ error: "event could not be queued" }, { status: 503 });

  after(async () => {
    await processMessagingWebhookEvent(service, "sendblue", data.id, payload);
  });
  return NextResponse.json({ accepted: true }, { status: 202 });
}
