import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const baseUrl = process.env.BADGER_QA_BASE_URL ?? "https://badger.example.com";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!baseUrl.startsWith("https://") || !supabaseUrl || !anonKey || !serviceKey) {
  throw new Error("production QA requires an HTTPS base URL and Supabase server credentials");
}

const suffix = randomUUID();
const email = `badger-launch-qa-${suffix}@example.com`;
const password = `Qa-${randomUUID()}-9!`;
const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const authClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
let userId;
let report;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function post(path, body, token) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${path} returned ${response.status}: ${JSON.stringify(data)}`);
  return data;
}

const profile = {
  name: "Maya",
  track: "B",
  idea: "A simple weekly meal-planning tool for busy parents who waste food and decide dinner too late.",
  ideaShort: "Meal planning for busy parents",
  industry: "Consumer productivity",
  stage: "I have spoken to two parents but have not built it yet.",
  whoFor: "Busy parents with young children",
  audience: "Parents I already know",
  experience: "First-time founder",
  fear: "I'll be embarrassed when it flops.",
  goal: "Three useful conversations and one person asking to try it",
  commitment: "I want evidence instead of carrying the idea in my head",
  days: [1, 2, 3, 4, 5],
  sessionMinutes: 30,
  timezone: "Europe/Stockholm",
};

const journey = {
  profile,
  day: 13,
  week: 2,
  streak: 0,
  missedDays: 4,
  completedThisWeek: 1,
  outcome: null,
  currentTask: {
    title: "Call the third parent, then count your evidence.",
    type: "call",
    minutes: 30,
    proofRequirement: "Save the exact words they use and update your conversation count.",
  },
  recentLogs: [
    { day: 1, did: "Spoke to one parent", learned: "Dinner decisions happen late when everyone is tired." },
    { day: 7, did: "Spoke to a second parent", learned: "They already use notes but forget what food is at home." },
  ],
  recentEvidence: [
    { day: 1, summary: "Dinner decisions happen late when everyone is tired.", source: "call note", status: "self_attested" },
    { day: 7, summary: "A parent forgets what food is already at home.", source: "call note", status: "self_attested" },
  ],
};

try {
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name: "Badger launch QA" } });
  if (created.error || !created.data.user) throw created.error ?? new Error("could not create QA user");
  userId = created.data.user.id;

  const entitlement = await admin.from("entitlements").insert({
    user_id: userId,
    product: "badger-28-day",
    status: "active",
  });
  if (entitlement.error) throw entitlement.error;

  const signedIn = await authClient.auth.signInWithPassword({ email, password });
  if (signedIn.error || !signedIn.data.session?.access_token) throw signedIn.error ?? new Error("could not sign in QA user");
  const token = signedIn.data.session.access_token;

  const first = await post("/api/coach", {
    ...journey,
    clientRequestId: `qa-lost-${suffix}`,
    message: "I'm lost.",
    history: [],
  }, token);
  assert(first.source === "deepseek", `the live coach did not use DeepSeek: ${JSON.stringify({ source: first.source, reply: first.reply, turn: first.turn })}`);
  assert(first.turn?.stopReason !== "budget_exhausted", "the exploration turn exhausted its budget");
  assert(first.reply?.includes("?"), `the exploration turn did not ask a useful question: ${JSON.stringify({ source: first.source, reply: first.reply, turn: first.turn })}`);
  assert(/call|parent|meal|idea/i.test(first.reply), `the exploration question was not grounded in Maya's journey: ${JSON.stringify({ source: first.source, reply: first.reply, turn: first.turn })}`);
  assert(!/quiet for|today(?:'s| is) task/i.test(first.reply), "the exploration turn ignored Maya and pushed the schedule");
  assert((first.actions ?? []).length === 0, "the exploration turn created an unwanted approval");

  const history = [
    { from: "me", body: "I'm lost." },
    { from: "bo", body: first.reply },
  ];
  const secondMessage = "I keep avoiding the call because I'm scared the parent will think my idea is silly.";
  const second = await post("/api/coach", {
    ...journey,
    clientRequestId: `qa-blocker-${suffix}`,
    message: secondMessage,
    history,
  }, token);
  assert(second.source === "deepseek", `the blocker response did not use DeepSeek: ${JSON.stringify({ source: second.source, reply: second.reply, turn: second.turn })}`);
  assert(second.turn?.stopReason !== "budget_exhausted", "the blocker response exhausted its budget");
  assert(second.reply !== first.reply, "Bo repeated the previous response");
  assert(/silly|judg|embarrass|call|parent/i.test(second.reply), `Bo did not respond to the stated fear: ${JSON.stringify({ source: second.source, reply: second.reply, turn: second.turn })}`);
  assert(!/quiet for/i.test(second.reply), "Bo returned an inactivity script after Maya explained the blocker");
  assert(!/dying in your head|decide anything about your life|already know it works/i.test(second.reply), "Bo used pressure or unsupported certainty in the blocker response");
  assert((second.actions ?? []).length === 0, `the blocker response created an unwanted approval: ${JSON.stringify({ reply: second.reply, actions: second.actions, turn: second.turn })}`);

  history.push({ from: "me", body: secondMessage }, { from: "bo", body: second.reply });
  const third = await post("/api/coach", {
    ...journey,
    clientRequestId: `qa-next-${suffix}`,
    message: "So what should I do now?",
    history,
  }, token);
  assert(third.source === "deepseek", "the next-move response did not use DeepSeek");
  assert(third.turn?.stopReason !== "budget_exhausted", "the next-move response exhausted its budget");
  assert(/call|parent/i.test(third.reply), "Bo did not return the grounded next move");
  assert((third.actions ?? []).length === 0, "the next-move response created an unwanted approval");

  const dueAt = new Date(Date.now() + 3 * 60 * 60_000).toISOString();
  const commitmentMessage = `Create a commitment for me. I will call one parent by ${dueAt}. Hold me to it. The proof is a written call note.`;
  history.push({ from: "me", body: "So what should I do now?" }, { from: "bo", body: third.reply });
  const fourth = await post("/api/coach", {
    ...journey,
    clientRequestId: `qa-commitment-${suffix}`,
    message: commitmentMessage,
    history,
  }, token);
  assert(fourth.source === "deepseek", "the commitment response did not use DeepSeek");
  assert(fourth.turn?.stopReason !== "budget_exhausted", "the commitment response exhausted its budget");
  assert(!/\d{4}-\d{2}-\d{2}T/.test(fourth.reply), "the commitment response exposed a machine timestamp");
  assert(!/saved log/i.test(fourth.reply), "the commitment response showed an unrelated task-log warning");
  assert(!/I(?:'|’)ve set|commitment is set/i.test(fourth.reply), "the commitment response claimed success before approval");
  assert(/approv|commit|call/i.test(fourth.reply), "the commitment response was not aligned with its pending action");
  assert((fourth.actions ?? []).length === 1, `an explicit commitment did not produce exactly one approval: ${JSON.stringify({ reply: fourth.reply, actions: fourth.actions, turn: fourth.turn })}`);
  assert(fourth.actions[0].type === "create_commitment", "the explicit commitment produced the wrong action");
  const approval = await post(`/api/action-requests/${fourth.actions[0].id}/approve`, {}, token);
  assert(approval.status === "completed", "the commitment approval did not complete");

  const demo = await post("/api/demo", {
    message: "I want to help busy parents plan meals before the evening so they waste less food, but I do not know what to test first.",
  });
  assert(demo.source === "ai", "the production landing demo fell back instead of using DeepSeek");
  assert(/parent|meal|food/i.test(`${demo.summary} ${demo.focus} ${demo.draft}`), "the landing demo was not personalised");

  const plan = await post("/api/plan", { profile });
  assert(plan.source === "ai", "the production planner fell back instead of using DeepSeek");
  assert(Array.isArray(plan.plan) && plan.plan.length === 28, "the planner did not return 28 tasks");
  assert(Number(plan.repairedTasks ?? 0) <= 7, "too much of the DeepSeek plan required deterministic repair");
  assert(/parent|meal|food/i.test(JSON.stringify(plan.plan.slice(0, 7))), "the first plan week was not personalised");

  const runs = await admin.from("coach_runs")
    .select("status,step_count,model,fallback,error_code,result,started_at")
    .eq("user_id", userId)
    .order("started_at", { ascending: true });
  if (runs.error) throw runs.error;
  assert(runs.data.length === 4, "production did not persist all four QA coach runs");
  assert(runs.data.every((run) => run.model === "deepseek-v4-flash" || run.model === "deepseek/deepseek-v4-flash"), "a persisted coach run used a non-DeepSeek model");
  assert(runs.data.every((run) => run.status !== "budget_exhausted" && !run.fallback && !run.error_code), "a persisted coach run failed its production gate");

  report = {
    passed: true,
    baseUrl,
    coach: runs.data.map((run) => ({
      status: run.status,
      steps: run.step_count,
      model: run.model,
      reply: run.result?.reply,
      actions: run.result?.actions?.map((action) => action.type) ?? [],
    })),
    demo: { source: demo.source, summary: demo.summary, focus: demo.focus, action: demo.action },
    planner: { source: plan.source, repairedTasks: plan.repairedTasks ?? 0, taskCount: plan.plan.length, day1: plan.plan[0], day14: plan.plan[13], day28: plan.plan[27] },
  };
  const rendered = `${JSON.stringify(report, null, 2)}\n`;
  const reportPath = process.env.BADGER_QA_REPORT_PATH ?? "/private/tmp/badger-production-ai-report.json";
  if (reportPath.startsWith("/tmp/") || reportPath.startsWith("/private/tmp/")) await writeFile(reportPath, rendered, "utf8");
  process.stdout.write(rendered);
} catch (error) {
  if (userId) {
    const failedRuns = await admin.from("coach_runs")
      .select("status,step_count,model,fallback,error_code,result")
      .eq("user_id", userId)
      .order("started_at", { ascending: true });
    console.error("Production AI failure context:", JSON.stringify(failedRuns.data ?? [], null, 2));
  }
  throw error;
} finally {
  if (userId) {
    await admin.from("ai_usage_events").delete().eq("user_id", userId);
    const removed = await admin.auth.admin.deleteUser(userId);
    if (removed.error) console.warn(`QA user cleanup failed: ${removed.error.message}`);
  }
}
