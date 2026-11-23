import { NextRequest, NextResponse } from "next/server";
import { serverAuth } from "@/lib/server-auth";
import { paidAccessState } from "@/lib/paid-access";

export async function GET(req: NextRequest) {
  const auth = await serverAuth(req);
  if (auth.invalid || !auth.userId || !auth.service) return NextResponse.json({ error: "authentication required" }, { status: 401 });
  const access = await paidAccessState(auth);
  if (access === "unavailable") return NextResponse.json({ error: "access check unavailable" }, { status: 503 });
  if (access !== "active") return NextResponse.json({ error: "payment required" }, { status: 402 });
  const { data, error } = await auth.service.from("action_requests")
    .select("id, action_type, title, summary, risk, status, approval_required, created_at")
    .eq("user_id", auth.userId).order("created_at", { ascending: false }).limit(50);
  if (error) return NextResponse.json({ error: "action store unavailable" }, { status: 503 });
  return NextResponse.json({ actions: data });
}
