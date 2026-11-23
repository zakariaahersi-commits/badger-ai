import { NextRequest, NextResponse } from "next/server";
import { serverAuth } from "@/lib/server-auth";

export const runtime = "nodejs";

const TRACKS = new Set(["undecided", "A", "B", "C"]);
const MAX_REMINDER_MS = 30 * 24 * 60 * 60 * 1000;

function safeReminder(value: unknown): string {
  const fallback = new Date(Date.now() + 6 * 60 * 60 * 1000);
  if (typeof value !== "string") return fallback.toISOString();
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return fallback.toISOString();
  const earliest = Date.now() + 5 * 60 * 1000;
  const latest = Date.now() + MAX_REMINDER_MS;
  return new Date(Math.min(latest, Math.max(earliest, timestamp))).toISOString();
}

export async function POST(req: NextRequest) {
  const auth = await serverAuth(req);
  if (auth.invalid || !auth.userId || !auth.service) {
    return NextResponse.json({ error: "authentication required" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({})) as {
    track?: unknown;
    remindAt?: unknown;
    completed?: unknown;
  };
  const track = typeof body.track === "string" && TRACKS.has(body.track) ? body.track : "undecided";

  const now = new Date().toISOString();
  const email = auth.email ?? "";
  const name = "";

  const { data: existingProfile, error: profileReadError } = await auth.service
    .from("profiles")
    .select("user_id")
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (profileReadError) return NextResponse.json({ error: "could not save your account" }, { status: 503 });

  const profileWrite = existingProfile
    ? auth.service.from("profiles").update({ email }).eq("user_id", auth.userId)
    : auth.service.from("profiles").insert({
        user_id: auth.userId,
        email,
        name,
        idea_short: "",
        notify: true,
      });
  const { error: profileWriteError } = await profileWrite;
  if (profileWriteError) return NextResponse.json({ error: "could not save your account" }, { status: 503 });

  if (body.completed === true) {
    const { error } = await auth.service.from("onboarding_recoveries").update({
      status: "completed",
      completed_at: now,
      updated_at: now,
    }).eq("user_id", auth.userId).eq("status", "pending");
    if (error) return NextResponse.json({ error: "could not finish onboarding recovery" }, { status: 503 });
    return NextResponse.json({ captured: true, status: "completed" });
  }

  const remindAt = safeReminder(body.remindAt);
  const requested = typeof body.remindAt === "string";
  const { data: existingRecovery, error: recoveryReadError } = await auth.service
    .from("onboarding_recoveries")
    .select("status")
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (recoveryReadError) return NextResponse.json({ error: "could not save your reminder" }, { status: 503 });

  if (requested) {
    const { error: preferenceError } = await auth.service.from("email_preferences").upsert({
      user_id: auth.userId,
      journey_nudges_enabled: true,
      unsubscribed_at: null,
      updated_at: now,
    }, { onConflict: "user_id" });
    if (preferenceError) return NextResponse.json({ error: "could not save reminder preferences" }, { status: 503 });

    if (existingRecovery?.status !== "completed") {
      const recoveryWrite = existingRecovery
        ? auth.service.from("onboarding_recoveries").update({
            track,
            status: "pending",
            remind_at: remindAt,
            reminder_count: 0,
            last_reminder_at: null,
            completed_at: null,
            updated_at: now,
          }).eq("user_id", auth.userId)
        : auth.service.from("onboarding_recoveries").insert({
          user_id: auth.userId,
          track,
          status: "pending",
          remind_at: remindAt,
          reminder_count: 0,
          last_reminder_at: null,
          completed_at: null,
          updated_at: now,
        });
      const { error } = await recoveryWrite;
      if (error) return NextResponse.json({ error: "could not save your reminder" }, { status: 503 });
    }
  } else if (existingRecovery?.status === "pending") {
    const { error } = await auth.service.from("onboarding_recoveries")
      .update({ track, updated_at: now })
      .eq("user_id", auth.userId)
      .eq("status", "pending");
    if (error) return NextResponse.json({ error: "could not update your saved place" }, { status: 503 });
  }

  await auth.service.from("product_events").insert({
    user_id: auth.userId,
    event_name: requested ? "onboarding_resume_scheduled" : "onboarding_account_captured",
    path: "/start",
    properties: { track, requested, remind_at: requested ? remindAt : null },
  });

  return NextResponse.json({ captured: true, status: requested ? "pending" : "captured", remindAt: requested ? remindAt : null });
}
