import { expect, test } from "@playwright/test";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const agentIds = ["ceo", "engineering", "customer_success", "growth", "content", "revenue", "compliance", "qa"];
const now = new Date().toISOString();

function fakeSession() {
  const userId = "11111111-1111-4111-8111-111111111111";
  const expiresAt = Math.floor(Date.now() / 1000) + 86_400;
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const accessToken = `${encode({ alg: "none", typ: "JWT" })}.${encode({ sub: userId, role: "authenticated", exp: expiresAt })}.signature`;
  return {
    access_token: accessToken,
    refresh_token: "desktop-preview-refresh",
    expires_in: 86_400,
    expires_at: expiresAt,
    token_type: "bearer",
    user: {
      id: userId,
      aud: "authenticated",
      role: "authenticated",
      email: "owner@example.com",
      app_metadata: { provider: "google", providers: ["google"] },
      user_metadata: {},
      identities: [],
      created_at: now,
    },
  };
}

function companyFixture() {
  const capabilities = [
    ["agent_loop", "DeepSeek operating loop", "operational"],
    ["commercial_core", "Accounts and one-time payments", "operational"],
    ["customer_success", "Customer-success email", "operational"],
    ["engineering", "Engineering worker", "attention"],
    ["social", "Company social publishing", "operational"],
    ["owner_safety", "Owner control and alerts", "operational"],
  ].map(([id, label, status]) => ({ id, label, status, detail: `${label} evidence and controls.`, next: status === "operational" ? null : "Complete the controlled connection proof." }));
  return {
    generatedAt: now,
    settings: { mode: "guarded", paused: false, pause_reason: null, max_daily_ai_spend_usd: 5, max_daily_emails: 5, max_daily_social_posts: 2, max_daily_deploys: 0, max_daily_engineering_jobs: 3, autonomous_customer_emails: false, autonomous_social_posts: false },
    agents: agentIds.map((id, index) => ({ id, label: id.split("_").map((part) => part[0].toUpperCase() + part.slice(1)).join(" "), mission: `Own the ${id.replaceAll("_", " ")} operating loop and escalate consequential decisions with evidence.`, status: "active", autonomy: index < 3 ? "observe" : "draft", schedule_minutes: index % 2 ? 60 : 240, daily_budget_usd: 0.5, allowed_actions: [], last_run_at: now, next_run_at: now, consecutive_failures: 0 })),
    goals: [{ id: 1, title: "Reach 10 paying founders", metric: "paying_founders", target_value: 10, current_value: 6, unit: "count", status: "active", owner_agent_id: null }],
    runs: agentIds.slice(0, 6).map((agent_id, index) => ({ id: `22222222-2222-4222-8222-22222222222${index}`, agent_id, trigger_type: "schedule", status: "completed", summary: "Evidence reviewed; no unsafe action taken.", estimated_cost_usd: 0.001, latency_ms: 1200, error_code: null, created_at: now })),
    actions: [
      { id: "066a0a84-6daa-4fca-b74b-3b8f8f6032b9", agent_id: "engineering", action_type: "queue_engineering_work", risk: "code", status: "proposed", requires_approval: true, title: "Controlled proof: document the engineering connection", rationale: "Open one documentation-only pull request without merge or deployment.", payload: { problem: "Clarify the controlled proof documentation.", evidence: ["The connector is configured."], acceptanceCriteria: ["Only documentation changes."] }, result: {}, error_code: null, created_at: now, executed_at: null },
      { id: "266a0a84-6daa-4fca-b74b-3b8f8f6032b9", agent_id: "content", action_type: "publish_social_content", risk: "external", status: "proposed", requires_approval: true, title: "Show the next-move ritual", rationale: "Explain Bo's daily coaching loop with one approved brand asset.", payload: { posts: { instagram: "One clear move today. Then Bo follows up on what actually happened." }, instagramAsset: "daily_stage" }, result: {}, error_code: null, created_at: now, executed_at: null },
      { id: "366a0a84-6daa-4fca-b74b-3b8f8f6032b9", agent_id: "content", action_type: "prepare_social_content", risk: "draft", status: "completed", requires_approval: false, title: "Show how proof changes tomorrow", rationale: "Prepare a complete X post and transparent TikTok production brief without publishing it.", payload: { posts: { x: "Bo gives you one daily task, then adjusts the plan from what happened.", tiktok: "Bo follows up on your daily task and uses proof to choose the next move." }, ugc: { platform: "tiktok", format: "ai_founder_avatar", disclosure: "AI-generated presenter", hook: "A long task list is not a coach.", durationSeconds: 30, script: "Bo gives you one task, reads the proof and adjusts the plan.", scenes: [{ visual: "Founder closes a notes app", onScreenText: "Too many tasks", voiceover: "A long list is not a plan." }, { visual: "Badger Today screen", onScreenText: "One move today", voiceover: "Bo gives you one task." }, { visual: "Proof card changes the plan", onScreenText: "Reality updates the plan", voiceover: "Your proof changes what Bo asks next." }], cta: "Start your 28 days with Bo." } }, result: { stored: true, published: false }, error_code: null, created_at: now, executed_at: now },
      { id: "166a0a84-6daa-4fca-b74b-3b8f8f6032b9", agent_id: "engineering", action_type: "queue_engineering_work", risk: "code", status: "failed", requires_approval: true, title: "Investigate a production reliability failure", rationale: "A bounded engineering handoff was approved but the provider rejected it.", payload: { problem: "Inspect the recorded reliability evidence." }, result: {}, error_code: "github_engineering_provider_409", created_at: now, executed_at: now },
    ],
    audit: [],
    metrics: { paidFounders: 1, testerAccess: 5, aiCostTodayUsd: 0.013, aiFailuresToday: 0, productEvents24h: 48, tasksCompleted24h: 3, openBugs: 0, activatedPaidFounders28d: 1, returningPaidFounders28d: 0, onboardingStepCohort7d: "diagnostic-20260819-v1", onboardingSteps7d: [{ screen: "stage", phase: "you", step: 1, viewed: 20, completed: 18 }, { screen: "outcome", phase: "you", step: 2, viewed: 12, completed: 9 }, { screen: "blocker", phase: "you", step: 3, viewed: 5, completed: 4 }], onboardingLargestDrop7d: { fromScreen: "outcome", toScreen: "blocker", fromViewed: 12, toViewed: 5, retentionRate: 5 / 12 } },
    connectors: { deepseek: true, email: true, social: true, engineering: true, ownerEmail: true, ownerTelegram: true, messaging: true, companyInbox: true },
    engineeringProvider: "github",
    socialProvider: "instagram",
    readiness: { state: "attention", headline: "Company OS needs attention before more autonomy.", capabilities, humanSetup: ["Complete the controlled engineering proof."], operationalCount: 5, totalCount: 6 },
    capitalReadiness: {
      stage: "customer_evidence", headline: "Earn customer evidence before asking investors to believe the story.", priceUsd: 49,
      monthlyRevenueTargetUsd: 10000, monthlySalesNeeded: 205, canBeginInvestorOutreach: false,
      gates: [{ id: "paid_founders", label: "Ten paying founders", status: "not_met", evidence: "1/10 verified paid founders.", next: "Earn 9 more full-price payments." }],
      verifiedFacts: ["$49 one-time access; no subscription or MRR is claimed."],
      permittedNow: ["Private investor factsheet"], heldUntilReady: ["Investor outreach"],
      capitalPack: {
        generatedFrom: "verified_company_metrics", termSheetStatus: "not_started",
        fundraiseRecommendation: "Stay in customer-evidence mode and prove paid conversion and return behaviour.",
        deckOutline: [
          { title: "01 · Product", status: "verified", evidence: "Badger is a $49 one-time 28-day founder journey.", next: null },
          { title: "02 · Customer evidence", status: "partial", evidence: "1 verified paid founder; tester access is separate.", next: "Reach ten paid founders." },
          { title: "03 · Activation", status: "partial", evidence: "1 paid founder completed a task.", next: "Grow the cohort." },
          { title: "04 · Return behaviour", status: "missing", evidence: "No returning paid founders verified.", next: "Reach three returning founders." },
          { title: "05 · Buying funnel", status: "partial", evidence: "The verified funnel sample is still small.", next: "Reach 50 paywall views." },
          { title: "06 · Business model", status: "verified", evidence: "$49 once; 205 monthly sales reaches $10,000/month.", next: null },
          { title: "07 · Product reliability", status: "verified", evidence: "No blocking bug and no failed AI call today.", next: null },
          { title: "08 · Raise and use of funds", status: "gated", evidence: "Evidence gate is not open.", next: "Do not invent terms." },
        ],
        dataRoomChecklist: [{ title: "Payment ledger", status: "verified", evidence: "Paid and no-cost access are separate.", next: null }],
        objectionLog: [{ question: "Is this MRR?", honestAnswer: "No, Badger charges once.", evidenceNeeded: null }],
      },
    },
    companyInbox: {
      configured: true,
      webhookConfigured: true,
      pending: 1,
      messages: [{ id: 1, sender_email: "founder@example.com", sender_name: "Maya", subject: "Can Bo help with my launch?", preview: "I am preparing a launch", body_text: "I am preparing a launch and want to understand how the 28-day plan works.", received_at: now, status: "new", triage: {}, action_id: null, error_code: null }],
    },
    workOrder: {
      experimentTitle: "Reach the plan",
      channel: "product",
      assignments: [
        { agentId: "ceo", deliverable: "Own the hypothesis.", actionTypes: ["create_internal_report"] },
        { agentId: "growth", deliverable: "Write the single-variable funnel experiment.", actionTypes: ["propose_experiment"] },
        { agentId: "qa", deliverable: "Verify the journey and instrumentation.", actionTypes: ["create_internal_report"] },
        { agentId: "engineering", deliverable: "Prepare the smallest implementation handoff.", actionTypes: ["prepare_bug_fix"] },
      ],
    },
    growthRadar: {
      signals: [{ id: 1, sourceType: "product", sourceUrl: "https://badger.example.com/ops/company", title: "Founders start but do not reach their plan", summary: "Six verified starts became no plan reveals.", category: "product_behaviour", score: 41, status: "testing", observedAt: now, recommendedPlaybook: { slug: "yc-customer-interviews", version: 1, title: "Ask about what people already do", stage: "validate", promise: "Replace guesses with evidence.", steps: ["Ask about the last time"], primaryMetric: "customer_conversations", stopRule: "Require repeated behaviour.", sources: ["https://www.ycombinator.com/blog/ycs-essential-startup-advice/"] } }],
      playbooks: [{ slug: "yc-customer-interviews", version: 1, title: "Ask about what people already do", stage: "validate", promise: "Replace guesses with evidence.", steps: ["Ask about the last time"], primaryMetric: "customer_conversations", stopRule: "Require repeated behaviour.", sources: ["https://www.ycombinator.com/blog/ycs-essential-startup-advice/"] }],
    },
    dailyPlan: {
      id: 1,
      local_date: "2026-08-19",
      status: "active",
      objective: "Get more interested founders to the personalised plan they came to see.",
      bottleneck: "The largest verified loss is before plan reveal.",
      hypothesis: "Removing one diagnostic delay will improve plan reveal rate.",
      leading_signal: "Plan reveals per genuine onboarding start.",
      stop_condition: "Stop after 20 genuine starts if the rate does not improve.",
      company_experiments: [{ id: 1, title: "Reach the plan", status: "running", channel: "product", cta: "See your 28-day plan", source_code: "badger-20260819-product", target_metric: "plan_reveal_rate", success_threshold: 0.35, stop_condition: "Stop after 20 genuine starts if the rate does not improve.", result: {}, learning: null, playbook_slug: "yc-customer-interviews", playbook_version: 1 }],
    },
  };
}

test("the private Company OS becomes a desktop control room at wide viewports", async ({ page }) => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL is required for the Company OS desktop test.");
  const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.addInitScript(({ storageKey, session }) => localStorage.setItem(storageKey, JSON.stringify(session)), {
    storageKey: `sb-${projectRef}-auth-token`,
    session: fakeSession(),
  });
  await page.route("**/api/ops/company", async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(companyFixture()) }));

  await page.goto("/ops/company");
  await expect(page.getByRole("heading", { name: "Company OS." })).toBeVisible();
  await expect(page.getByTestId("desktop-company-nav")).toBeVisible();
  await expect(page.getByText("Chairman console")).toBeVisible();
  await expect(page.getByText("Paid founders", { exact: true })).toBeVisible();
  await expect(page.getByText("No-cost access", { exact: true })).toBeVisible();
  await expect(page.getByTestId("capital-readiness")).toBeVisible();
  await expect(page.getByText("$10,000/month", { exact: true })).toBeVisible();
  await expect(page.getByTestId("company-inbox")).toBeVisible();
  await expect(page.getByText("Can Bo help with my launch?", { exact: true })).toBeVisible();
  await expect(page.getByText("Assigned team · one shared experiment")).toBeVisible();
  await expect(page.getByText("Write the single-variable funnel experiment.")).toBeVisible();
  await expect(page.getByTestId("company-onboarding-funnel")).toBeVisible();
  await expect(page.getByText("Where intent disappears")).toBeVisible();
  await expect(page.getByText(/cohort diagnostic-20260819-v1/)).toBeVisible();
  await expect(page.getByText("outcome → blocker")).toBeVisible();
  await expect(page.getByTestId("capital-pack")).toBeVisible();
  await expect(page.getByText("8-slide evidence deck")).toBeVisible();
  await expect(page.getByText("Term sheet · not started")).toBeVisible();
  await expect(page.getByText("$10,000/month", { exact: true })).toBeVisible();
  await expect(page.getByTestId("desktop-agent-table")).toBeVisible();
  await expect(page.getByTestId("desktop-agent-row")).toHaveCount(8);
  await expect(page.getByRole("heading", { name: "Pending decisions" })).toBeVisible();
  await expect(page.getByText("Controlled proof: document the engineering connection")).toBeVisible();
  await expect(page.getByRole("img", { name: "Bo writing the founder's next move" })).toBeVisible();
  await expect(page.getByTestId("prepared-only")).toBeVisible();
  await expect(page.getByTestId("ugc-production-brief")).toBeVisible();
  await expect(page.getByText("AI-generated presenter", { exact: false })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Execution & incidents" })).toBeVisible();
  const incident = page.getByText("DeepSeek engineering worker is not reachable");
  await incident.scrollIntoViewIfNeeded();
  await expect(incident).toBeVisible();

  const layout = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, page: document.documentElement.scrollWidth, main: document.querySelector("main")?.getBoundingClientRect().width ?? 0 }));
  expect(layout.main).toBeGreaterThan(1200);
  expect(layout.page).toBeLessThanOrEqual(layout.viewport + 1);
});

test("desktop controls stay separated and decisions remain clickable at 1280px", async ({ page }) => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL is required for the Company OS desktop test.");
  const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
  let approved = false;
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.addInitScript(({ storageKey, session }) => localStorage.setItem(storageKey, JSON.stringify(session)), {
    storageKey: `sb-${projectRef}-auth-token`,
    session: fakeSession(),
  });
  await page.route("**/api/ops/company", async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(companyFixture()) }));
  await page.route("**/api/ops/company/actions/**", async (route) => {
    const body = route.request().postDataJSON();
    approved = body?.decision === "approve";
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ executionStatus: "delegated", execution: "Engineering work queued for the bounded DeepSeek GitHub worker." }) });
  });

  await page.goto("/ops/company#decisions");
  await expect(page.getByTestId("desktop-company-nav")).toBeVisible();
  await expect(page.getByTestId("desktop-agent-table")).toBeHidden();
  await expect(page.getByTestId("agent-card")).toHaveCount(8);
  const decision = page.getByTestId("pending-decision").first();
  await expect(decision.getByTestId("approve-decision")).toBeVisible();
  await expect(decision.getByTestId("reject-decision")).toBeVisible();
  await decision.getByTestId("approve-decision").click();
  expect(approved).toBe(true);
  const confirmation = page.getByTestId("company-notice");
  await expect(confirmation).toContainText("Engineering work queued for the bounded DeepSeek GitHub worker.");
  await expect(confirmation).toBeInViewport();

  const controls = await decision.getByRole("button").evaluateAll((buttons) => buttons.map((button) => {
    const rect = button.getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
  }));
  expect(controls[0].right).toBeLessThanOrEqual(controls[1].left);
  const layout = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, page: document.documentElement.scrollWidth }));
  expect(layout.page).toBeLessThanOrEqual(layout.viewport + 1);
});

test("a failed owner decision stays visible and the controls recover", async ({ page }) => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL is required for the Company OS desktop test.");
  const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(({ storageKey, session }) => localStorage.setItem(storageKey, JSON.stringify(session)), {
    storageKey: `sb-${projectRef}-auth-token`,
    session: fakeSession(),
  });
  await page.route("**/api/ops/company", async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(companyFixture()) }));
  await page.route("**/api/ops/company/actions/**", async (route) => route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: "Social publishing connector is not configured" }) }));

  await page.goto("/ops/company#decisions");
  const approve = page.getByTestId("approve-decision").first();
  await approve.click();
  const errorNotice = page.getByTestId("company-error");
  await expect(errorNotice).toContainText("Social publishing connector is not configured");
  await expect(errorNotice).toBeInViewport();
  await expect(approve).toBeEnabled();
  await expect(approve).toHaveText("Approve");
});
