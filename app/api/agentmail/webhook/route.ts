import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ingestAgentMailEvent, parseAgentMailReceivedEvent, verifyAgentMailWebhook } from "@/lib/company-os/agentmail";

export const runtime = "nodejs";
export const maxDuration = 15;

export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !process.env.AGENTMAIL_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }
  const rawBody = await req.text();
  let verified: unknown;
  try {
    verified = verifyAgentMailWebhook(rawBody, req.headers);
  } catch {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }
  const event = parseAgentMailReceivedEvent(verified);
  if (!event) return NextResponse.json({ accepted: true, ignored: true });
  const service = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    return NextResponse.json(await ingestAgentMailEvent(service, event));
  } catch {
    return NextResponse.json({ error: "inbox unavailable" }, { status: 503 });
  }
}
