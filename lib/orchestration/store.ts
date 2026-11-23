import type { SupabaseClient } from "@supabase/supabase-js";
import { actionFingerprint, ACTION_POLICY } from "./policy";
import type { CoachMode } from "../coach-policy";
import type { CoachRunResult, CoachStateUpdate, CoachProposedAction, CoachToolResult, PublicActionRequest } from "./types";

type RunStart = { kind: "new" | "recovered"; runId: string } | { kind: "replay"; result: CoachRunResult } | { kind: "running"; runId: string };

function publicDetails(action: CoachProposedAction): PublicActionRequest["details"] {
  if (action.type === "create_commitment") {
    return {
      commitmentTitle: typeof action.payload.title === "string" ? action.payload.title.slice(0, 200) : undefined,
      outcome: typeof action.payload.outcome === "string" ? action.payload.outcome.slice(0, 1_000) : undefined,
      scheduledAt: typeof action.payload.dueAt === "string" ? action.payload.dueAt.slice(0, 80) : undefined,
      evidenceRequired: typeof action.payload.evidenceRequired === "string" ? action.payload.evidenceRequired.slice(0, 1_000) : undefined,
      followUpPolicy: typeof action.payload.followUpPolicy === "string" ? action.payload.followUpPolicy.slice(0, 30) : undefined,
    };
  }
  if (action.type !== "send_email" && action.type !== "schedule_nudge") return undefined;
  return {
    to: typeof action.payload.to === "string" ? action.payload.to.slice(0, 320) : undefined,
    subject: typeof action.payload.subject === "string" ? action.payload.subject.slice(0, 200) : undefined,
    body: typeof action.payload.text === "string" ? action.payload.text.slice(0, 4_000) : undefined,
    scheduledAt: typeof action.payload.scheduledAt === "string" ? action.payload.scheduledAt.slice(0, 80) : undefined,
  };
}

export class CoachStore {
  private disabled = false;

  constructor(private service: SupabaseClient | null, private userId: string | null) {
  }

  get durability(): "durable" | "ephemeral" {
    return this.service && this.userId && !this.disabled ? "durable" : "ephemeral";
  }

  private async safe<T>(operation: () => PromiseLike<unknown>): Promise<T | null> {
    if (!this.service || !this.userId || this.disabled) return null;
    const { data, error } = await operation() as { data: T | null; error: { message: string } | null };
    if (error) {
      this.disabled = true;
      console.warn("[coach-store] durable orchestration unavailable", error.message);
      return null;
    }
    return data;
  }

  async start(idempotencyKey: string, mode: CoachMode, input: Record<string, unknown>): Promise<RunStart> {
    if (!this.service || !this.userId) return { kind: "new", runId: crypto.randomUUID() };
    const existing = await this.safe<Record<string, unknown> | null>(() => this.service!.from("coach_runs").select("*").eq("user_id", this.userId!).eq("idempotency_key", idempotencyKey).maybeSingle());
    if (existing) {
      if (existing.status === "completed" || existing.status === "waiting_approval" || existing.status === "budget_exhausted") {
        if (existing.result) return { kind: "replay", result: existing.result as unknown as CoachRunResult };
      }
      const heartbeat = Date.parse(String(existing.heartbeat_at));
      if (Date.now() - heartbeat < 45_000) return { kind: "running", runId: String(existing.id) };
      const attempt = Number(existing.attempt) || 1;
      if (attempt >= 3) return { kind: "running", runId: String(existing.id) };
      await this.safe(() => this.service!.from("coach_runs").update({ attempt: attempt + 1, heartbeat_at: new Date().toISOString(), status: "running" }).eq("id", existing.id).select("id").single());
      return { kind: "recovered", runId: String(existing.id) };
    }
    const id = crypto.randomUUID();
    const inserted = await this.safe<{ id: string }>(() => this.service!.from("coach_runs").insert({ id, user_id: this.userId, idempotency_key: idempotencyKey, mode, status: "running", input_summary: input }).select("id").single());
    return { kind: "new", runId: inserted?.id ?? id };
  }

  async approvedMemories(): Promise<string[]> {
    const rows = await this.safe<{ content: string }[]>(() => this.service!.from("coach_memories").select("content").eq("user_id", this.userId!).eq("status", "approved").order("created_at", { ascending: false }).limit(12));
    return rows?.map((row) => row.content) ?? [];
  }

  async persistActions(runId: string, actions: CoachProposedAction[], updates: CoachStateUpdate[]): Promise<PublicActionRequest[]> {
    const publicActions: PublicActionRequest[] = [];
    for (const [index, action] of actions.entries()) {
      const policy = ACTION_POLICY[action.type];
      const id = crypto.randomUUID();
      if (this.service && this.userId && !this.disabled) {
        const row = await this.safe<{ id: string }>(() => this.service!.from("action_requests").upsert({ id, user_id: this.userId, run_id: runId, action_type: action.type, title: action.title, summary: action.summary, payload: action.payload, risk: policy.risk, approval_required: policy.approval, status: "pending", idempotency_key: `${runId}:action:${index}:${actionFingerprint(action)}` }, { onConflict: "user_id,idempotency_key" }).select("id").single());
        publicActions.push({ id: row?.id ?? id, type: action.type, title: action.title, summary: action.summary, risk: policy.risk, status: "pending", approvalRequired: policy.approval, details: publicDetails(action) });
      } else {
        publicActions.push({ id, type: action.type, title: action.title, summary: action.summary, risk: policy.risk, status: "preview", approvalRequired: policy.approval, details: publicDetails(action) });
      }
    }
    for (const [index, update] of updates.entries()) {
      if (!this.service || !this.userId || this.disabled) continue;
      const memoryId = crypto.randomUUID();
      await this.safe(() => this.service!.from("coach_memories").upsert({ id: memoryId, user_id: this.userId, run_id: runId, kind: update.memoryKind, content: update.content, confidence: update.confidence, status: "pending", idempotency_key: `${runId}:memory:${index}` }, { onConflict: "user_id,idempotency_key" }).select("id").single());
      const action = { type: "remember_lesson" as const, title: "Remember this", summary: update.content, payload: { memoryId } };
      const row = await this.safe<{ id: string }>(() => this.service!.from("action_requests").upsert({ user_id: this.userId, run_id: runId, action_type: action.type, title: action.title, summary: action.summary, payload: action.payload, risk: "memory", approval_required: true, status: "pending", idempotency_key: `${runId}:memory-approval:${index}` }, { onConflict: "user_id,idempotency_key" }).select("id").single());
      if (row) publicActions.push({ id: row.id, type: action.type, title: action.title, summary: action.summary, risk: "memory", status: "pending", approvalRequired: true });
    }
    return publicActions;
  }

  async recordTrace(runId: string, toolResults: CoachToolResult[]): Promise<void> {
    if (!this.service || !this.userId || this.disabled) return;
    for (const [index, result] of toolResults.entries()) {
      await this.safe(() => this.service!.from("coach_artifacts").insert({ user_id: this.userId, run_id: runId, kind: `tool_result:${result.actionType}`, content: result.output }).select("id").single());
      if (this.disabled) return;
      await this.safe(() => this.service!.from("domain_events").upsert({ user_id: this.userId, run_id: runId, event_type: "coach.tool_completed", entity_type: "tool", entity_id: result.actionType, payload: { ok: result.ok }, idempotency_key: `${runId}:tool:${index}:${result.actionType}` }, { onConflict: "user_id,idempotency_key" }).select("id").single());
    }
  }

  async complete(runId: string, result: CoachRunResult, telemetry: { steps: number; model: string; promptTokens: number; completionTokens: number; latencyMs: number; fallback: boolean; safetyOutcome: string; status: string; failure?: string }): Promise<void> {
    if (!this.service || !this.userId || this.disabled) return;
    await this.safe(() => this.service!.from("coach_runs").update({ status: telemetry.status, result, step_count: telemetry.steps, model: telemetry.model, prompt_tokens: telemetry.promptTokens, completion_tokens: telemetry.completionTokens, latency_ms: telemetry.latencyMs, fallback: telemetry.fallback, safety_outcome: telemetry.safetyOutcome, error_code: telemetry.failure ?? null, heartbeat_at: new Date().toISOString(), completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", runId).select("id").single());
  }
}
