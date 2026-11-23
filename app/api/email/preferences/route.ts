import { NextRequest, NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { serverAuth } from "@/lib/server-auth";

export async function GET(req: NextRequest) {
  const auth = await serverAuth(req);
  if (auth.invalid || !auth.userId || !auth.service) return NextResponse.json({ error: "authentication required" }, { status: 401 });
  const existing = await auth.service.from("email_preferences")
    .select("journey_nudges_enabled")
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (existing.error) return NextResponse.json({ error: "preferences unavailable" }, { status: 503 });
  if (existing.data) return NextResponse.json({ journeyNudgesEnabled: existing.data.journey_nudges_enabled });
  return NextResponse.json({ journeyNudgesEnabled: false });
}

export async function POST(req: NextRequest) {
  if (!rateLimit(`email-preferences:${clientIp(req)}`, 12, 60_000)) {
    return NextResponse.json({ error: "rate limited" }, { status: 429 });
  }
  const auth = await serverAuth(req);
  if (auth.invalid || !auth.userId || !auth.service) return NextResponse.json({ error: "authentication required" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (typeof body.journeyNudgesEnabled !== "boolean") return NextResponse.json({ error: "invalid preference" }, { status: 400 });
  const now = new Date().toISOString();
  const saved = await auth.service.from("email_preferences").upsert({
    user_id: auth.userId,
    journey_nudges_enabled: body.journeyNudgesEnabled,
    unsubscribed_at: body.journeyNudgesEnabled ? null : now,
    updated_at: now,
  }, { onConflict: "user_id" });
  if (saved.error) return NextResponse.json({ error: "preference could not be saved" }, { status: 503 });
  if (!body.journeyNudgesEnabled) {
    await auth.service.from("checkout_recoveries").update({ status: "opted_out", updated_at: now })
      .eq("user_id", auth.userId).eq("status", "pending");
  }
  return NextResponse.json({ journeyNudgesEnabled: body.journeyNudgesEnabled });
}
