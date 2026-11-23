import { NextRequest, NextResponse } from "next/server";
import { serverAuth } from "@/lib/server-auth";
import { paidAccessState } from "@/lib/paid-access";

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await serverAuth(req);
  if (auth.invalid || !auth.userId || !auth.service) return NextResponse.json({ error: "authentication required" }, { status: 401 });
  const access = await paidAccessState(auth);
  if (access === "unavailable") return NextResponse.json({ error: "access check unavailable" }, { status: 503 });
  if (access !== "active") return NextResponse.json({ error: "payment required" }, { status: 402 });
  const { id } = await context.params;
  const { data: action, error } = await auth.service.from("action_requests").select("*").eq("id", id).eq("user_id", auth.userId).maybeSingle();
  if (error || !action) return NextResponse.json({ error: "action not found" }, { status: 404 });
  if (action.status !== "pending") return NextResponse.json({ error: `action is already ${action.status}` }, { status: 409 });
  const now = new Date().toISOString();
  const memoryId = typeof action.payload?.memoryId === "string" ? action.payload.memoryId : null;
  if (memoryId) await auth.service.from("coach_memories").update({ status: "rejected" }).eq("id", memoryId).eq("user_id", auth.userId);
  await auth.service.from("action_requests").update({ status: "rejected", rejected_at: now, updated_at: now }).eq("id", id);
  return NextResponse.json({ id, status: "rejected" });
}
