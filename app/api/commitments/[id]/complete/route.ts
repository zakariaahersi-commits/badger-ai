import { NextRequest, NextResponse } from "next/server";
import { serverAuth } from "@/lib/server-auth";
import { paidAccessState } from "@/lib/paid-access";

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await serverAuth(req);
  if (auth.invalid || !auth.userId || !auth.service) {
    return NextResponse.json({ error: "authentication required" }, { status: 401 });
  }
  const access = await paidAccessState(auth);
  if (access === "unavailable") return NextResponse.json({ error: "access check unavailable" }, { status: 503 });
  if (access !== "active") return NextResponse.json({ error: "payment required" }, { status: 402 });
  const { id } = await context.params;
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const evidence = typeof body.evidence === "string" ? body.evidence.trim().slice(0, 1_000) : "";
  const { data: commitment, error } = await auth.service.from("founder_commitments")
    .select("id, title, status").eq("id", id).eq("user_id", auth.userId).maybeSingle();
  if (error || !commitment) return NextResponse.json({ error: "commitment not found" }, { status: 404 });
  if (commitment.status === "completed") return NextResponse.json({ id, status: "completed" });
  if (commitment.status === "cancelled") return NextResponse.json({ error: "commitment is cancelled" }, { status: 409 });

  const now = new Date().toISOString();
  const eventKey = `commitment:${id}:completed`;
  const { data: event, error: eventError } = await auth.service.from("domain_events").upsert({
    user_id: auth.userId,
    event_type: "founder.commitment_completed",
    entity_type: "commitment",
    entity_id: id,
    payload: { title: commitment.title, evidence: evidence || null },
    idempotency_key: eventKey,
  }, { onConflict: "user_id,idempotency_key" }).select("id").single();
  if (eventError || !event) return NextResponse.json({ error: "could not record completion" }, { status: 503 });
  const { error: updateError } = await auth.service.from("founder_commitments").update({
    status: "completed",
    evidence_status: evidence ? "submitted" : "pending",
    completed_event_id: event.id,
    completed_at: now,
    updated_at: now,
  }).eq("id", id).eq("user_id", auth.userId);
  if (updateError) return NextResponse.json({ error: "could not complete commitment" }, { status: 503 });
  await auth.service.from("coach_wakes").update({
    status: "cancelled",
    policy_outcome: "commitment_completed",
    completed_at: now,
    updated_at: now,
  }).eq("commitment_id", id).eq("user_id", auth.userId).in("status", ["queued", "evaluating"]);
  return NextResponse.json({ id, status: "completed" });
}
