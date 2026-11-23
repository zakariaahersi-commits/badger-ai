import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { processDueWakes } from "@/lib/wake-engine";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return NextResponse.json({ configured: false, processed: 0 });
  const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    return NextResponse.json({ configured: true, ...(await processDueWakes(service)) });
  } catch (error) {
    console.error("[wake-engine] run failed", error instanceof Error ? error.message : "unknown_error");
    return NextResponse.json({ error: "wake queue unavailable" }, { status: 503 });
  }
}
