import { NextRequest, NextResponse } from "next/server";
import { isGoogleOAuthSession, isOwnerEmail } from "@/lib/ops-auth";
import { serverAuth } from "@/lib/server-auth";
import { TESTER_FEEDBACK_TAGS, TESTER_STATUSES, type TesterFeedbackTag, type TesterStatus } from "@/lib/tester-control";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;
const COHORT = /^[a-z0-9][a-z0-9_-]{0,79}$/;

async function owner(req: NextRequest) {
  const auth = await serverAuth(req);
  if (auth.invalid || !auth.userId || !auth.service) return { error: NextResponse.json({ error: "authentication required" }, { status: 401 }) };
  if (!isGoogleOAuthSession(auth.authMethods, auth.identityProviders) || !isOwnerEmail(auth.email)) {
    return { error: NextResponse.json({ error: "owner access required" }, { status: 403 }) };
  }
  return { service: auth.service };
}

export async function POST(req: NextRequest) {
  const access = await owner(req);
  if ("error" in access) return access.error;
  const service = access.service;
  const body = await req.json().catch(() => null);
  const userId = typeof body?.userId === "string" && UUID.test(body.userId) ? body.userId : null;
  const cohort = typeof body?.cohort === "string" && COHORT.test(body.cohort) ? body.cohort : null;
  const status = TESTER_STATUSES.includes(body?.status as TesterStatus) ? body.status as TesterStatus : null;
  const ownerNotes = typeof body?.ownerNotes === "string" ? body.ownerNotes.trim().slice(0, 3000) : null;
  const feedbackTags = Array.isArray(body?.feedbackTags)
    ? [...new Set(body.feedbackTags.filter((tag: unknown): tag is TesterFeedbackTag => TESTER_FEEDBACK_TAGS.includes(tag as TesterFeedbackTag)))].slice(0, 12)
    : null;
  if (!userId || !cohort || !status || ownerNotes === null || feedbackTags === null) {
    return NextResponse.json({ error: "invalid tester update" }, { status: 400 });
  }

  const account = await service.auth.admin.getUserById(userId);
  if (account.error || !account.data.user) return NextResponse.json({ error: "user not found" }, { status: 404 });

  const { data, error } = await service.from("tester_accounts").upsert({
    user_id: userId,
    cohort,
    status,
    feedback_tags: feedbackTags,
    owner_notes: ownerNotes,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" }).select("user_id, cohort, status, feedback_tags, owner_notes, invited_at, created_at, updated_at").single();

  if (error) {
    console.error("[ops-testers] upsert failed", error.code ?? "database_error");
    return NextResponse.json({ error: "tester update unavailable" }, { status: 503 });
  }
  return NextResponse.json({ tester: data }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function DELETE(req: NextRequest) {
  const access = await owner(req);
  if ("error" in access) return access.error;
  const service = access.service;
  const userId = new URL(req.url).searchParams.get("userId");
  if (!userId || !UUID.test(userId)) return NextResponse.json({ error: "invalid user" }, { status: 400 });
  const { error } = await service.from("tester_accounts").delete().eq("user_id", userId);
  if (error) {
    console.error("[ops-testers] delete failed", error.code ?? "database_error");
    return NextResponse.json({ error: "tester update unavailable" }, { status: 503 });
  }
  return NextResponse.json({ removed: true }, { headers: { "Cache-Control": "private, no-store" } });
}
