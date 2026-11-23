import { NextRequest, NextResponse } from "next/server";
import { loadFounderBrain } from "@/lib/founder-brain";
import { serverAuth } from "@/lib/server-auth";
import { paidAccessState } from "@/lib/paid-access";

export async function GET(req: NextRequest) {
  const auth = await serverAuth(req);
  if (auth.invalid || !auth.userId || !auth.service) {
    return NextResponse.json({ error: "authentication required" }, { status: 401 });
  }
  const access = await paidAccessState(auth);
  if (access === "unavailable") return NextResponse.json({ error: "access check unavailable" }, { status: 503 });
  if (access !== "active") return NextResponse.json({ error: "payment required" }, { status: 402 });
  const snapshot = await loadFounderBrain(auth.service, auth.userId);
  return NextResponse.json({
    brief: snapshot.brief,
    counts: {
      knowledge: snapshot.entities.length,
      commitments: snapshot.commitments.length,
    },
  });
}
