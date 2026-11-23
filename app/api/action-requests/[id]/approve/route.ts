import { NextRequest, NextResponse } from "next/server";
import { normalizeCommitmentPayload } from "@/lib/founder-brain";
import { serverAuth } from "@/lib/server-auth";
import { paidAccessState } from "@/lib/paid-access";
import { executeQueuedAction } from "@/lib/orchestration/executor";

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await serverAuth(req);
  if (auth.invalid || !auth.userId || !auth.service) return NextResponse.json({ error: "authentication required" }, { status: 401 });
  const access = await paidAccessState(auth);
  if (access === "unavailable") return NextResponse.json({ error: "access check unavailable" }, { status: 503 });
  if (access !== "active") return NextResponse.json({ error: "payment required" }, { status: 402 });
  const { id } = await context.params;
  const { data: action, error } = await auth.service.from("action_requests").select("*").eq("id", id).eq("user_id", auth.userId).maybeSingle();
  if (error || !action) return NextResponse.json({ error: "action not found" }, { status: 404 });
  if (action.status !== "pending") {
    const unavailable = action.status === "failed" || action.status === "expired" || action.status === "cancelled";
    return NextResponse.json({
      error: unavailable ? "This action is no longer available. Ask Bo to create a fresh one if you still want it." : `This action is already ${action.status}.`,
      status: action.status,
    }, { status: 409 });
  }
  if (action.expires_at && Date.parse(action.expires_at) < Date.now()) {
    await auth.service.from("action_requests").update({ status: "expired", updated_at: new Date().toISOString() }).eq("id", id);
    return NextResponse.json({ error: "action expired" }, { status: 410 });
  }

  const now = new Date().toISOString();
  if (action.action_type === "remember_lesson") {
    const memoryId = typeof action.payload?.memoryId === "string" ? action.payload.memoryId : null;
    if (memoryId) await auth.service.from("coach_memories").update({ status: "approved", confirmed_at: now }).eq("id", memoryId).eq("user_id", auth.userId);
    await auth.service.from("action_runs").insert({ user_id: auth.userId, action_request_id: id, status: "completed", started_at: now, completed_at: now, output: { remembered: Boolean(memoryId) } });
    await auth.service.from("action_requests").update({ status: "completed", approved_at: now, updated_at: now }).eq("id", id);
    return NextResponse.json({ id, status: "completed", message: "Bo will use this approved memory as future context." });
  }

  if (action.action_type === "create_commitment") {
    let payload;
    try {
      payload = normalizeCommitmentPayload(action.payload ?? {});
    } catch {
      await auth.service.from("action_requests").update({ status: "failed", updated_at: now }).eq("id", id).eq("user_id", auth.userId);
      return NextResponse.json({
        error: "This old commitment is incomplete and can’t be approved. Ask Bo to create it again if you still want it.",
        code: "invalid_action_payload",
        status: "failed",
      }, { status: 422 });
    }
    const commitmentKey = `action-request:${id}`;
    const { data: commitment, error: commitmentError } = await auth.service.from("founder_commitments").upsert({
      user_id: auth.userId,
      title: payload.title,
      outcome: payload.outcome,
      due_at: payload.dueAt,
      evidence_required: payload.evidenceRequired,
      follow_up_policy: payload.followUpPolicy,
      idempotency_key: commitmentKey,
      metadata: { actionRequestId: id, runId: action.run_id },
      updated_at: now,
    }, { onConflict: "user_id,idempotency_key" }).select("id").single();
    if (commitmentError || !commitment) return NextResponse.json({ error: "could not save commitment" }, { status: 503 });

    const { data: event, error: eventError } = await auth.service.from("domain_events").upsert({
      user_id: auth.userId,
      run_id: action.run_id,
      event_type: "founder.commitment_created",
      entity_type: "commitment",
      entity_id: commitment.id,
      payload: { title: payload.title, dueAt: payload.dueAt, evidenceRequired: payload.evidenceRequired },
      idempotency_key: `${commitmentKey}:created`,
    }, { onConflict: "user_id,idempotency_key" }).select("id").single();
    if (eventError || !event) return NextResponse.json({ error: "could not record commitment" }, { status: 503 });
    await auth.service.from("founder_commitments").update({ source_event_id: event.id, updated_at: now }).eq("id", commitment.id).eq("user_id", auth.userId);

    const dueAt = new Date(payload.dueAt);
    const wakeReason = {
      title: payload.title,
      outcome: payload.outcome,
      evidenceRequired: payload.evidenceRequired,
      followUpPolicy: payload.followUpPolicy,
    };
    const { error: wakesError } = await auth.service.from("coach_wakes").upsert([
      {
        user_id: auth.userId,
        commitment_id: commitment.id,
        trigger_type: "commitment_due",
        scheduled_for: dueAt.toISOString(),
        reason: wakeReason,
        idempotency_key: `${commitment.id}:due`,
      },
      {
        user_id: auth.userId,
        commitment_id: commitment.id,
        trigger_type: "commitment_missed",
        scheduled_for: new Date(dueAt.getTime() + 15 * 60_000).toISOString(),
        reason: wakeReason,
        idempotency_key: `${commitment.id}:missed`,
      },
    ], { onConflict: "user_id,idempotency_key" });
    if (wakesError) return NextResponse.json({ error: "could not schedule accountability" }, { status: 503 });

    const { error: runError } = await auth.service.from("action_runs").insert({
      user_id: auth.userId,
      action_request_id: id,
      status: "completed",
      started_at: now,
      completed_at: now,
      output: { commitmentId: commitment.id, wakesScheduled: 2 },
    });
    if (runError) return NextResponse.json({ error: "could not complete commitment action" }, { status: 503 });
    await auth.service.from("action_requests").update({ status: "completed", approved_at: now, updated_at: now }).eq("id", id).eq("user_id", auth.userId);
    return NextResponse.json({ id, status: "completed", commitmentId: commitment.id, message: "Promise saved. Bo will hold you to it." });
  }

  const requestedTime = action.action_type === "schedule_nudge" && typeof action.payload?.scheduledAt === "string"
    ? Date.parse(action.payload.scheduledAt)
    : Number.NaN;
  const latestAllowed = Date.now() + 28 * 86_400_000;
  if (action.action_type === "schedule_nudge" && (!Number.isFinite(requestedTime) || requestedTime <= Date.now() || requestedTime > latestAllowed)) {
    return NextResponse.json({ error: "scheduledAt must be in the next 28 days" }, { status: 400 });
  }
  const availableAt = Number.isFinite(requestedTime) ? new Date(requestedTime).toISOString() : now;
  const { data: run, error: runError } = await auth.service.from("action_runs").insert({ user_id: auth.userId, action_request_id: id, status: "queued", available_at: availableAt }).select("id").single();
  if (runError || !run) return NextResponse.json({ error: "could not queue action" }, { status: 503 });
  const { error: approvalError } = await auth.service.from("action_requests").update({ status: "approved", approved_at: now, updated_at: now }).eq("id", id);
  if (approvalError) return NextResponse.json({ error: "could not approve action" }, { status: 503 });
  if (action.action_type === "send_email") {
    const executed = await executeQueuedAction(auth.service, run.id);
    const responseStatus = executed.status === "completed" ? 200 : executed.status === "queued" ? 202 : 502;
    return NextResponse.json({ id, status: executed.status, message: executed.message }, { status: responseStatus });
  }
  if (action.action_type === "schedule_nudge") {
    return NextResponse.json({ id, status: "approved", message: `Nudge scheduled for ${availableAt}.` }, { status: 202 });
  }
  return NextResponse.json({ id, status: "approved", message: "Approved and queued. No external effect has been claimed yet." }, { status: 202 });
}
