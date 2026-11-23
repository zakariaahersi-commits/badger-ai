import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { companyMetricSignals, fetchHackerNewsFounderSignals } from "@/lib/company-os/trend-sources";
import { upsertTrendSignals } from "@/lib/company-os/trend-radar";
import { loadCompanyMetrics } from "@/lib/company-os/metrics";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ configured: false }, { status: 503 });
  const service = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const retired = await service.from("company_trend_signals")
      .update({ status: "retired", updated_at: new Date().toISOString() })
      .in("status", ["fresh", "watch"])
      .lt("last_seen_at", new Date(Date.now() - 30 * 86_400_000).toISOString());
    if (retired.error) throw new Error("trend_retirement_failed");
    const metrics = await loadCompanyMetrics(service);
    const publicSignals = await fetchHackerNewsFounderSignals().catch(() => []);
    const signals = [...companyMetricSignals(metrics), ...publicSignals];
    const result = await upsertTrendSignals(service, signals);
    await service.from("company_audit_log").insert({
      actor_type: "system", actor_id: "growth_radar", event_type: "trend_scan.completed",
      object_type: "company_os", object_id: "badger", details: { sources: ["verified_product_metrics", "hacker_news"], candidates: signals.length, stored: result.stored },
    });
    return NextResponse.json({ configured: true, candidates: signals.length, ...result });
  } catch (error) {
    console.error("[company-os] trend scan failed", error instanceof Error ? error.message : "unknown_error");
    return NextResponse.json({ configured: true, error: "trend scan failed" }, { status: 503 });
  }
}
