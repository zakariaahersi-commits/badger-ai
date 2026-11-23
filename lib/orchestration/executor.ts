import { Resend } from "resend";
import type { SupabaseClient } from "@supabase/supabase-js";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface ActionRow {
  id: string;
  user_id: string;
  run_id: string;
  action_type: string;
  payload: Record<string, unknown>;
  status: string;
}

interface ActionRunRow {
  id: string;
  user_id: string;
  action_request_id: string;
  attempt: number;
  status: string;
  action_requests: ActionRow;
}

export interface ExecutionResult {
  id: string;
  status: "completed" | "queued" | "failed" | "skipped";
  message: string;
}

function requiredText(value: unknown, max: number, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`invalid_${label}`);
  return value.trim().slice(0, max);
}

export function normalizeApprovedEmail(payload: Record<string, unknown>) {
  const to = requiredText(payload.to, 320, "recipient").toLowerCase();
  if (!EMAIL.test(to)) throw new Error("invalid_recipient");
  return {
    to,
    subject: requiredText(payload.subject, 200, "subject"),
    text: requiredText(payload.text, 10_000, "body"),
  };
}

export async function executeQueuedAction(service: SupabaseClient, actionRunId: string): Promise<ExecutionResult> {
  const { data: claimed, error: claimError } = await service.from("action_runs")
    .update({ status: "running", started_at: new Date().toISOString(), error_code: null })
    .eq("id", actionRunId).eq("status", "queued")
    .select("id, user_id, action_request_id, attempt, status, action_requests!inner(id, user_id, run_id, action_type, payload, status)")
    .maybeSingle();
  if (claimError) return { id: actionRunId, status: "failed", message: "claim_failed" };
  if (!claimed) return { id: actionRunId, status: "skipped", message: "already_claimed" };
  const run = claimed as unknown as ActionRunRow;
  const action = run.action_requests;
  if (!["send_email", "schedule_nudge"].includes(action.action_type) || action.status !== "approved") {
    await service.from("action_runs").update({ status: "failed", error_code: "unsupported_action", completed_at: new Date().toISOString() }).eq("id", actionRunId);
    return { id: actionRunId, status: "failed", message: "unsupported_action" };
  }

  try {
    const email = normalizeApprovedEmail(action.payload ?? {});
    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) throw new Error("resend_not_configured");
    const resend = new Resend(resendKey);
    const from = process.env.NUDGE_FROM ?? "Bo at Badger AI <onboarding@resend.dev>";
    const { data, error } = await resend.emails.send({ from, ...email }, { idempotencyKey: `bo-action/${action.id}` });
    if (error) throw new Error(`resend_${error.name ?? "error"}`);
    const now = new Date().toISOString();
    await service.from("action_runs").update({ status: "completed", output: { provider: "resend", messageId: data?.id ?? null }, completed_at: now }).eq("id", actionRunId);
    await service.from("action_requests").update({ status: "completed", updated_at: now }).eq("id", action.id);
    await service.from("domain_events").upsert({ user_id: action.user_id, run_id: action.run_id, event_type: "coach.email_sent", entity_type: "action_request", entity_id: action.id, payload: { provider: "resend", messageId: data?.id ?? null }, idempotency_key: `${action.id}:email-sent` }, { onConflict: "user_id,idempotency_key" });
    return { id: actionRunId, status: "completed", message: "Email sent." };
  } catch (error) {
    const errorCode = error instanceof Error ? error.message.slice(0, 100) : "execution_failed";
    const retry = run.attempt < 3 && !errorCode.startsWith("invalid_");
    if (retry) {
      const availableAt = new Date(Date.now() + 60_000 * run.attempt).toISOString();
      await service.from("action_runs").update({ status: "queued", attempt: run.attempt + 1, error_code: errorCode, available_at: availableAt }).eq("id", actionRunId);
      return { id: actionRunId, status: "queued", message: "Delivery will retry." };
    }
    const now = new Date().toISOString();
    await service.from("action_runs").update({ status: "failed", error_code: errorCode, completed_at: now }).eq("id", actionRunId);
    await service.from("action_requests").update({ status: "failed", updated_at: now }).eq("id", action.id);
    return { id: actionRunId, status: "failed", message: "Email delivery failed." };
  }
}
