import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { validEmailPreferenceToken } from "@/lib/email-preferences";
import { clientIp, rateLimit } from "@/lib/ratelimit";

async function unsubscribe(req: NextRequest): Promise<boolean> {
  if (!rateLimit(`email-unsubscribe:${clientIp(req)}`, 20, 60_000)) return false;
  const userId = req.nextUrl.searchParams.get("user") ?? "";
  const token = req.nextUrl.searchParams.get("token") ?? "";
  if (!validEmailPreferenceToken(userId, token)) return false;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return false;
  const service = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const now = new Date().toISOString();
  const preference = await service.from("email_preferences").upsert({
    user_id: userId,
    journey_nudges_enabled: false,
    unsubscribed_at: now,
    updated_at: now,
  }, { onConflict: "user_id" });
  if (preference.error) return false;
  await service.from("checkout_recoveries").update({ status: "opted_out", updated_at: now })
    .eq("user_id", userId).eq("status", "pending");
  return true;
}

export async function GET(req: NextRequest) {
  const success = await unsubscribe(req);
  if (!success) return NextResponse.json({ unsubscribed: false }, { status: 400 });
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? req.nextUrl.origin;
  return NextResponse.redirect(new URL("/start?email=unsubscribed", site));
}

export async function POST(req: NextRequest) {
  const success = await unsubscribe(req);
  return NextResponse.json({ unsubscribed: success }, { status: success ? 200 : 400 });
}
