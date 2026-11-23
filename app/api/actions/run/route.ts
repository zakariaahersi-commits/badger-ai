import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { executeQueuedAction } from "@/lib/orchestration/executor";

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
  const { data, error } = await service.from("action_runs")
    .select("id, action_requests!inner(action_type)")
    .eq("status", "queued").lte("available_at", new Date().toISOString())
    .in("action_requests.action_type", ["send_email", "schedule_nudge"]).order("available_at").limit(10);
  if (error) return NextResponse.json({ error: "action queue unavailable" }, { status: 503 });
  const results = [];
  for (const row of data ?? []) results.push(await executeQueuedAction(service, row.id));
  return NextResponse.json({ configured: true, processed: results.length, results });
}
