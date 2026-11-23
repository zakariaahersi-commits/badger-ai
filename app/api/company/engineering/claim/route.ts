import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { engineeringActionToken, verifyEngineeringWorkerSecret } from "@/lib/company-os/engineering-auth";
import { engineeringConnector } from "@/lib/company-os/engineering-connector";

export const runtime = "nodejs";
export const maxDuration = 30;

const RUN_ID = /^[0-9]{1,30}$/;

export async function POST(req: NextRequest) {
  const connector = engineeringConnector();
  if (!connector || connector.provider !== "github") return NextResponse.json({ error: "not configured" }, { status: 503 });
  const supplied = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!verifyEngineeringWorkerSecret(supplied, connector.workerSecret)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const repository = typeof body?.repository === "string" ? body.repository.trim() : "";
  const runId = typeof body?.runId === "string" ? body.runId.trim() : "";
  if (body?.source !== "badger-company-os" || repository !== connector.repository || !RUN_ID.test(runId)) {
    return NextResponse.json({ error: "invalid worker" }, { status: 400 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "not configured" }, { status: 503 });
  const service = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const stale = await service.from("company_actions")
    .select("id,result")
    .eq("action_type", "queue_engineering_work")
    .eq("status", "delegated")
    .contains("result", { provider: "github_deepseek_worker", state: "claimed" })
    .limit(10);
  if (stale.error) return NextResponse.json({ error: "queue unavailable" }, { status: 503 });
  const staleBefore = Date.now() - 45 * 60_000;
  for (const candidate of stale.data ?? []) {
    const prior = candidate.result && typeof candidate.result === "object" && !Array.isArray(candidate.result) ? candidate.result as Record<string, unknown> : {};
    const claimedAt = typeof prior.claimedAt === "string" ? Date.parse(prior.claimedAt) : 0;
    if (Number.isFinite(claimedAt) && claimedAt > staleBefore) continue;
    await service.from("company_actions").update({ result: { ...prior, state: "waiting_claim", recoveredAt: new Date().toISOString() } })
      .eq("id", candidate.id)
      .eq("status", "delegated")
      .contains("result", { provider: "github_deepseek_worker", state: "claimed", workerRunId: prior.workerRunId });
  }
  const candidates = await service.from("company_actions")
    .select("id,title,result")
    .eq("action_type", "queue_engineering_work")
    .eq("status", "delegated")
    .contains("result", { provider: "github_deepseek_worker", state: "waiting_claim" })
    .order("executed_at", { ascending: true })
    .limit(3);
  if (candidates.error) return NextResponse.json({ error: "queue unavailable" }, { status: 503 });
  for (const candidate of candidates.data ?? []) {
    const prior = candidate.result && typeof candidate.result === "object" && !Array.isArray(candidate.result) ? candidate.result as Record<string, unknown> : {};
    const claimedAt = new Date().toISOString();
    const claimed = await service.from("company_actions").update({
      result: { ...prior, state: "claimed", claimedAt, workerRunId: runId },
    }).eq("id", candidate.id)
      .eq("status", "delegated")
      .contains("result", { provider: "github_deepseek_worker", state: "waiting_claim" })
      .select("id,title")
      .maybeSingle();
    if (claimed.error) return NextResponse.json({ error: "queue unavailable" }, { status: 503 });
    if (!claimed.data) continue;
    await service.from("company_audit_log").insert({ actor_type: "system", actor_id: "github_deepseek_worker", event_type: "engineering.claimed", object_type: "company_action", object_id: candidate.id, details: { repository, runId } });
    return NextResponse.json({ job: {
      actionId: candidate.id,
      source: "badger-company-os",
      title: candidate.title,
      inferenceUrl: new URL("/api/company/engineering/infer", connector.site).toString(),
      callbackUrl: new URL("/api/company/actions/callback", connector.site).toString(),
      actionToken: engineeringActionToken(candidate.id, connector.callbackSecret),
    } });
  }
  return NextResponse.json({ job: null });
}
