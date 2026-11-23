import nextEnv from "@next/env";
import { parseCompanyAgentOutput, requestCompanyAgentAnalysis } from "../lib/company-os/analysis.ts";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const target = process.argv[2] || "growth";
const agents = {
  ceo: { label: "CEO", mission: "Prioritise company goals, detect cross-functional risks and turn evidence into a short owner decision brief.", allowedActions: ["record_observation", "create_internal_report", "send_owner_alert"] },
  growth: { label: "Growth", mission: "Find evidence-backed conversion opportunities and propose measurable experiments.", allowedActions: ["record_observation", "create_internal_report", "propose_experiment", "draft_campaign"] },
  content: { label: "Content", mission: "Turn real product evidence and founder progress into specific, non-generic X copy and complete, transparent TikTok production briefs without publishing them.", allowedActions: ["record_observation", "create_internal_report", "draft_campaign", "prepare_social_content", "publish_social_content"] },
  revenue: { label: "Revenue", mission: "Monitor checkout, payments and recovery signals, then surface revenue risks without changing price or issuing refunds.", allowedActions: ["record_observation", "create_internal_report", "send_owner_alert"] },
};
if (!(target in agents)) throw new Error(`Choose one business agent: ${Object.keys(agents).join(", ")}`);

const apiKey = process.env.AI_GATEWAY_API_KEY
  || process.env.VERCEL_OIDC_TOKEN
  || process.env.DEEPSEEK_API_KEY
  || process.env.Deepseek_API
  || process.env.DEEPSEEK_API;
if (!apiKey) throw new Error("The live agent smoke test requires a DeepSeek server credential.");

const agent = agents[target];
const completion = await requestCompanyAgentAnalysis({
  apiKey,
  messages: {
    label: agent.label,
    mission: agent.mission,
    allowedActions: agent.allowedActions,
    goals: [{ id: 1, title: "Reach 10 paying founders", metric: "paying_founders", target_value: 10, current_value: 1, unit: "count" }],
    metrics: { totalUsers: 40, activeEntitlements: 6, paidFounders: 1, testerAccess: 5, checkoutPending: 3, productEvents24h: 70, tasksCompleted24h: 5, coachMessages24h: 8, aiFailuresToday: 0 },
    agentContext: {
      eventCounts7d: { landing_viewed: 120, onboarding_started: 45, plan_reveal_viewed: 20, account_save_completed: 10, paywall_viewed: 8, checkout_completed: 1 },
      approvedProductFacts: ["Badger AI is a 28-day founder journey", "Access costs $49 once and is not a subscription", "Bo combines coaching, planning and accountability"],
      contentRule: "This is synthetic smoke-test evidence. Do not invent customer stories or public claims.",
    },
    mode: "guarded",
  },
});
const parsed = parseCompanyAgentOutput(completion.text);
if (!parsed) throw new Error("Live Company OS response failed the production parser.");
if (target === "content" && !parsed.actions.some((action) => action.type === "prepare_social_content")) {
  throw new Error("Live content smoke did not return the required X and TikTok preparation bundle.");
}

process.stdout.write(`${JSON.stringify({
  passed: true,
  agent: target,
  model: completion.model,
  latencyMs: completion.latencyMs,
  attempts: completion.attempts,
  recovered: completion.priorErrorCodes.length > 0,
  priorErrorCodes: completion.priorErrorCodes,
  promptTokens: completion.promptTokens,
  completionTokens: completion.completionTokens,
  health: parsed.health,
  observations: parsed.observations.length,
  proposedActions: parsed.actions.length,
}, null, 2)}\n`);
