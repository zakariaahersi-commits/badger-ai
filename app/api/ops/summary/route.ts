import { NextRequest, NextResponse } from "next/server";
import { serverAuth } from "@/lib/server-auth";
import { calendarSprintDay } from "@/lib/sprint-calendar";
import { isGoogleOAuthSession, isOwnerEmail } from "@/lib/ops-auth";
import { eventRelease, testerAttention, testerJourney, type TesterStatus } from "@/lib/tester-control";

function number(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function later(...values: Array<string | null | undefined>): string | null {
  const valid = values.filter((value): value is string => Boolean(value) && Number.isFinite(Date.parse(value!)));
  return valid.sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null;
}

export async function GET(req: NextRequest) {
  const auth = await serverAuth(req);
  if (auth.invalid || !auth.userId || !auth.service) return NextResponse.json({ error: "authentication required" }, { status: 401 });
  if (!isGoogleOAuthSession(auth.authMethods, auth.identityProviders)) {
    return NextResponse.json({ error: "Google owner sign-in required" }, { status: 403 });
  }
  if (!isOwnerEmail(auth.email)) return NextResponse.json({ error: "owner access required" }, { status: 403 });

  const now = new Date();
  const since30 = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const since7 = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const [events, profiles, entitlements, recoveries, sprints, bugs, deliveries, wakes, aiUsage, testers, emailEvents, welcomeEvents, authUsers] = await Promise.all([
    auth.service.from("product_events").select("user_id, anonymous_id, event_name, path, properties, created_at").gte("created_at", since30).order("created_at", { ascending: false }).limit(5000),
    auth.service.from("profiles").select("user_id, email, name, plan_start, created_at").order("created_at", { ascending: false }).limit(500),
    auth.service.from("entitlements").select("user_id, status, granted_at, updated_at").order("granted_at", { ascending: false }).limit(500),
    auth.service.from("checkout_recoveries").select("user_id, status, checkout_started_at, reminder_count, first_reminder_at, final_reminder_at, converted_at, updated_at").order("checkout_started_at", { ascending: false }).limit(500),
    auth.service.from("sprints").select("user_id, state, updated_at").order("updated_at", { ascending: false }).limit(500),
    auth.service.from("bug_reports").select("id, user_id, category, severity, status, summary, details, path, created_at").order("created_at", { ascending: false }).limit(100),
    auth.service.from("coach_deliveries").select("user_id, channel, status, provider_id, error_code, sent_at, created_at").gte("created_at", since30).order("created_at", { ascending: false }).limit(2000),
    auth.service.from("coach_wakes").select("user_id, status, trigger_type, scheduled_for, created_at").gte("created_at", since30).order("created_at", { ascending: false }).limit(2000),
    auth.service.from("ai_usage_events").select("user_id, feature, provider, model, prompt_tokens, completion_tokens, audio_seconds, estimated_cost_usd, latency_ms, success, error_code, created_at").gte("created_at", since30).order("created_at", { ascending: false }).limit(5000),
    auth.service.from("tester_accounts").select("user_id, cohort, status, feedback_tags, owner_notes, invited_at, created_at, updated_at").order("invited_at", { ascending: false }).limit(500),
    auth.service.from("email_events").select("user_id, resend_email_id, event_type, occurred_at").gte("occurred_at", since30).order("occurred_at", { ascending: false }).limit(10000),
    auth.service.from("domain_events").select("user_id, event_type, payload, created_at").eq("event_type", "lifecycle.welcome_email_sent").gte("created_at", since30).limit(1000),
    auth.service.auth.admin.listUsers({ page: 1, perPage: 500 }),
  ]);

  const queryErrors = [events.error, profiles.error, entitlements.error, recoveries.error, sprints.error, bugs.error, deliveries.error, wakes.error, aiUsage.error, testers.error, emailEvents.error, welcomeEvents.error, authUsers.error].filter(Boolean);
  if (queryErrors.length) {
    console.error("[ops] summary query failed", queryErrors.map((error) => error?.message ?? "unknown"));
    return NextResponse.json({ error: "dashboard data unavailable" }, { status: 503 });
  }

  const eventRows = events.data ?? [];
  const usageRows = aiUsage.data ?? [];
  const profileRows = profiles.data ?? [];
  const entitlementRows = entitlements.data ?? [];
  const recoveryRows = recoveries.data ?? [];
  const sprintRows = sprints.data ?? [];
  const testerRows = testers.data ?? [];
  const authRows = authUsers.data?.users ?? [];
  const counts: Record<string, number> = {};
  for (const event of eventRows) counts[event.event_name] = (counts[event.event_name] ?? 0) + 1;

  const active30 = new Set(eventRows.flatMap((event) => event.user_id ? [event.user_id] : []));
  const active7 = new Set(eventRows.flatMap((event) => event.user_id && event.created_at >= since7 ? [event.user_id] : []));
  const activeEntitlements = entitlementRows.filter((row) => row.status === "active");
  const pendingRecoveries = recoveryRows.filter((row) => row.status === "pending");
  const refundedEntitlements = entitlementRows.filter((row) => row.status === "refunded");
  const totalPromptTokens = usageRows.reduce((sum, row) => sum + number(row.prompt_tokens), 0);
  const totalCompletionTokens = usageRows.reduce((sum, row) => sum + number(row.completion_tokens), 0);
  const totalAiCostUsd = usageRows.reduce((sum, row) => sum + number(row.estimated_cost_usd), 0);
  const failedAiCalls = usageRows.filter((row) => !row.success).length;
  const failedDeliveries = (deliveries.data ?? []).filter((row) => row.status === "failed").length;
  const trackedEmailIds = new Set((emailEvents.data ?? []).map((row) => row.resend_email_id));
  const openedEmailIds = new Set((emailEvents.data ?? []).filter((row) => row.event_type === "email.opened").map((row) => row.resend_email_id));
  const clickedEmailIds = new Set((emailEvents.data ?? []).filter((row) => row.event_type === "email.clicked").map((row) => row.resend_email_id));
  const stuckWakes = (wakes.data ?? []).filter((row) => row.status === "queued" && Date.parse(row.scheduled_for) < now.getTime() - 3_600_000).length;

  const onboardingSteps: Record<string, number> = {};
  for (const event of eventRows) {
    if (event.event_name !== "onboarding_step_viewed") continue;
    const screen = typeof event.properties?.screen === "string" ? event.properties.screen : "unknown";
    onboardingSteps[screen] = (onboardingSteps[screen] ?? 0) + 1;
  }

  const dailyMap = new Map<string, { date: string; events: number; active: Set<string>; tasks: number; coachMessages: number; tokens: number; costUsd: number }>();
  for (let offset = 29; offset >= 0; offset -= 1) {
    const date = new Date(now.getTime() - offset * 86_400_000).toISOString().slice(0, 10);
    dailyMap.set(date, { date, events: 0, active: new Set(), tasks: 0, coachMessages: 0, tokens: 0, costUsd: 0 });
  }
  for (const event of eventRows) {
    const daily = dailyMap.get(event.created_at.slice(0, 10));
    if (!daily) continue;
    daily.events += 1;
    if (event.user_id) daily.active.add(event.user_id);
    if (event.event_name === "task_completed") daily.tasks += 1;
    if (event.event_name === "coach_message_sent") daily.coachMessages += 1;
  }
  for (const usage of usageRows) {
    const daily = dailyMap.get(usage.created_at.slice(0, 10));
    if (!daily) continue;
    daily.tokens += number(usage.prompt_tokens) + number(usage.completion_tokens);
    daily.costUsd += number(usage.estimated_cost_usd);
  }

  const aiByFeature: Record<string, { calls: number; tokens: number; costUsd: number; failures: number; totalLatencyMs: number; avgLatencyMs?: number }> = {};
  for (const usage of usageRows) {
    const item = aiByFeature[usage.feature] ?? { calls: 0, tokens: 0, costUsd: 0, failures: 0, totalLatencyMs: 0 };
    item.calls += 1;
    item.tokens += number(usage.prompt_tokens) + number(usage.completion_tokens);
    item.costUsd += number(usage.estimated_cost_usd);
    item.failures += usage.success ? 0 : 1;
    item.totalLatencyMs += number(usage.latency_ms);
    aiByFeature[usage.feature] = item;
  }
  for (const item of Object.values(aiByFeature)) item.avgLatencyMs = item.calls ? Math.round(item.totalLatencyMs / item.calls) : 0;

  const eventsByUser = new Map<string, typeof eventRows>();
  for (const event of eventRows) {
    if (!event.user_id) continue;
    const list = eventsByUser.get(event.user_id) ?? [];
    list.push(event);
    eventsByUser.set(event.user_id, list);
  }
  const usageByUser = new Map<string, typeof usageRows>();
  for (const usage of usageRows) {
    if (!usage.user_id) continue;
    const list = usageByUser.get(usage.user_id) ?? [];
    list.push(usage);
    usageByUser.set(usage.user_id, list);
  }
  const profileByUser = new Map(profileRows.map((profile) => [profile.user_id, profile]));
  const entitlementByUser = new Map(entitlementRows.map((entitlement) => [entitlement.user_id, entitlement]));
  const sprintByUser = new Map(sprintRows.map((sprint) => [sprint.user_id, sprint]));
  const recoveryByUser = new Map(recoveryRows.map((recovery) => [recovery.user_id, recovery]));
  const emailEventsByUser = new Map<string, NonNullable<typeof emailEvents.data>>();
  for (const event of emailEvents.data ?? []) {
    if (!event.user_id) continue;
    const list = emailEventsByUser.get(event.user_id) ?? [];
    list.push(event);
    emailEventsByUser.set(event.user_id, list);
  }

  const users = authRows.map((account) => {
    const profile = profileByUser.get(account.id);
    const entitlement = entitlementByUser.get(account.id);
    const recovery = recoveryByUser.get(account.id);
    const sprint = sprintByUser.get(account.id);
    const userEvents = eventsByUser.get(account.id) ?? [];
    const userUsage = usageByUser.get(account.id) ?? [];
    const state = sprint?.state && typeof sprint.state === "object" ? sprint.state as Record<string, unknown> : {};
    const logs = state.logs && typeof state.logs === "object" ? state.logs as Record<string, unknown> : {};
    const timezone = state.profile && typeof state.profile === "object" && typeof (state.profile as Record<string, unknown>).timezone === "string"
      ? (state.profile as Record<string, string>).timezone
      : "UTC";
    const accessStart = entitlement?.status === "active" ? entitlement.granted_at : null;
    const day = accessStart ? Math.min(28, calendarSprintDay(accessStart, now, timezone)) : null;
    const userEmailEvents = emailEventsByUser.get(account.id) ?? [];
    const trackedIds = new Set(userEmailEvents.map((event) => event.resend_email_id));
    const sentIds = new Set(userEmailEvents.map((event) => event.resend_email_id));
    for (const delivery of deliveries.data ?? []) {
      if (delivery.user_id === account.id && delivery.channel === "email" && delivery.status === "sent" && delivery.provider_id) sentIds.add(delivery.provider_id);
    }
    for (const event of welcomeEvents.data ?? []) {
      const messageId = event.user_id === account.id && typeof event.payload?.messageId === "string" ? event.payload.messageId : null;
      if (messageId) sentIds.add(messageId);
    }
    const deliveredIds = new Set(userEmailEvents.filter((event) => ["email.delivered", "email.opened", "email.clicked"].includes(event.event_type)).map((event) => event.resend_email_id));
    const openedIds = new Set(userEmailEvents.filter((event) => event.event_type === "email.opened").map((event) => event.resend_email_id));
    const clickedIds = new Set(userEmailEvents.filter((event) => event.event_type === "email.clicked").map((event) => event.resend_email_id));
    return {
      userId: account.id,
      email: profile?.email || account.email || "",
      name: profile?.name || account.user_metadata?.name || "",
      joinedAt: account.created_at,
      emailConfirmedAt: account.email_confirmed_at ?? null,
      lastSignInAt: account.last_sign_in_at ?? null,
      lastActiveAt: later(userEvents[0]?.created_at, sprint?.updated_at, account.last_sign_in_at),
      paidStatus: entitlement?.status === "active" ? "active" : recovery?.status === "pending" ? "checkout_pending" : entitlement?.status ?? "none",
      paidAt: accessStart,
      checkoutRecoveryStatus: recovery?.status ?? "none",
      checkoutStartedAt: recovery?.checkout_started_at ?? null,
      checkoutReminders: recovery?.reminder_count ?? 0,
      day,
      daysRemaining: day ? Math.max(0, 28 - day) : null,
      tasksCompleted: Object.keys(logs).length,
      coachMessages: userEvents.filter((event) => event.event_name === "coach_message_sent").length,
      tokens: userUsage.reduce((sum, usage) => sum + number(usage.prompt_tokens) + number(usage.completion_tokens), 0),
      aiCostUsd: userUsage.reduce((sum, usage) => sum + number(usage.estimated_cost_usd), 0),
      emailsSent: sentIds.size,
      emailsTracked: trackedIds.size,
      emailsDelivered: deliveredIds.size,
      emailsOpened: openedIds.size,
      emailsClicked: clickedIds.size,
      lastEmailAt: userEmailEvents[0]?.occurred_at ?? null,
      lastEvent: userEvents[0]?.event_name ?? null,
    };
  }).sort((left, right) => Date.parse(right.lastActiveAt ?? right.joinedAt) - Date.parse(left.lastActiveAt ?? left.joinedAt));

  const userById = new Map(users.map((user) => [user.userId, user]));
  const testerAccounts = testerRows.flatMap((tester) => {
    const user = userById.get(tester.user_id);
    if (!user) return [];
    const userEvents = eventsByUser.get(user.userId) ?? [];
    const userDeliveries = (deliveries.data ?? []).filter((delivery) => delivery.user_id === user.userId);
    const userBugs = (bugs.data ?? []).filter((bug) => bug.user_id === user.userId);
    const openBugs = userBugs.filter((bug) => bug.status !== "resolved" && bug.status !== "closed");
    const journey = testerJourney({
      emailConfirmedAt: user.emailConfirmedAt,
      paidAt: user.paidAt,
      events: userEvents,
      tasksCompleted: user.tasksCompleted,
    });
    const attention = testerAttention({
      now,
      status: tester.status as TesterStatus,
      invitedAt: tester.invited_at,
      joinedAt: user.joinedAt,
      emailConfirmedAt: user.emailConfirmedAt,
      paidAt: user.paidAt,
      day: user.day,
      tasksCompleted: user.tasksCompleted,
      lastActiveAt: user.lastActiveAt,
      events: userEvents,
      failedDeliveries: userDeliveries.filter((delivery) => delivery.status === "failed").length,
      openBugs,
    });
    const timeline = [
      ...userEvents.slice(0, 60).map((event) => ({
        kind: "event" as const,
        label: event.event_name,
        createdAt: event.created_at,
        path: event.path,
        status: null,
        detail: null,
        release: eventRelease(event.properties),
      })),
      ...userDeliveries.slice(0, 30).map((delivery) => ({
        kind: "delivery" as const,
        label: `${delivery.channel}_message`,
        createdAt: delivery.sent_at || delivery.created_at,
        path: null,
        status: delivery.status,
        detail: delivery.error_code,
        release: null,
      })),
      ...userBugs.map((bug) => ({
        kind: "bug" as const,
        label: bug.summary,
        createdAt: bug.created_at,
        path: bug.path,
        status: bug.status,
        detail: `${bug.category} · ${bug.severity}`,
        release: null,
      })),
    ].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)).slice(0, 80);
    return [{
      ...user,
      cohort: tester.cohort,
      testerStatus: tester.status,
      feedbackTags: tester.feedback_tags ?? [],
      ownerNotes: tester.owner_notes,
      invitedAt: tester.invited_at,
      testerUpdatedAt: tester.updated_at,
      journey,
      attention,
      timeline,
    }];
  });

  return NextResponse.json({
    generatedAt: now.toISOString(),
    windowDays: 30,
    kpis: {
      users: authRows.length,
      newUsers7d: authRows.filter((user) => user.created_at >= since7).length,
      activeUsers7d: active7.size,
      activeUsers30d: active30.size,
      paidAccess: activeEntitlements.length,
      pendingCheckoutRecoveries: pendingRecoveries.length,
      grossRevenueUsd: (activeEntitlements.length + refundedEntitlements.length) * 49,
      netRevenueUsd: activeEntitlements.length * 49,
      refunds: refundedEntitlements.length,
      tasksCompleted30d: counts.task_completed ?? 0,
      coachMessages30d: counts.coach_message_sent ?? 0,
      aiTokens30d: totalPromptTokens + totalCompletionTokens,
      aiCostUsd30d: totalAiCostUsd,
      aiFailures30d: failedAiCalls,
      openBugs: (bugs.data ?? []).filter((bug) => bug.status !== "resolved" && bug.status !== "closed").length,
      failedDeliveries,
      emailsTracked30d: trackedEmailIds.size,
      emailsOpened30d: openedEmailIds.size,
      emailsClicked30d: clickedEmailIds.size,
      stuckWakes,
      testers: testerAccounts.length,
      testersNeedingAttention: testerAccounts.filter((tester) => tester.attention.length > 0).length,
    },
    funnel: {
      pageViews: counts.page_view ?? 0,
      onboardingStarted: counts.onboarding_started ?? 0,
      onboardingCompleted: counts.onboarding_completed ?? 0,
      accountCreated: counts.account_created ?? 0,
      demoStarted: counts.demo_started ?? 0,
      demoCompleted: counts.demo_completed ?? 0,
      demoCtaClicked: counts.demo_cta_clicked ?? 0,
      checkoutStarted: counts.checkout_started ?? 0,
      checkoutCompleted: counts.checkout_completed ?? 0,
      journeyRecoveryEmails: counts.journey_recovery_email_sent ?? 0,
      checkoutRecoveryEmails: counts.checkout_recovery_email_sent ?? 0,
      checkoutFailed: counts.checkout_failed ?? 0,
      taskCompleted: counts.task_completed ?? 0,
      coachMessages: counts.coach_message_sent ?? 0,
    },
    onboardingSteps,
    daily: [...dailyMap.values()].map((item) => ({ ...item, activeUsers: item.active.size, active: undefined })),
    aiByFeature,
    users,
    testers: testerAccounts,
    bugs: bugs.data ?? [],
    recentEvents: eventRows.slice(0, 100),
    deliveries: (deliveries.data ?? []).slice(0, 100),
    release: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) || process.env.NEXT_PUBLIC_APP_RELEASE || "local",
  }, { headers: { "Cache-Control": "private, no-store" } });
}
