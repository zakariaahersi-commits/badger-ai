import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { executeCompanyAction, reconcileUgcVideoAction } from "@/lib/company-os/executor";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ configured: false, processed: 0 }, { status: 503 });
  const service = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const [{ data, error }, { data: renders, error: renderError }] = await Promise.all([
    service.from("company_actions").select("id").eq("status", "approved").in("action_type", ["send_customer_email", "reply_company_email", "publish_social_content", "queue_engineering_work", "queue_ugc_video"]).lte("available_at", new Date().toISOString()).order("available_at").limit(10),
    service.from("company_actions").select("id").eq("status", "delegated").eq("action_type", "queue_ugc_video").order("executed_at").limit(1),
  ]);
  if (error || renderError) return NextResponse.json({ error: "company action queue unavailable" }, { status: 503 });
  const results = [];
  for (const action of data ?? []) results.push(await executeCompanyAction(service, action.id));
  for (const action of renders ?? []) results.push(await reconcileUgcVideoAction(service, action.id));
  return NextResponse.json({ configured: true, processed: results.length, results });
}
