import { NextRequest, NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { serverAuth } from "@/lib/server-auth";

export const runtime = "nodejs";

function validEndpoint(value: unknown): value is string {
  if (typeof value !== "string" || value.length < 12 || value.length > 2048) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function validKey(value: unknown): value is string {
  return typeof value === "string" && value.length >= 8 && value.length <= 512;
}

export async function POST(req: NextRequest) {
  if (!rateLimit(`push:${clientIp(req)}`, 12, 60_000)) {
    return NextResponse.json({ error: "too many requests" }, { status: 429 });
  }
  const identity = await serverAuth(req);
  if (identity.invalid || !identity.userId || !identity.service) {
    return NextResponse.json({ error: "authentication required" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const endpoint = body?.subscription?.endpoint;
  const p256dh = body?.subscription?.keys?.p256dh;
  const auth = body?.subscription?.keys?.auth;
  const timezone = typeof body?.timezone === "string" && /^[A-Za-z0-9_+./-]{1,80}$/.test(body.timezone)
    ? body.timezone
    : "UTC";
  if (!validEndpoint(endpoint) || !validKey(p256dh) || !validKey(auth)) {
    return NextResponse.json({ error: "invalid push subscription" }, { status: 400 });
  }

  const { error } = await identity.service.from("push_subscriptions").upsert({
    user_id: identity.userId,
    endpoint,
    p256dh,
    auth,
    timezone,
    updated_at: new Date().toISOString(),
  }, { onConflict: "endpoint" });
  if (error) return NextResponse.json({ error: "subscription store unavailable" }, { status: 503 });
  return NextResponse.json({ subscribed: true });
}

export async function DELETE(req: NextRequest) {
  const identity = await serverAuth(req);
  if (identity.invalid || !identity.userId || !identity.service) {
    return NextResponse.json({ error: "authentication required" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  if (!validEndpoint(body?.endpoint)) {
    return NextResponse.json({ error: "invalid endpoint" }, { status: 400 });
  }
  const { error } = await identity.service.from("push_subscriptions")
    .delete()
    .eq("user_id", identity.userId)
    .eq("endpoint", body.endpoint);
  if (error) return NextResponse.json({ error: "subscription store unavailable" }, { status: 503 });
  return NextResponse.json({ subscribed: false });
}
