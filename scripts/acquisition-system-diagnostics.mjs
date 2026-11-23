import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error("Acquisition diagnostics require Supabase server credentials.");

const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const windowDays = Math.max(1, Math.min(90, Number(process.argv[2]) || 30));
const since = new Date(Date.now() - windowDays * 86_400_000).toISOString();
const now = new Date();

const funnelEvents = [
  "page_view",
  "onboarding_landed",
  "onboarding_capture_viewed",
  "account_save_started",
  "account_oauth_started",
  "account_save_completed",
  "onboarding_account_captured",
  "onboarding_resume_scheduled",
  "onboarding_started",
  "onboarding_completed",
  "plan_reveal_viewed",
  "plan_reveal_cta_clicked",
  "paywall_viewed",
  "paywall_cta_clicked",
  "checkout_started",
  "checkout_completed",
  "onboarding_recovery_email_sent",
  "journey_recovery_email_sent",
  "checkout_recovery_email_sent",
];

const [eventsResult, entitlementsResult, onboardingResult, checkoutResult, preferencesResult, profilesResult, profileCountResult] = await Promise.all([
  service.from("product_events")
    .select("event_name,user_id,anonymous_id,path,properties,created_at")
    .in("event_name", funnelEvents)
    .gte("created_at", since)
    // Keep the most recent rows when a high-volume event (usually page_view)
    // reaches the safety cap, then restore chronological order locally for
    // first-touch attribution.
    .order("created_at", { ascending: false })
    .limit(30_000),
  service.from("entitlements")
    .select("user_id,status,stripe_payment_intent_id,granted_at")
    .eq("product", "badger-28-day")
    .eq("status", "active"),
  service.from("onboarding_recoveries")
    .select("user_id,status,remind_at,reminder_count,created_at"),
  service.from("checkout_recoveries")
    .select("user_id,status,checkout_started_at,reminder_count,created_at"),
  service.from("email_preferences")
    .select("user_id,journey_nudges_enabled,created_at"),
  service.from("profiles").select("user_id,notify,created_at"),
  service.from("profiles").select("user_id", { count: "exact", head: true }),
]);

for (const result of [eventsResult, entitlementsResult, onboardingResult, checkoutResult, preferencesResult, profilesResult, profileCountResult]) {
  if (result.error) throw result.error;
}

const events = [...(eventsResult.data ?? [])].sort((left, right) => Date.parse(left.created_at) - Date.parse(right.created_at));
const entitlements = entitlementsResult.data ?? [];
const onboardingRecoveries = onboardingResult.data ?? [];
const checkoutRecoveries = checkoutResult.data ?? [];
const preferences = preferencesResult.data ?? [];
const profiles = profilesResult.data ?? [];

// Join anonymous pre-auth activity to the authenticated user when an event has
// both identifiers. This avoids counting OAuth as a brand-new founder.
const parent = new Map();
const find = (key) => {
  if (!parent.has(key)) parent.set(key, key);
  const value = parent.get(key);
  if (value !== key) parent.set(key, find(value));
  return parent.get(key);
};
const union = (left, right) => {
  const a = find(left);
  const b = find(right);
  if (a !== b) parent.set(b, a.startsWith("user:") ? a : b.startsWith("user:") ? b : a);
};
for (const row of events) {
  const user = row.user_id ? `user:${row.user_id}` : null;
  const anonymous = row.anonymous_id ? `anonymous:${row.anonymous_id}` : null;
  if (user) find(user);
  if (anonymous) find(anonymous);
  if (user && anonymous) union(user, anonymous);
}
const actor = (row) => {
  const key = row.user_id ? `user:${row.user_id}` : row.anonymous_id ? `anonymous:${row.anonymous_id}` : null;
  return key ? find(key) : null;
};
const props = (row) => row.properties && typeof row.properties === "object" && !Array.isArray(row.properties) ? row.properties : {};
const uniqueActors = (name) => new Set(events.filter((row) => row.event_name === name).map(actor).filter(Boolean)).size;

const stageCounts = Object.fromEntries(funnelEvents.map((name) => [name, uniqueActors(name)]));
const captureActors = new Set(events.filter((row) => row.event_name === "onboarding_capture_viewed").map(actor).filter(Boolean));
const stageActors = new Set(events.filter((row) => row.event_name === "onboarding_started").map(actor).filter(Boolean));
const capturedStarters = [...captureActors].filter((key) => stageActors.has(key)).length;
const startRate = captureActors.size ? Number((capturedStarters / captureActors.size).toFixed(3)) : null;

const preferenceByUser = new Map(preferences.map((row) => [row.user_id, row.journey_nudges_enabled === true]));
const notifyByUser = new Map(profiles.map((row) => [row.user_id, row.notify !== false]));
const paidUsers = new Set(entitlements.filter((row) => row.stripe_payment_intent_id).map((row) => row.user_id));
const isConsented = (userId) => preferenceByUser.get(userId) === true && notifyByUser.get(userId) !== false;

const onboardingRecovery = {
  total: onboardingRecoveries.length,
  pending: onboardingRecoveries.filter((row) => row.status === "pending").length,
  completed: onboardingRecoveries.filter((row) => row.status === "completed").length,
  optedOut: onboardingRecoveries.filter((row) => row.status === "opted_out").length,
  consented: onboardingRecoveries.filter((row) => isConsented(row.user_id)).length,
  dueNow: onboardingRecoveries.filter((row) => row.status === "pending" && row.reminder_count === 0 && Date.parse(row.remind_at) <= now.getTime()).length,
  consentedDueNow: onboardingRecoveries.filter((row) => row.status === "pending" && row.reminder_count === 0 && Date.parse(row.remind_at) <= now.getTime() && isConsented(row.user_id) && !paidUsers.has(row.user_id)).length,
  sent: onboardingRecoveries.filter((row) => row.reminder_count > 0).length,
};
const checkoutRecovery = {
  total: checkoutRecoveries.length,
  pending: checkoutRecoveries.filter((row) => row.status === "pending").length,
  converted: checkoutRecoveries.filter((row) => row.status === "converted").length,
  optedOut: checkoutRecoveries.filter((row) => row.status === "opted_out").length,
  consentedPending: checkoutRecoveries.filter((row) => row.status === "pending" && isConsented(row.user_id)).length,
  remindersSent: checkoutRecoveries.reduce((sum, row) => sum + Number(row.reminder_count || 0), 0),
};

const clean = (value, fallback = "direct_or_unknown") => typeof value === "string" && value.trim() ? value.trim().slice(0, 100).toLowerCase() : fallback;
const touchByActor = new Map();
for (const row of events) {
  const key = actor(row);
  if (!key || touchByActor.has(key)) continue;
  const property = props(row);
  touchByActor.set(key, {
    source: clean(property.utm_source),
    medium: clean(property.utm_medium, "none"),
    campaign: clean(property.utm_campaign, "none"),
  });
}

const sourceGroups = new Map();
for (const row of events) {
  const key = actor(row);
  if (!key) continue;
  const touch = touchByActor.get(key) ?? { source: "direct_or_unknown", medium: "none", campaign: "none" };
  const groupKey = `${touch.source}|${touch.medium}|${touch.campaign}`;
  const group = sourceGroups.get(groupKey) ?? { ...touch, actors: new Set(), events: new Map() };
  group.actors.add(key);
  const eventActors = group.events.get(row.event_name) ?? new Set();
  eventActors.add(key);
  group.events.set(row.event_name, eventActors);
  sourceGroups.set(groupKey, group);
}
const attribution = [...sourceGroups.values()]
  .map((group) => ({
    source: group.source,
    medium: group.medium,
    campaign: group.campaign,
    actors: group.actors.size,
    captureViewed: group.events.get("onboarding_capture_viewed")?.size ?? 0,
    accountCaptured: group.events.get("onboarding_account_captured")?.size ?? 0,
    onboardingStarted: group.events.get("onboarding_started")?.size ?? 0,
    planRevealed: group.events.get("plan_reveal_viewed")?.size ?? 0,
    paywallViewed: group.events.get("paywall_viewed")?.size ?? 0,
    checkoutStarted: group.events.get("checkout_started")?.size ?? 0,
    checkoutCompleted: group.events.get("checkout_completed")?.size ?? 0,
  }))
  .sort((left, right) => right.captureViewed - left.captureViewed || right.actors - left.actors)
  .slice(0, 20);

const paidAttribution = [];
for (const entitlement of entitlements.filter((row) => row.stripe_payment_intent_id)) {
  const key = find(`user:${entitlement.user_id}`);
  const touch = touchByActor.get(key) ?? { source: "direct_or_unknown", medium: "none", campaign: "none" };
  paidAttribution.push(touch);
}

const paidSources = Object.values(paidAttribution.reduce((groups, touch) => {
  const key = `${touch.source}|${touch.medium}|${touch.campaign}`;
  groups[key] ??= { ...touch, paidFounders: 0 };
  groups[key].paidFounders += 1;
  return groups;
}, {}));

console.log(JSON.stringify({
  generatedAt: now.toISOString(),
  windowDays,
  since,
  profilesTotal: profileCountResult.count ?? profiles.length,
  verifiedPaidFounders: paidUsers.size,
  activeAccess: entitlements.length,
  emailConsent: {
    explicitEnabledRows: preferences.filter((row) => row.journey_nudges_enabled === true).length,
    disabledRows: preferences.filter((row) => row.journey_nudges_enabled === false).length,
    noPreferenceRow: Math.max(0, (profileCountResult.count ?? profiles.length) - preferences.length),
  },
  funnel: { stages: stageCounts, capturedStarters, captureToFirstAnswer: startRate },
  recovery: { onboarding: onboardingRecovery, checkout: checkoutRecovery },
  attribution,
  verifiedPaidAttribution: paidSources,
}, null, 2));
