import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { safeCompanyWebhook } from "@/lib/company-os/execution-policy";
import { verifyEngineeringActionToken } from "@/lib/company-os/engineering-auth";
import { sendOwnerTelegramAlert } from "@/lib/telegram";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  const secret = process.env.COMPANY_AUTOMATION_CALLBACK_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const supplied = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!supplied) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "not configured" }, { status: 503 });
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const actionId = typeof body?.actionId === "string" ? body.actionId : "";
  const status = body?.status === "completed" || body?.status === "failed" ? body.status : null;
  if (!UUID.test(actionId) || !status) return NextResponse.json({ error: "invalid callback" }, { status: 400 });
  if (supplied !== secret && !verifyEngineeringActionToken(actionId, supplied, secret)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const summary = typeof body?.summary === "string" ? body.summary.trim().slice(0, 1000) : "";
  const externalId = typeof body?.externalId === "string" ? body.externalId.trim().slice(0, 200) : null;
  const resultUrl = typeof body?.url === "string" ? safeCompanyWebhook(body.url)?.toString() ?? null : null;
  const service = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const current = await service.from("company_actions").select("result").eq("id", actionId).eq("action_type", "queue_engineering_work").eq("status", "delegated").maybeSingle();
  if (current.error) return NextResponse.json({ error: "callback unavailable" }, { status: 503 });
  const priorResult = current.data?.result && typeof current.data.result === "object" ? current.data.result as Record<string, unknown> : {};
  const { data: action, error } = await service.from("company_actions").update({ status, result: { ...priorResult, provider: priorResult.provider ?? "engineering_webhook", callbackExternalId: externalId, summary, url: resultUrl, state: status }, error_code: status === "failed" ? "delegated_work_failed" : null }).eq("id", actionId).eq("action_type", "queue_engineering_work").eq("status", "delegated").select("id, agent_id, title").maybeSingle();
  if (error) return NextResponse.json({ error: "callback unavailable" }, { status: 503 });
  if (!action) {
    const existing = await service.from("company_actions").select("status").eq("id", actionId).eq("action_type", "queue_engineering_work").maybeSingle();
    if (!existing.error && existing.data?.status === status) return NextResponse.json({ recorded: false, duplicate: true, actionId, status });
    return NextResponse.json({ error: "action is not awaiting a callback" }, { status: 409 });
  }
  await service.from("company_audit_log").insert({ actor_type: "system", actor_id: "engineering_callback", event_type: `delegated.${status}`, object_type: "company_action", object_id: actionId, details: { externalId, summary, url: resultUrl } });
  await sendOwnerTelegramAlert(`🦡 Engineering work ${status}\n${action.title}${summary ? `\n${summary}` : ""}`);
  return NextResponse.json({ recorded: true, actionId, status });
}
