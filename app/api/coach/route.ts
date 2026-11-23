import { NextRequest, NextResponse } from "next/server";
import { runCoachTurn, type CoachContext } from "@/lib/coach-service";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { serverAuth } from "@/lib/server-auth";
import { paidAccessState } from "@/lib/paid-access";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  if (!rateLimit(`coach:${clientIp(req)}`, 20, 60_000)) {
    return NextResponse.json({ reply: "Give me a few seconds between messages, then ask again.", source: "ratelimit" }, { status: 429 });
  }

  const auth = await serverAuth(req);
  if (auth.invalid || !auth.userId || !auth.service) {
    return NextResponse.json({ error: "authentication required" }, { status: 401 });
  }
  const access = await paidAccessState(auth);
  if (access === "unavailable") return NextResponse.json({ error: "access check unavailable" }, { status: 503 });
  if (access !== "active") return NextResponse.json({ error: "payment required" }, { status: 402 });

  const body: Partial<CoachContext> | null = await req.json().catch(() => null);
  const result = await runCoachTurn({ userId: auth.userId, service: auth.service }, body);
  return NextResponse.json(result.body, { status: result.status });
}
