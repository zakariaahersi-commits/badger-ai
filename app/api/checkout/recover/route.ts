import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { processCheckoutRecoveries } from "@/lib/checkout-recovery";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ configured: false }, { status: 503 });
  try {
    const service = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    return NextResponse.json(await processCheckoutRecoveries(service));
  } catch (error) {
    console.error("[checkout-recovery] processing failed", error instanceof Error ? error.message : "unknown_error");
    return NextResponse.json({ error: "recovery unavailable" }, { status: 503 });
  }
}
