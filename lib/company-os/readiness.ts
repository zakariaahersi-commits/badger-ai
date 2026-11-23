import { ENGINEERING_CIRCUIT_COOLDOWN_MS, isEngineeringConnectorCircuitFailure } from "./policy.ts";

export type CompanyCapabilityStatus = "operational" | "configured" | "attention" | "setup";

export type CompanyCapability = {
  id: "agent_loop" | "commercial_core" | "customer_success" | "engineering" | "social" | "ugc_rendering" | "owner_safety";
  label: string;
  status: CompanyCapabilityStatus;
  detail: string;
  next: string | null;
};

export type CompanyReadiness = {
  state: "operational" | "limited" | "paused" | "attention";
  headline: string;
  capabilities: CompanyCapability[];
  humanSetup: string[];
  operationalCount: number;
  totalCount: number;
};

type ReadinessInput = {
  now?: Date;
  paused: boolean;
  mode: "observe" | "guarded" | "active";
  metricsAvailable: boolean;
  activeEntitlements: number;
  autonomousCustomerEmails: boolean;
  autonomousSocialPosts: boolean;
  engineeringProvider: "github" | "webhook" | null;
  socialProvider?: "instagram" | "webhook" | null;
  connectors: { deepseek: boolean; email: boolean; social: boolean; engineering: boolean; ownerEmail: boolean; ownerTelegram: boolean; ugcRenderer?: boolean };
  platform: { supabase: boolean; stripe: boolean; stripeWebhook: boolean; cron: boolean; ownerAllowlist: boolean; automationCallback: boolean };
  agents: Array<{ status: string }>;
  runs: Array<{ agent_id?: string; trigger_type?: string; status: string; created_at: string; output?: Record<string, unknown> | null }>;
  actions: Array<{ action_type: string; status: string; created_at: string; executed_at?: string | null; error_code?: string | null; result?: Record<string, unknown> | null }>;
};

function within(value: string, since: number): boolean {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && parsed >= since;
}

export function buildCompanyReadiness(input: ReadinessInput): CompanyReadiness {
  const now = input.now ?? new Date();
  const recentRun = input.runs.some((run) => ["completed", "waiting_approval"].includes(run.status) && within(run.created_at, now.getTime() - 6 * 60 * 60_000));
  const recentOwnerBrief = input.runs.some((run) => {
    if (run.agent_id !== "ceo" || run.trigger_type !== "event" || run.status !== "completed" || !within(run.created_at, now.getTime() - 36 * 60 * 60_000)) return false;
    const delivery = run.output && typeof run.output === "object" && !Array.isArray(run.output) ? run.output.delivery : null;
    return Boolean(delivery && typeof delivery === "object" && !Array.isArray(delivery) && (delivery as Record<string, unknown>).email === "sent" && (delivery as Record<string, unknown>).telegram === "sent");
  });
  const degradedAgents = input.agents.filter((agent) => agent.status === "degraded").length;
  const recentAction = (actionType: string) => input.actions.some((action) => action.action_type === actionType && ["delegated", "completed"].includes(action.status) && within(action.created_at, now.getTime() - 7 * 86_400_000));
  const recentCompletedAction = (actionType: string) => input.actions.some((action) => action.action_type === actionType && action.status === "completed" && within(action.executed_at ?? action.created_at, now.getTime() - 7 * 86_400_000));
  const recentEngineeringConnectorFailure = input.actions.some((action) => action.action_type === "queue_engineering_work" && action.status === "failed" && isEngineeringConnectorCircuitFailure(action.error_code) && within(action.executed_at ?? action.created_at, now.getTime() - ENGINEERING_CIRCUIT_COOLDOWN_MS));

  const capabilities: CompanyCapability[] = [];
  if (!input.connectors.deepseek) capabilities.push({ id: "agent_loop", label: "DeepSeek operating loop", status: "setup", detail: "The company reasoning layer has no server-side DeepSeek credential.", next: "Configure the DeepSeek production key." });
  else if (input.paused) capabilities.push({ id: "agent_loop", label: "DeepSeek operating loop", status: "attention", detail: "The global kill switch is active, so scheduled agents cannot run.", next: "Resume only when you intentionally want agents to run." });
  else if (!input.metricsAvailable || degradedAgents > 0) capabilities.push({ id: "agent_loop", label: "DeepSeek operating loop", status: "attention", detail: !input.metricsAvailable ? "Verified company metrics are unavailable." : `${degradedAgents} agent${degradedAgents === 1 ? " is" : "s are"} degraded.`, next: "Inspect the latest failed runs before increasing autonomy." });
  else if (recentRun) capabilities.push({ id: "agent_loop", label: "DeepSeek operating loop", status: "operational", detail: "A successful evidence-based agent run completed within six hours.", next: null });
  else capabilities.push({ id: "agent_loop", label: "DeepSeek operating loop", status: "configured", detail: "DeepSeek and metrics are configured, but no successful run was observed in the last six hours.", next: "Run QA manually or wait for the next scheduled cycle." });

  const commercialConfigured = input.platform.supabase && input.platform.stripe && input.platform.stripeWebhook;
  capabilities.push(commercialConfigured
    ? { id: "commercial_core", label: "Accounts and one-time payments", status: input.activeEntitlements > 0 ? "operational" : "configured", detail: input.activeEntitlements > 0 ? `${input.activeEntitlements} active entitlement${input.activeEntitlements === 1 ? "" : "s"} verify the payment ledger is in use.` : "Supabase, Stripe Checkout and its webhook are configured.", next: input.activeEntitlements > 0 ? null : "Complete one test-mode checkout before relying on the ledger." }
    : { id: "commercial_core", label: "Accounts and one-time payments", status: "attention", detail: "Supabase, Stripe or the Stripe webhook is incomplete.", next: "Restore every commercial-core credential before accepting payment." });

  capabilities.push(!input.connectors.email
    ? { id: "customer_success", label: "Customer-success email", status: "setup", detail: "Resend or one-click unsubscribe configuration is incomplete.", next: "Configure email before approving any customer communication." }
    : recentAction("send_customer_email")
      ? { id: "customer_success", label: "Customer-success email", status: "operational", detail: `An opted-in customer email was delivered recently. Standing mandate is ${input.autonomousCustomerEmails ? "on" : "off"}.`, next: input.autonomousCustomerEmails ? null : "Keep per-message approval, or deliberately enable the mandate in Active mode." }
      : { id: "customer_success", label: "Customer-success email", status: "configured", detail: `Resend and unsubscribe controls are configured. Standing mandate is ${input.autonomousCustomerEmails ? "on" : "off"}.`, next: "Approve one low-risk opted-in test message before granting standing authority." });

  capabilities.push(!input.connectors.engineering
    ? { id: "engineering", label: "Engineering worker", status: "setup", detail: "No complete GitHub-native DeepSeek or GeneralStaff connector is configured.", next: "Connect the bounded GitHub DeepSeek worker and its callback." }
    : recentAction("queue_engineering_work")
      ? { id: "engineering", label: "Engineering worker", status: "operational", detail: `${input.engineeringProvider === "github" ? "The GitHub-native DeepSeek worker" : "The GeneralStaff/DeepSeek worker"} accepted engineering work recently.`, next: input.platform.automationCallback ? null : "Add the callback secret so PR details return to Company OS." }
      : recentEngineeringConnectorFailure
        ? { id: "engineering", label: "Engineering worker", status: "attention", detail: "The engineering provider rejected a handoff. Repeated handoffs are paused to prevent noisy retries.", next: "Repair the GitHub DeepSeek connector before retrying the bounded proof." }
      : { id: "engineering", label: "Engineering worker", status: "configured", detail: `${input.engineeringProvider === "github" ? "The GitHub-native DeepSeek worker" : "The GeneralStaff/DeepSeek worker"} is configured but has not completed a controlled job.`, next: "Run one harmless documentation-only job and inspect its pull request." });

  capabilities.push(!input.connectors.social
    ? { id: "social", label: "Company social publishing", status: "setup", detail: "No complete company-owned social publisher is connected.", next: "Connect an official X/TikTok-capable publisher or a scoped provider webhook. LinkedIn remains excluded." }
    : recentAction("publish_social_content")
      ? { id: "social", label: "Company social publishing", status: "operational", detail: `${input.socialProvider === "instagram" ? "Instagram" : "The webhook publisher"} accepted a post recently. Standing mandate is ${input.autonomousSocialPosts ? "on" : "off"}.`, next: input.autonomousSocialPosts ? null : "Keep per-post approval, or deliberately enable the mandate in Active mode." }
      : { id: "social", label: "Company social publishing", status: "configured", detail: `${input.socialProvider === "instagram" ? "Instagram" : "The webhook publisher"} is configured. Standing mandate is ${input.autonomousSocialPosts ? "on" : "off"}.`, next: "Approve one non-promotional test post and verify it on @badger.example.com." });

  capabilities.push(!input.connectors.ugcRenderer
    ? { id: "ugc_rendering", label: "AI-avatar production", status: "setup", detail: "The private AI-avatar renderer is not connected in production.", next: "Configure the HeyGen API key, avatar and voice, then approve one private render." }
    : recentCompletedAction("queue_ugc_video")
      ? { id: "ugc_rendering", label: "AI-avatar production", status: "operational", detail: "A provider render completed recently and was copied into private Company OS storage without publishing it.", next: null }
      : { id: "ugc_rendering", label: "AI-avatar production", status: "configured", detail: "The renderer is configured, but no completed private video has been verified.", next: "Approve one low-cost private render and download it from Company OS." });

  const ownerCore = input.platform.ownerAllowlist && input.platform.cron;
  capabilities.push(!ownerCore
    ? { id: "owner_safety", label: "Owner control and alerts", status: "attention", detail: "The owner allowlist or cron authentication is incomplete.", next: "Restore owner and cron controls before running Company OS." }
    : !input.connectors.ownerEmail || !input.connectors.ownerTelegram
      ? { id: "owner_safety", label: "Owner control and alerts", status: "setup", detail: `The daily chairman brief is missing ${[!input.connectors.ownerEmail ? "owner email" : null, !input.connectors.ownerTelegram ? "Telegram" : null].filter(Boolean).join(" and ")}.`, next: "Configure both private owner channels so one provider failure cannot silence the company." }
      : recentOwnerBrief
        ? { id: "owner_safety", label: "Owner control and alerts", status: "operational", detail: "A verified chairman brief reached both owner email and Telegram within 36 hours; budgets and the kill switch remain enforced.", next: null }
        : { id: "owner_safety", label: "Owner control and alerts", status: "configured", detail: "Owner access, email, Telegram and scheduled execution are configured, but no dual-channel brief was verified within 36 hours.", next: "Run the controlled owner-brief proof or wait for the next Stockholm delivery window." });

  const humanSetup: string[] = [];
  if (!input.connectors.engineering) humanSetup.push("Connect the bounded GitHub-native DeepSeek engineering worker and callback.");
  else if (!input.platform.automationCallback) humanSetup.push("Connect the engineering callback if you want PR summaries returned automatically.");
  if (!input.connectors.social) humanSetup.push("Connect an official X/TikTok-capable company publisher or scoped webhook; keep LinkedIn excluded.");
  if (!input.connectors.ugcRenderer) humanSetup.push("Connect HeyGen with a scoped API key, avatar and voice for owner-approved private renders.");
  if (!input.connectors.ownerEmail || !input.connectors.ownerTelegram) humanSetup.push("Complete both owner email and Telegram before relying on chairman alerts.");
  else if (!recentOwnerBrief) humanSetup.push("Verify one daily chairman brief reaches both owner email and Telegram.");
  if (input.mode !== "active" && (input.autonomousCustomerEmails || input.autonomousSocialPosts)) humanSetup.push("Switch to Active mode only when you intend existing standing mandates to take effect.");
  if (input.connectors.email && !input.autonomousCustomerEmails) humanSetup.push("Decide whether customer email stays per-message approval or receives a bounded standing mandate.");
  if (input.connectors.social && !input.autonomousSocialPosts) humanSetup.push("Decide whether social publishing stays per-post approval or receives a bounded standing mandate.");

  const operationalCount = capabilities.filter((capability) => capability.status === "operational").length;
  const hasAttention = capabilities.some((capability) => capability.status === "attention");
  const hasIncomplete = capabilities.some((capability) => capability.status === "setup" || capability.status === "configured");
  const state = input.paused ? "paused" : hasAttention ? "attention" : hasIncomplete ? "limited" : "operational";
  const headline = state === "paused" ? "Company OS is paused." : state === "attention" ? "Company OS needs attention before more autonomy." : state === "limited" ? "The core is running; external capabilities still need setup." : "Company OS is operational within its current authority.";
  return { state, headline, capabilities, humanSetup, operationalCount, totalCount: capabilities.length };
}
