import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error("Onboarding diagnostics require Supabase server credentials.");

const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const windowDays = Math.max(1, Math.min(30, Number(process.argv[2]) || 14));
const since = new Date(Date.now() - windowDays * 86_400_000).toISOString();
const eventNames = [
  "onboarding_landed",
  "onboarding_started",
  "onboarding_step_viewed",
  "onboarding_step_completed",
  "onboarding_completed",
  "plan_reveal_viewed",
  "plan_reveal_cta_clicked",
  "journey_save_viewed",
  "account_save_started",
  "account_save_completed",
  "paywall_viewed",
  "paywall_cta_clicked",
  "checkout_started",
  "checkout_completed",
];

const { data, error } = await service.from("product_events")
  .select("event_name,user_id,anonymous_id,properties,created_at")
  .in("event_name", eventNames)
  .gte("created_at", since)
  .order("created_at", { ascending: true })
  .limit(20_000);
if (error) throw error;

const rows = data ?? [];
const actor = (row) => row.user_id ? `user:${row.user_id}` : row.anonymous_id ? `anonymous:${row.anonymous_id}` : null;
const props = (row) => row.properties && typeof row.properties === "object" && !Array.isArray(row.properties) ? row.properties : {};
const cohort = (row) => {
  const value = props(row).flow_version || props(row).release;
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 40) : null;
};

const cohortActors = new Map();
for (const row of rows) {
  const version = cohort(row);
  const key = actor(row);
  if (!version || !key) continue;
  const group = cohortActors.get(version) ?? { actors: new Set(), latestAt: 0 };
  group.actors.add(key);
  group.latestAt = Math.max(group.latestAt, Date.parse(row.created_at) || 0);
  cohortActors.set(version, group);
}
const cohortSummary = [...cohortActors.entries()]
  .sort((left, right) => right[1].latestAt - left[1].latestAt || right[1].actors.size - left[1].actors.size)
  .map(([name, value]) => ({ name, actors: value.actors.size, latestAt: new Date(value.latestAt).toISOString() }));
const requestedCohort = typeof process.argv[3] === "string" ? process.argv[3].trim() : "";
const selectedCohort = requestedCohort || cohortSummary[0]?.name || null;

const enteredAt = new Map();
for (const row of rows) {
  if (cohort(row) !== selectedCohort) continue;
  const key = actor(row);
  if (!key) continue;
  const time = Date.parse(row.created_at);
  if (Number.isFinite(time)) enteredAt.set(key, Math.min(enteredAt.get(key) ?? time, time));
}
const cohortRows = rows.filter((row) => {
  const explicit = cohort(row);
  if (explicit) return explicit === selectedCohort;
  const key = actor(row);
  const started = key ? enteredAt.get(key) : undefined;
  const time = Date.parse(row.created_at);
  return started !== undefined && Number.isFinite(time) && time >= started;
});

const unique = (name) => new Set(cohortRows.filter((row) => row.event_name === name).map(actor).filter(Boolean)).size;
const stages = Object.fromEntries(eventNames.filter((name) => name !== "onboarding_step_viewed" && name !== "onboarding_step_completed").map((name) => [name, unique(name)]));
const stepGroups = new Map();
for (const row of cohortRows) {
  if (!["onboarding_step_viewed", "onboarding_step_completed"].includes(row.event_name)) continue;
  const key = actor(row);
  const property = props(row);
  const screen = typeof property.screen === "string" ? property.screen.trim().slice(0, 80) : "";
  const ordinal = Number(property.step);
  if (!key || !screen || !Number.isInteger(ordinal)) continue;
  const group = stepGroups.get(screen) ?? { screen, phase: String(property.phase || ""), step: ordinal, viewed: new Set(), completed: new Set(), elapsedMs: [] };
  group.step = Math.min(group.step, ordinal);
  group[row.event_name === "onboarding_step_viewed" ? "viewed" : "completed"].add(key);
  const elapsedMs = Number(property.elapsed_ms);
  if (row.event_name === "onboarding_step_completed" && Number.isFinite(elapsedMs) && elapsedMs >= 0 && elapsedMs <= 30 * 60 * 1000) group.elapsedMs.push(elapsedMs);
  stepGroups.set(screen, group);
}
const median = (values) => {
  if (!values.length) return null;
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return Math.round(ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2);
};
const steps = [...stepGroups.values()].sort((left, right) => left.step - right.step).map((step) => ({
  screen: step.screen,
  phase: step.phase,
  step: step.step,
  viewed: step.viewed.size,
  completed: step.completed.size,
  completionRate: step.viewed.size ? Number((step.completed.size / step.viewed.size).toFixed(3)) : null,
  medianCompletionMs: median(step.elapsedMs),
}));

const transitions = steps.slice(0, -1).map((step, index) => ({
  from: step.screen,
  to: steps[index + 1].screen,
  fromViewed: step.viewed,
  toViewed: steps[index + 1].viewed,
  retention: step.viewed ? Number((steps[index + 1].viewed / step.viewed).toFixed(3)) : null,
}));

console.log(JSON.stringify({ generatedAt: new Date().toISOString(), windowDays, cohorts: cohortSummary, selectedCohort, cohortActorCount: enteredAt.size, stages, steps, transitions }, null, 2));
