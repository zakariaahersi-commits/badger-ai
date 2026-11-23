import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendOwnerCompanyBrief } from "@/lib/company-os/owner-brief";
import { ownerBriefSchedule } from "@/lib/company-os/owner-brief-format";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ configured: false }, { status: 503 });
  const now = new Date();
  const schedule = ownerBriefSchedule(now);
  const force = req.nextUrl.searchParams.get("force") === "1";
  if (!schedule.due && !force) return NextResponse.json({ configured: true, due: false, localDate: schedule.localDate, timezone: schedule.timezone, briefHour: schedule.briefHour, eveningHour: schedule.eveningHour });
  const service = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    return NextResponse.json({ configured: true, due: true, result: await sendOwnerCompanyBrief(service, now) });
  } catch (error) {
    console.error("[company-os] owner brief failed", error instanceof Error ? error.message : "unknown_error");
    return NextResponse.json({ configured: true, due: true, error: "owner brief failed" }, { status: 503 });
  }
}
