import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { serverAuth } from "@/lib/server-auth";

// Cross-user learning. POST records ONE anonymized signal (no PII) about what
// happened — a task done, a yes, a payment, a ship/kill. GET rolls those up
// into the "what actually works" patterns Bo can learn from across everyone.
// Requires SUPABASE_SERVICE_ROLE_KEY; without it, it's a graceful no-op.

export const runtime = "nodejs";

const TRACKS = ["A", "B", "C"];
const OUTCOMES = ["progress", "yes", "paid", "shipped", "killed"];

function sb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function POST(req: NextRequest) {
  if (!rateLimit(`learn:${clientIp(req)}`, 20, 60_000)) {
    return NextResponse.json({ recorded: false, error: "too many requests" }, { status: 429 });
  }
  const identity = await serverAuth(req);
  if (identity.invalid || !identity.userId) {
    return NextResponse.json({ recorded: false, error: "authentication required" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const track = typeof body?.track === "string" && TRACKS.includes(body.track) ? body.track : null;
  const outcome = typeof body?.outcome === "string" && OUTCOMES.includes(body.outcome) ? body.outcome : null;
  if (!track || !outcome) {
    return NextResponse.json({ recorded: false, error: "track + outcome required" }, { status: 400 });
  }

  const client = sb();
  if (!client) return NextResponse.json({ recorded: false, configured: false });

  const taskType = typeof body?.taskType === "string" ? body.taskType.slice(0, 24) : null;
  const dayNum = Number.isFinite(Number(body?.day))
    ? Math.max(1, Math.min(28, Math.floor(Number(body.day))))
    : null;

  const { error } = await client
    .from("signals")
    .insert({ track, task_type: taskType, day_num: dayNum, outcome });
  if (error) return NextResponse.json({ recorded: false, error: error.message }, { status: 500 });
  return NextResponse.json({ recorded: true });
}

export async function GET() {
  const client = sb();
  if (!client) return NextResponse.json({ configured: false, patterns: [] });

  // Roll up which task types most often precede a strong outcome, per track.
  const { data, error } = await client.from("signals").select("track, task_type, outcome").limit(5000);
  if (error) {
    return NextResponse.json({ configured: true, error: error.message, patterns: [] }, { status: 500 });
  }
  const rows = data ?? [];
  const strong = new Set(["yes", "paid", "shipped"]);
  const tally: Record<string, { track: string; taskType: string; strong: number; total: number }> = {};
  for (const r of rows) {
    if (!r.task_type) continue;
    const k = `${r.track}|${r.task_type}`;
    tally[k] ??= { track: r.track, taskType: r.task_type, strong: 0, total: 0 };
    tally[k].total++;
    if (strong.has(r.outcome)) tally[k].strong++;
  }
  const patterns = Object.values(tally)
    .filter((t) => t.total >= 5) // ignore noise until there's a real sample
    .map((t) => ({ track: t.track, taskType: t.taskType, total: t.total, rate: Math.round((t.strong / t.total) * 100) }))
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 12);
  return NextResponse.json({ configured: true, count: rows.length, patterns });
}
