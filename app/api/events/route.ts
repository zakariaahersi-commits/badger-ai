import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { serverAuth } from "@/lib/server-auth";

const EVENTS = new Set([
  "page_view", "onboarding_landed", "onboarding_started", "onboarding_capture_viewed", "onboarding_account_captured", "onboarding_resume_scheduled", "onboarding_recovery_email_sent", "idea_finder_viewed", "idea_database_matched", "idea_opportunity_selected", "onboarding_step_viewed", "onboarding_completed", "account_created",
  "onboarding_step_completed", "onboarding_answered", "bo_reflection_shown", "onboarding_ai_timeout",
  "diagnosis_viewed", "plan_reveal_viewed", "plan_reveal_cta_clicked", "journey_save_viewed", "account_save_started",
  "account_save_completed", "paywall_viewed", "paywall_cta_clicked",
  "signed_in", "checkout_started", "checkout_completed", "checkout_failed", "task_completed",
  "account_oauth_started",
  "today_task_viewed", "task_started", "bo_help_opened", "coach_viewed", "evidence_prompt_viewed",
  "evidence_added", "achievement_unlocked", "launch_receipt_shared", "coach_message_sent", "push_enabled", "imessage_link_created",
  "imessage_link_opened", "bug_reported", "client_error",
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cleanProperties(value: unknown): Record<string, string | number | boolean | null> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: Record<string, string | number | boolean | null> = {};
  for (const [key, item] of Object.entries(value).slice(0, 12)) {
    if (!/^[a-z][a-z0-9_]{0,39}$/i.test(key)) continue;
    if (typeof item === "string") result[key] = item.slice(0, 300);
    else if (typeof item === "number" && Number.isFinite(item)) result[key] = item;
    else if (typeof item === "boolean" || item === null) result[key] = item;
  }
  return result;
}

function eventProperties(value: unknown): Record<string, string | number | boolean | null> {
  const result = cleanProperties(value);
  const release = process.env.VERCEL_GIT_COMMIT_SHA || process.env.NEXT_PUBLIC_APP_RELEASE;
  if (release) result.release = release.slice(0, 40);
  if (process.env.VERCEL_ENV) result.environment = process.env.VERCEL_ENV.slice(0, 20);
  return result;
}

export async function POST(req: NextRequest) {
  // Local and preview builds must never pollute the production conversion
  // funnel. Vercel sets this to "production" only for the live deployment.
  if (process.env.VERCEL_ENV !== "production" && process.env.ALLOW_NONPRODUCTION_ANALYTICS !== "true") {
    return NextResponse.json({ recorded: false, environment: process.env.VERCEL_ENV || "local" }, { status: 202 });
  }
  if (!rateLimit(`events:${clientIp(req)}`, 120, 60_000)) {
    return NextResponse.json({ recorded: false }, { status: 429 });
  }
  const body = await req.json().catch(() => null);
  if (!body || !EVENTS.has(body.event)) return NextResponse.json({ recorded: false }, { status: 400 });
  const auth = await serverAuth(req);
  if (auth.invalid) return NextResponse.json({ recorded: false }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonymousId = typeof body.anonymousId === "string" && UUID.test(body.anonymousId) ? body.anonymousId : null;
  if (!url || !key || (!auth.userId && !anonymousId)) return NextResponse.json({ recorded: false }, { status: 503 });

  const service = auth.service ?? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const path = typeof body.path === "string" && body.path.startsWith("/") ? body.path.slice(0, 300) : null;
  const { error } = await service.from("product_events").insert({
    user_id: auth.userId,
    anonymous_id: anonymousId,
    event_name: body.event,
    path,
    properties: eventProperties(body.properties),
  });
  if (error) {
    console.error("[events] insert failed", error.code ?? "database_error");
    return NextResponse.json({ recorded: false }, { status: 503 });
  }
  return NextResponse.json({ recorded: true }, { status: 202 });
}
