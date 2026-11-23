import "server-only";

import { Resend } from "resend";
import type { SupabaseClient } from "@supabase/supabase-js";
import { renderBoEmail } from "@/lib/bo-email";
import { loadCompanyMetrics } from "@/lib/company-os/metrics";
import { buildCompanyCapitalReadiness } from "@/lib/company-os/capital-readiness";
import { buildOwnerCompanyBrief, ownerBriefSchedule } from "@/lib/company-os/owner-brief-format";
import { loadMessagingPilotMetrics } from "@/lib/messaging/metrics";
import { ownerEmails } from "@/lib/ops-auth";
import { ensureOwnerTelegramWebhook, sendOwnerTelegramAlert } from "@/lib/telegram";
import { ensureCompanyDailyPlan } from "@/lib/company-os/daily-plan";
import { collectCompanyExperimentEvidence } from "@/lib/company-os/experiment-observations";
import { buildExperimentTrackingUrl, withExperimentTrackingLink } from "@/lib/company-os/experiment-attribution";

type OwnerEmailResult = "sent" | "skipped" | "not_configured" | "failed";

function preparedMoveFromAction(action: { title?: unknown; payload?: unknown } | null, trackingUrl: string | null): { title: string; content: string } | null {
  if (!action || typeof action.title !== "string" || !action.title.trim() || !action.payload || typeof action.payload !== "object" || Array.isArray(action.payload)) return null;
  const payload = action.payload as Record<string, unknown>;
  const posts = payload.posts && typeof payload.posts === "object" && !Array.isArray(payload.posts) ? payload.posts as Record<string, unknown> : null;
  const content = typeof payload.content === "string" ? payload.content : typeof posts?.x === "string" ? posts.x : null;
  if (typeof content !== "string" || !content.trim()) return null;
  const trackedContent = withExperimentTrackingLink(content, trackingUrl);
  if (!trackedContent) return null;
  return {
    title: action.title.trim().replace(/\s+/g, " ").slice(0, 140),
    content: trackedContent.slice(0, 900),
  };
}


async function sendOwnerEmail(brief: ReturnType<typeof buildOwnerCompanyBrief>, localDate: string, site: string): Promise<OwnerEmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.NUDGE_FROM?.trim();
  const recipients = ownerEmails();
  if (!apiKey || !from || !recipients.length) return "not_configured";
  const body = renderBoEmail({
    preview: brief.preview,
    paragraphs: brief.paragraphs,
    action: { label: "Open chairman console", href: `${site}/ops/company` },
    footer: "Private operational brief for the Badger AI owner. It contains verified Company OS data, not a public performance claim.",
  });
  try {
    const response = await new Resend(apiKey).emails.send({
      from,
      to: recipients,
      subject: brief.subject,
      html: body.html,
      text: body.text,
      tags: [{ name: "category", value: "company_owner_brief" }, { name: "brief_date", value: localDate.replaceAll("-", "_") }],
    }, { idempotencyKey: `company-owner-brief/${localDate}` });
    return response.error ? "failed" : "sent";
  } catch {
    return "failed";
  }
}

export async function sendOwnerCompanyBrief(service: SupabaseClient, now = new Date()) {
  const schedule = ownerBriefSchedule(now);
  const phase = schedule.phase ?? "morning";
  const idempotencyKey = `company:ceo:owner-brief:${schedule.localDate}:${phase}`;
  const reservation = await service.from("company_runs").insert({
    agent_id: "ceo",
    trigger_type: "event",
    status: "running",
    started_at: now.toISOString(),
    idempotency_key: idempotencyKey,
  }).select("id").single();
  if (reservation.error) {
    if (reservation.error.code === "23505") return { status: "duplicate" as const, localDate: schedule.localDate };
    throw new Error("owner_brief_reservation_failed");
  }

  const runId = reservation.data.id;
  const since24h = new Date(now.getTime() - 86_400_000).toISOString();
  try {
    const [metrics, messagingPilot, goals, pending, failedActions, failedRuns, latestCeo, warmOutreach] = await Promise.all([
      loadCompanyMetrics(service),
      loadMessagingPilotMetrics(service, now).catch(() => null),
      service.from("company_goals").select("title,metric,target_value,current_value,unit").eq("status", "active").order("created_at", { ascending: false }).limit(10),
      service.from("company_actions").select("id", { count: "exact", head: true }).eq("status", "proposed").eq("requires_approval", true),
      service.from("company_actions").select("id", { count: "exact", head: true }).eq("status", "failed").gte("executed_at", since24h),
      service.from("company_runs").select("id", { count: "exact", head: true }).eq("status", "failed").gte("created_at", since24h),
      service.from("company_runs").select("summary").eq("agent_id", "ceo").eq("status", "completed").not("summary", "is", null).not("idempotency_key", "like", "company:ceo:owner-brief:%").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      service.from("company_outreach_batches")
        .select("id,status,max_contacts,opener,company_outreach_contacts(status)")
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    for (const result of [goals, pending, failedActions, failedRuns, latestCeo, warmOutreach]) {
      if (result.error) throw new Error("owner_brief_context_unavailable");
    }
    const dailyPlanState = await ensureCompanyDailyPlan(service, undefined, metrics);
    const experimentEvidence = await collectCompanyExperimentEvidence({ service, experiment: dailyPlanState.experiment, now }).catch((error) => {
      console.error("[company-os] experiment evidence unavailable", error instanceof Error ? error.message : "unknown_error");
      return null;
    });
    const preparedAction = dailyPlanState.experiment?.id
      ? await service.from("company_actions")
        .select("title,payload")
        .eq("experiment_id", dailyPlanState.experiment.id)
        .in("action_type", ["draft_campaign", "prepare_social_content"])
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
      : { data: null, error: null };
    if (preparedAction.error) throw new Error("owner_brief_prepared_move_unavailable");
    const site = (process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://badger.example.com").replace(/\/$/, "");
    const trackingUrl = buildExperimentTrackingUrl({ site, sourceCode: dailyPlanState.experiment?.source_code, channel: dailyPlanState.experiment?.channel });
    const preparedMove = preparedMoveFromAction(preparedAction.data, trackingUrl);
    const capital = buildCompanyCapitalReadiness(metrics);
    const warmContacts = warmOutreach.data?.company_outreach_contacts ?? [];
    const warmSnapshot = warmOutreach.data ? {
      maxContacts: Number(warmOutreach.data.max_contacts) || 5,
      opener: String(warmOutreach.data.opener || "").trim().slice(0, 700),
      sent: warmContacts.filter((contact) => contact.status !== "ready").length,
      replies: warmContacts.filter((contact) => ["replied", "interested", "not_interested"].includes(contact.status)).length,
      linksShared: warmContacts.filter((contact) => contact.status === "interested").length,
    } : null;
    const brief = buildOwnerCompanyBrief({
      localDate: schedule.localDate,
      phase,
      metrics,
      goals: goals.data ?? [],
      pendingDecisions: pending.count ?? 0,
      failedActions24h: failedActions.count ?? 0,
      failedRuns24h: failedRuns.count ?? 0,
      latestCeoSummary: latestCeo.data?.summary ?? null,
      capital: { stage: capital.stage, gatesMet: capital.gates.filter((gate) => gate.status === "met").length, gatesTotal: capital.gates.length },
      messagingPilot,
      site,
      dailyPlan: { ...dailyPlanState.plan, experiment: dailyPlanState.experiment, assignments: dailyPlanState.workOrder?.assignments.filter((item) => item.agentId !== "ceo") ?? [] },
      experimentEvidence,
      preparedMove,
      warmOutreach: warmSnapshot,
    });
    await ensureOwnerTelegramWebhook(site).catch(() => ({ configured: false as const }));
    const [telegram, email] = await Promise.all([
      sendOwnerTelegramAlert(brief.telegram, {
        text: warmSnapshot ? "Open outreach cohort" : "Open Company OS",
        url: warmSnapshot ? `${site}/ops/company#outreach` : `${site}/ops/company`,
      }),
      phase === "morning" ? sendOwnerEmail(brief, schedule.localDate, site) : Promise.resolve("skipped" as const),
    ]);
    const delivered = telegram === "sent" || email === "sent";
    const completedAt = new Date().toISOString();
    const status = delivered ? "completed" : "failed";
    const errorCode = delivered ? null : "owner_brief_delivery_failed";
    await Promise.all([
      service.from("company_runs").update({
        status,
        summary: brief.priority,
        input: { localDate: schedule.localDate, timezone: schedule.timezone, phase, dailyPlanId: dailyPlanState.plan.id },
        output: { delivery: { telegram, email }, progress: brief.progress, priority: brief.priority, experimentEvidence, preparedMove: preparedMove ? { title: preparedMove.title } : null },
        error_code: errorCode,
        completed_at: completedAt,
      }).eq("id", runId),
      service.from("company_audit_log").insert({
        actor_type: "system",
        actor_id: "company_owner_brief",
        event_type: delivered ? "owner.brief_sent" : "owner.brief_failed",
        object_type: "company_run",
        object_id: runId,
        details: { localDate: schedule.localDate, phase, telegram, email, paidFounders: metrics.paidFounders, pendingDecisions: pending.count ?? 0, dailyPlanId: dailyPlanState.plan.id, experimentEvidenceCollected: Boolean(experimentEvidence), preparedMoveIncluded: Boolean(preparedMove) },
      }),
    ]);
    return { status, localDate: schedule.localDate, phase, delivery: { telegram, email }, progress: brief.progress, priority: brief.priority };
  } catch (error) {
    await service.from("company_runs").update({
      status: "failed",
      summary: "Owner brief failed safely.",
      error_code: error instanceof Error ? error.message.slice(0, 120) : "owner_brief_failed",
      completed_at: new Date().toISOString(),
    }).eq("id", runId);
    throw error;
  }
}
