import { NextRequest, NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { serverAuth } from "@/lib/server-auth";

export async function POST(req: NextRequest) {
  if (!rateLimit(`account-restart:${clientIp(req)}`, 4, 60_000)) {
    return NextResponse.json({ error: "rate limited" }, { status: 429 });
  }
  const auth = await serverAuth(req);
  if (auth.invalid || !auth.userId || !auth.service) return NextResponse.json({ error: "authentication required" }, { status: 401 });
  const userId = auth.userId;
  const tables = [
    "sprints", "profiles", "posts", "coach_runs", "coach_memories",
    "venture_entities", "founder_commitments", "coach_wakes", "evidence_records",
    "messaging_link_codes", "messaging_channels",
  ];
  const results = await Promise.all(tables.map((table) => auth.service!.from(table).delete().eq("user_id", userId)));
  const failed = results.find((result) => result.error);
  if (failed?.error) {
    console.error("[account] restart failed", failed.error.code ?? "database_error");
    return NextResponse.json({ error: "journey restart failed" }, { status: 503 });
  }
  await auth.service.from("product_events").insert({ user_id: userId, event_name: "journey_restarted", properties: {} });
  return NextResponse.json({ restarted: true });
}
