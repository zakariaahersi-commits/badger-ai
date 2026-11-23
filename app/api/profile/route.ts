import { NextRequest, NextResponse } from "next/server";
import { loadFounderBrain } from "@/lib/founder-brain";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { serverAuth } from "@/lib/server-auth";

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().slice(0, max);
  return cleaned || null;
}

function time(value: unknown): string | null {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : null;
}

export async function GET(req: NextRequest) {
  const auth = await serverAuth(req);
  if (auth.invalid || !auth.userId || !auth.service) {
    return NextResponse.json({ error: "authentication required" }, { status: 401 });
  }

  const [profile, orders, memories, evidence, brain] = await Promise.all([
    auth.service.from("profiles").select("name, email, avatar_path, idea_short, plan_start, notify").eq("user_id", auth.userId).maybeSingle(),
    auth.service.from("coach_standing_orders").select("timezone, quiet_start, quiet_end, max_daily_nudges, accountability_level, email_enabled, push_enabled, instructions").eq("user_id", auth.userId).maybeSingle(),
    auth.service.from("coach_memories").select("id, kind, content, confidence, status, created_at, confirmed_at").eq("user_id", auth.userId).order("created_at", { ascending: false }).limit(30),
    auth.service.from("evidence_records").select("id, day_num, claim_type, source_type, status, claim_summary, source_url, verdict_note, occurred_at, created_at").eq("user_id", auth.userId).order("created_at", { ascending: false }).limit(50),
    loadFounderBrain(auth.service, auth.userId),
  ]);

  return NextResponse.json({
    profile: profile.data ?? null,
    standingOrders: orders.data ?? null,
    memories: memories.data ?? [],
    evidence: evidence.data ?? [],
    brain: {
      brief: brain.brief,
      entities: brain.entities.slice(0, 30),
      commitments: brain.commitments,
    },
  });
}

export async function PATCH(req: NextRequest) {
  if (!rateLimit(`profile:${clientIp(req)}`, 30, 60_000)) {
    return NextResponse.json({ error: "rate limited" }, { status: 429 });
  }
  const auth = await serverAuth(req);
  if (auth.invalid || !auth.userId || !auth.service || !auth.email) {
    return NextResponse.json({ error: "authentication required" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "invalid body" }, { status: 400 });

  const profilePatch: Record<string, unknown> = { user_id: auth.userId, email: auth.email };
  const name = text(body.name, 120);
  const avatarPath = text(body.avatarPath, 1_000);
  if (name) profilePatch.name = name;
  if (avatarPath) profilePatch.avatar_path = avatarPath;
  if (typeof body.notify === "boolean") profilePatch.notify = body.notify;

  const hasOrderPatch = ["timezone", "quietStart", "quietEnd", "maxDailyNudges", "accountabilityLevel", "emailEnabled", "pushEnabled", "instructions"]
    .some((key) => Object.prototype.hasOwnProperty.call(body, key));
  const accountability = ["gentle", "direct", "firm"].includes(body.accountabilityLevel) ? body.accountabilityLevel : "direct";
  const instructions = Array.isArray(body.instructions)
    ? body.instructions.flatMap((item: unknown) => {
        const value = text(item, 300);
        return value ? [value] : [];
      }).slice(0, 10)
    : [];
  const timezone = text(body.timezone, 80) ?? "UTC";
  const quietStart = time(body.quietStart) ?? "21:00";
  const quietEnd = time(body.quietEnd) ?? "08:00";
  const maxDailyNudges = Math.max(0, Math.min(6, Number(body.maxDailyNudges) || 2));

  let profileError: { code?: string } | null = null;
  let orderError: { code?: string } | null = null;
  if (Object.keys(profilePatch).length > 2) {
    const result = await auth.service.from("profiles").upsert(profilePatch, { onConflict: "user_id" });
    profileError = result.error;
  }
  if (hasOrderPatch) {
    const result = await auth.service.from("coach_standing_orders").upsert({
      user_id: auth.userId,
      timezone,
      quiet_start: quietStart,
      quiet_end: quietEnd,
      max_daily_nudges: maxDailyNudges,
      accountability_level: accountability,
      email_enabled: typeof body.emailEnabled === "boolean" ? body.emailEnabled : true,
      push_enabled: typeof body.pushEnabled === "boolean" ? body.pushEnabled : true,
      instructions,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    orderError = result.error;
  }
  if (profileError || orderError) {
    console.error("[profile] update failed", profileError?.code ?? orderError?.code ?? "database_error");
    return NextResponse.json({ error: "profile update failed" }, { status: 503 });
  }
  return NextResponse.json({ updated: true });
}
