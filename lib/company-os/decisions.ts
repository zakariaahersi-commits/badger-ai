import type { SupabaseClient } from "@supabase/supabase-js";
import { engineeringConnectorProvider } from "@/lib/company-os/engineering-connector";
import { socialConnectorProvider } from "@/lib/company-os/social-connector";
import { companyInboxConnectorReady } from "@/lib/company-os/agentmail";

export class CompanyDecisionError extends Error {
  readonly code: "not_found" | "not_pending" | "connector_missing" | "database_unavailable";

  constructor(code: "not_found" | "not_pending" | "connector_missing" | "database_unavailable") {
    super(code);
    this.code = code;
    this.name = "CompanyDecisionError";
  }
}

export async function decideCompanyAction(input: {
  service: SupabaseClient;
  actionId: string;
  decision: "approve" | "reject";
  actorId: string;
  ownerUserId?: string | null;
  channel: "web" | "telegram";
}) {
  const approved = input.decision === "approve";
  const now = new Date().toISOString();
  const existing = await input.service.from("company_actions")
    .select("id,action_type,risk,status")
    .eq("id", input.actionId)
    .maybeSingle();
  if (existing.error) throw new CompanyDecisionError("database_unavailable");
  if (!existing.data) throw new CompanyDecisionError("not_found");
  if (existing.data.status !== "proposed") throw new CompanyDecisionError("not_pending");

  if (approved) {
    const configured = existing.data.action_type === "send_customer_email"
      ? Boolean(process.env.RESEND_API_KEY && process.env.NUDGE_FROM && process.env.EMAIL_UNSUBSCRIBE_SECRET)
      : existing.data.action_type === "reply_company_email"
        ? companyInboxConnectorReady()
      : existing.data.action_type === "publish_social_content"
        ? Boolean(socialConnectorProvider())
        : existing.data.action_type === "queue_engineering_work"
          ? Boolean(engineeringConnectorProvider())
          : true;
    if (!configured) throw new CompanyDecisionError("connector_missing");
  }

  const completesImmediately = approved && ["read", "draft", "internal"].includes(existing.data.risk) && existing.data.action_type !== "queue_engineering_work";
  const patch = approved
    ? {
        status: completesImmediately ? "completed" : "approved",
        approved_by: input.ownerUserId ?? null,
        approved_at: now,
        ...(completesImmediately ? { executed_at: now, result: { stored: true, ownerApproved: true, decisionChannel: input.channel } } : {}),
      }
    : { status: "rejected", rejected_by: input.ownerUserId ?? null, rejected_at: now };
  const updated = await input.service.from("company_actions")
    .update(patch)
    .eq("id", input.actionId)
    .eq("status", "proposed")
    .select("id,run_id,agent_id,action_type,risk,status,title")
    .maybeSingle();
  if (updated.error) throw new CompanyDecisionError("database_unavailable");
  if (!updated.data) throw new CompanyDecisionError("not_pending");

  const pending = await input.service.from("company_actions")
    .select("id", { count: "exact", head: true })
    .eq("run_id", updated.data.run_id)
    .eq("status", "proposed");
  if (!pending.error && (pending.count ?? 0) === 0) {
    await input.service.from("company_runs")
      .update({ status: "completed", completed_at: now })
      .eq("id", updated.data.run_id)
      .eq("status", "waiting_approval");
  }
  await input.service.from("company_audit_log").insert({
    actor_type: "owner",
    actor_id: input.actorId,
    event_type: approved ? "action.approved" : "action.rejected",
    object_type: "company_action",
    object_id: input.actionId,
    details: { actionType: updated.data.action_type, risk: updated.data.risk, channel: input.channel },
  });
  if (!approved && updated.data.action_type === "reply_company_email") {
    await input.service.from("company_email_messages")
      .update({ status: "ignored", updated_at: now })
      .eq("action_id", input.actionId)
      .eq("status", "waiting_approval");
  }
  return {
    action: updated.data,
    execution: approved
      ? completesImmediately
        ? "Approved internal work stored."
        : ["send_customer_email", "reply_company_email", "publish_social_content", "queue_engineering_work"].includes(updated.data.action_type)
          ? "Approved and queued for the bounded executor."
          : "Approval recorded; this category has no autonomous executor."
      : "Rejected.",
  };
}

export async function requestCompanyActionRevision(input: {
  service: SupabaseClient;
  actionId: string;
  feedback: string;
  actorId: string;
  channel: "telegram";
}) {
  const feedback = input.feedback.trim().replace(/\s+/g, " ").slice(0, 800);
  if (feedback.length < 3) throw new CompanyDecisionError("not_pending");
  const now = new Date().toISOString();
  const existing = await input.service.from("company_actions")
    .select("id,run_id,agent_id,action_type,risk,status,title,result")
    .eq("id", input.actionId)
    .maybeSingle();
  if (existing.error) throw new CompanyDecisionError("database_unavailable");
  if (!existing.data) throw new CompanyDecisionError("not_found");
  if (existing.data.status !== "proposed") throw new CompanyDecisionError("not_pending");
  const priorResult = existing.data.result && typeof existing.data.result === "object" && !Array.isArray(existing.data.result)
    ? existing.data.result as Record<string, unknown>
    : {};
  const updated = await input.service.from("company_actions")
    .update({
      status: "rejected",
      rejected_at: now,
      result: { ...priorResult, revisionRequested: true, revisionFeedback: feedback, revisionRequestedAt: now, revisionChannel: input.channel },
    })
    .eq("id", input.actionId)
    .eq("status", "proposed")
    .select("id,run_id,agent_id,action_type,risk,status,title")
    .maybeSingle();
  if (updated.error) throw new CompanyDecisionError("database_unavailable");
  if (!updated.data) throw new CompanyDecisionError("not_pending");

  const pending = await input.service.from("company_actions").select("id", { count: "exact", head: true })
    .eq("run_id", updated.data.run_id)
    .eq("status", "proposed");
  await Promise.all([
    !pending.error && (pending.count ?? 0) === 0
      ? input.service.from("company_runs").update({ status: "completed", completed_at: now }).eq("id", updated.data.run_id).eq("status", "waiting_approval")
      : Promise.resolve({ error: null }),
    input.service.from("company_agents").update({ next_run_at: now, updated_at: now }).eq("id", updated.data.agent_id).eq("status", "active"),
    input.service.from("company_audit_log").insert({
      actor_type: "owner",
      actor_id: input.actorId,
      event_type: "action.revision_requested",
      object_type: "company_action",
      object_id: input.actionId,
      details: { actionType: updated.data.action_type, risk: updated.data.risk, channel: input.channel, feedback },
    }),
  ]);
  return { action: updated.data, feedback };
}
