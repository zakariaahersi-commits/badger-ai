import test from "node:test";
import assert from "node:assert/strict";

import { buildCompanyAgentMessages, parseCompanyAgentOutput, requestCompanyAgentAnalysis, validateCompanyAgentOutput } from "../lib/company-os/analysis.ts";
import { DeepSeekCompletionError } from "../lib/deepseek-client.ts";

function messageInput() {
  return {
    label: "Growth",
    mission: "Find evidence-backed conversion opportunities.",
    allowedActions: ["record_observation", "propose_experiment"],
    goals: [{ title: "Reach 10 paying founders" }],
    metrics: { activeEntitlements: 6, paidFounders: 0, testerAccess: 6 },
    agentContext: { eventCounts7d: { plan_reveal_viewed: 4 } },
    mode: "guarded",
  };
}

test("company analysis accepts fenced JSON and ignores commentary after the first complete object", () => {
  const parsed = parseCompanyAgentOutput(`Here is the result:\n\`\`\`json\n{
    "summary": "The phrase {inside a string} does not break extraction.",
    "health": "watch",
    "observations": ["Checkout is below target."],
    "actions": []
  }\n\`\`\`\nDo not execute it yet.`);
  assert.equal(parsed?.summary, "The phrase {inside a string} does not break extraction.");
  assert.equal(parsed?.health, "watch");
  assert.deepEqual(parsed?.actions, []);
});

test("company analysis safely normalizes common DeepSeek field variants", () => {
  const parsed = parseCompanyAgentOutput(JSON.stringify({
    brief: "Prioritise the conversion bottleneck.",
    health: "critical",
    findings: ["The plan reveal has more views than account saves."],
    actions: [{ action_type: "propose_experiment", title: "Test a shorter save screen", reason: "The measured drop happens before account save.", payload: { content: "Draft" } }],
  }));
  assert.equal(parsed?.summary, "Prioritise the conversion bottleneck.");
  assert.equal(parsed?.actions[0]?.type, "propose_experiment");
  assert.equal(parsed?.actions[0]?.rationale, "The measured drop happens before account save.");
});

test("company analysis still rejects output without a usable owner brief", () => {
  assert.equal(parseCompanyAgentOutput('{"health":"healthy","observations":[],"actions":[]}'), null);
});

test("CEO analysis accepts one measurable daily experiment", () => {
  const parsed = parseCompanyAgentOutput(JSON.stringify({
    summary: "Fix the largest verified conversion loss.",
    health: "watch",
    observations: ["69 starts produced three plan reveals."],
    actions: [],
    dailyPlan: {
      objective: "Get more founders to their personal plan.",
      bottleneck: "The measured loss is before plan reveal.",
      hypothesis: "Removing the slowest diagnostic wait will improve plan reveal rate.",
      leadingSignal: "Plan reveals per genuine start.",
      stopCondition: "Stop after 20 genuine starts if the rate does not improve.",
      experiment: { title: "Reach the plan", audience: "Idea-stage founders", channel: "product", cta: "See your 28-day plan", targetMetric: "plan_reveal_rate", successThreshold: 0.35 },
    },
  }));
  assert.equal(parsed?.dailyPlan?.experiment.channel, "product");
  assert.equal(parsed?.dailyPlan?.experiment.successThreshold, 0.35);
});

test("CEO analysis accepts the dedicated X and TikTok social channel", () => {
  const parsed = parseCompanyAgentOutput(JSON.stringify({
    summary: "Prepare one attributed X and TikTok test.", health: "healthy", observations: [], actions: [],
    dailyPlan: {
      objective: "Earn one qualified start from social.", bottleneck: "Qualified traffic is low.",
      hypothesis: "Showing Bo's follow-up will create one qualified start.", leadingSignal: "One attributed onboarding start.",
      stopCondition: "Stop after three packages without a start.",
      experiment: { title: "Bo follows up", audience: "Idea-stage founders", channel: "social", cta: "Start with Bo", targetMetric: "attributed_onboarding_starts", successThreshold: 1 },
    },
  }));
  assert.equal(parsed?.dailyPlan?.experiment.channel, "social");
});

test("recovery prompts are compact, explicit and cap the action count", () => {
  const messages = buildCompanyAgentMessages({
    ...messageInput(),
    agentContext: { rows: Array.from({ length: 30 }, (_, index) => ({ index, value: "x".repeat(900) })) },
    recovery: true,
  });
  assert.match(messages[0].content, /at most 2 actions/i);
  assert.match(messages[0].content, /one JSON object only/i);
  assert.ok(messages[1].content.length < 12_000);
});

test("specialists are explicitly bound to the current CEO work order", () => {
  const messages = buildCompanyAgentMessages({
    ...messageInput(),
    agentContext: { currentWorkOrder: { assigned: true, deliverable: "Write the single-variable funnel experiment.", actionTypes: ["propose_experiment"] } },
  });
  assert.match(messages[0].content, /produce that named deliverable/i);
  assert.match(messages[0].content, /Never create a second campaign/i);
  assert.match(messages[1].content, /single-variable funnel experiment/i);
});

test("specialists cannot turn zero metrics or aggregates into invented operational facts", () => {
  const messages = buildCompanyAgentMessages(messageInput());
  assert.match(messages[0].content, /zero metric is an observed result, never proof that instrumentation is missing/i);
  assert.match(messages[0].content, /Aggregate totals do not identify contactable people/i);
  assert.match(messages[0].content, /Do not describe a plan as already built/i);
});

test("content prompts keep preparation separate from publication", () => {
  const messages = buildCompanyAgentMessages({
    ...messageInput(),
    label: "Content",
    mission: "Prepare specific social content from verified product evidence.",
    allowedActions: ["prepare_social_content", "publish_social_content"],
  });
  assert.match(messages[0].content, /prepare_social_content never publishes/i);
  assert.match(messages[0].content, /AI-generated presenter/);
  assert.match(messages[0].content, /never put X or TikTok into publish_social_content/i);
});

test("content analysis rejects an incomplete production bundle before the runner can silently drop it", () => {
  const allowed = ["prepare_social_content"];
  const incomplete = JSON.stringify({ summary: "Prepare today's product lesson.", actions: [{ type: "prepare_social_content", title: "Draft it", rationale: "Show the product mechanic.", payload: { posts: { x: "Bo gives one task and follows up." } } }] });
  const complete = JSON.stringify({
    summary: "Prepare today's product lesson.",
    actions: [{
      type: "prepare_social_content", title: "Draft it", rationale: "Show the product mechanic.", payload: {
        posts: { x: "Bo gives one daily task, then follows up on the proof.", tiktok: "Bo adjusts the plan after each task and proof." },
        ugc: {
          platform: "tiktok", format: "screen_demo", disclosure: null, hook: "Bo turns proof into the next task.", durationSeconds: 20,
          script: "Bo gives one task. You return with proof. Bo adjusts the plan and gives the next move.",
          scenes: [
            { visual: "Today screen", onScreenText: "One task", voiceover: "Bo gives one task." },
            { visual: "Evidence card", onScreenText: "Add proof", voiceover: "You show what happened." },
            { visual: "Plan updates", onScreenText: "Next move", voiceover: "Bo adjusts the plan." },
          ],
          cta: "Start your 28-day plan with Bo.",
        },
      },
    }],
  });
  assert.equal(validateCompanyAgentOutput(incomplete, allowed), false);
  assert.equal(validateCompanyAgentOutput(complete, allowed), true);
  assert.equal(validateCompanyAgentOutput(complete, ["draft_campaign"]), false);
});

test("company analysis uses the compact recovery request after a retryable structured-output failure", async () => {
  const calls = [];
  const completion = await requestCompanyAgentAnalysis({
    apiKey: "test-key",
    messages: messageInput(),
    complete: async (options) => {
      calls.push(options);
      if (calls.length === 1) throw new DeepSeekCompletionError({ code: "invalid_response", promptTokens: 10, completionTokens: 20, latencyMs: 500, attempts: 1 });
      return { text: '{"summary":"Use the measured funnel.","health":"watch","observations":[],"actions":[]}', model: "deepseek-v4-flash", promptTokens: 5, completionTokens: 7, latencyMs: 100, attempts: 1, finishReason: "stop", priorErrorCodes: [] };
    },
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].json, true);
  assert.equal(calls[1].json, false);
  assert.match(calls[1].messages[0].content, /at most 2 actions/i);
  assert.equal(completion.attempts, 2);
  assert.equal(completion.promptTokens, 15);
  assert.equal(completion.completionTokens, 27);
  assert.deepEqual(completion.priorErrorCodes, ["invalid_response"]);
});

test("company analysis does not retry a permanent provider rejection", async () => {
  let calls = 0;
  await assert.rejects(requestCompanyAgentAnalysis({
    apiKey: "test-key",
    messages: messageInput(),
    complete: async () => {
      calls += 1;
      throw new DeepSeekCompletionError({ code: "provider_401", promptTokens: 0, completionTokens: 0, latencyMs: 5, attempts: 1 });
    },
  }), (error) => error instanceof DeepSeekCompletionError && error.code === "provider_401");
  assert.equal(calls, 1);
});

test("content uses a concrete safe example after two copy-quality failures", async () => {
  let calls = 0;
  const completion = await requestCompanyAgentAnalysis({
    apiKey: "test-key",
    messages: {
      ...messageInput(),
      label: "Content",
      allowedActions: ["prepare_social_content"],
      agentContext: { currentWorkOrder: { assigned: true, channel: "social", trackingUrl: "https://badger.example.com/start?utm_campaign=test" } },
    },
    complete: async () => {
      calls += 1;
      throw new DeepSeekCompletionError({ code: "invalid_response", promptTokens: 10, completionTokens: 20, latencyMs: 50, attempts: 1 });
    },
  });
  const parsed = parseCompanyAgentOutput(completion.text);
  assert.equal(calls, 2);
  assert.equal(completion.model, "badger-content-fallback-v1");
  assert.equal(parsed?.actions[0]?.type, "prepare_social_content");
  assert.match(String(parsed?.actions[0]?.payload?.posts && parsed.actions[0].payload.posts.x), /Maya planned to update her landing page/i);
  assert.doesNotMatch(completion.text, /doesn't let you coast|evidence, not promises|no vague motivation/i);
});
