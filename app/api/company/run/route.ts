import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { runCompanyAgent } from "@/lib/company-os/runner";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ configured: false, processed: 0 });
  const service = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await service.from("company_agents").select("id").eq("status", "active").neq("autonomy", "disabled").lte("next_run_at", new Date().toISOString()).order("next_run_at").limit(1);
  if (error) return NextResponse.json({ error: "company queue unavailable" }, { status: 503 });
  const results = [];
  for (const agent of data ?? []) results.push(await runCompanyAgent(service, agent.id, "schedule"));
  return NextResponse.json({ configured: true, processed: results.length, results });
}
