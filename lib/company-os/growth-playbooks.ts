import type { CompanyDailyPlanProposal, CompanyMetrics } from "./types.ts";

export type GrowthPlaybookSlug =
  | "donnelly-code"
  | "yc-customer-interviews"
  | "yc-manual-first-customers"
  | "polsia-build-in-public"
  | "reforge-proof-loop";

export type GrowthPlaybook = {
  slug: GrowthPlaybookSlug;
  version: 1;
  title: string;
  stage: "discover" | "validate" | "sell" | "compound";
  promise: string;
  steps: string[];
  primaryMetric: string;
  stopRule: string;
  sources: string[];
};

export const GROWTH_PLAYBOOKS: readonly GrowthPlaybook[] = [
  {
    slug: "donnelly-code",
    version: 1,
    title: "Find a rising tide before building",
    stage: "discover",
    promise: "Turn a broad wish to make money into one reachable problem with visible demand.",
    steps: ["Name the consumer shift", "Define the narrow opportunity", "Find direct demand evidence", "Estimate whether the market is large enough", "Offer a small next step"],
    primaryMetric: "qualified_problem_signals",
    stopRule: "Stop or narrow the idea when three separate checks show no repeated problem or reachable buyer.",
    sources: ["https://www.linkedin.com/posts/donnellychris_we-took-searchable-from-0-85m-in-5-months-activity-7473705360567181312-5wM1"],
  },
  {
    slug: "yc-customer-interviews",
    version: 1,
    title: "Ask about what people already do",
    stage: "validate",
    promise: "Replace guesses with specific examples from real people before deciding what to make.",
    steps: ["Recruit one reachable person", "Ask about the last time the problem happened", "Listen for current workarounds and cost", "Record the exact behaviour", "Change the next question from the evidence"],
    primaryMetric: "customer_conversations",
    stopRule: "Do not progress on compliments or hypothetical interest; require repeated past behaviour from at least three conversations.",
    sources: ["https://www.youtube.com/watch?v=MT4Ig2uqjTc", "https://www.ycombinator.com/blog/ycs-essential-startup-advice/"],
  },
  {
    slug: "yc-manual-first-customers",
    version: 1,
    title: "Do the first sales by hand",
    stage: "sell",
    promise: "Find the first paying founders through direct conversations before automating acquisition.",
    steps: ["Choose one narrow founder type", "Write one plain sentence about the useful outcome", "Contact people individually", "Deliver the first result manually", "Record objections and payment evidence"],
    primaryMetric: "verified_payments",
    stopRule: "Change the audience or promise after twenty relevant, individual conversations produce no serious next step.",
    sources: ["https://www.ycombinator.com/blog/ycs-essential-startup-advice/"],
  },
  {
    slug: "polsia-build-in-public",
    version: 1,
    title: "Make the company work visible",
    stage: "sell",
    promise: "Turn real company decisions, failures and customer work into a story people can follow.",
    steps: ["Choose one real company event", "Show the evidence without private data", "Explain the decision in plain language", "Invite one concrete response", "Measure conversations and product starts"],
    primaryMetric: "attributed_onboarding_starts",
    stopRule: "Stop the format after three posts if it creates no relevant conversations or attributed product start.",
    sources: ["https://gtmnow.com/gtm-192-inside-the-company-that-raised-30m-at-a-250m-valuation-with-0-employees-ben-cera-polsia/", "https://www.youtube.com/watch?v=q1OA7LFg-ak"],
  },
  {
    slug: "reforge-proof-loop",
    version: 1,
    title: "Turn completed work into the next introduction",
    stage: "compound",
    promise: "Let a founder action create honest, shareable proof that can bring the next founder into Badger.",
    steps: ["Create a useful result inside the product", "Turn it into a private-by-default progress receipt", "Let the founder choose to share", "Attribute the visit and signup", "Keep the loop only if it compounds"],
    primaryMetric: "referred_onboarding_starts",
    stopRule: "Retire the sharing treatment after twenty completed tasks if fewer than two founders choose to share or no attributed start follows.",
    sources: ["https://www.reforge.com/blog/growth-loops", "https://outbid.lol/about"],
  },
] as const;

export function growthPlaybook(slug: GrowthPlaybookSlug): GrowthPlaybook {
  const playbook = GROWTH_PLAYBOOKS.find((item) => item.slug === slug);
  if (!playbook) throw new Error("growth_playbook_unavailable");
  return playbook;
}

/**
 * Choose from verified funnel state. Trend signals may sharpen the message,
 * but they never overrule product reliability or the current commercial gate.
 */
export function selectGrowthPlaybook(metrics: CompanyMetrics, plan: CompanyDailyPlanProposal): GrowthPlaybook {
  if (metrics.blockingBugs > 0 || metrics.aiFailuresToday > 1) return growthPlaybook("yc-customer-interviews");
  if (plan.experiment.targetMetric === "onboarding_start_rate" || plan.experiment.targetMetric === "plan_reveal_rate") {
    return growthPlaybook("yc-customer-interviews");
  }
  if (metrics.paidFounders < 10 && plan.experiment.channel === "social") return growthPlaybook("polsia-build-in-public");
  if (metrics.paidFounders < 10) return growthPlaybook("yc-manual-first-customers");
  return growthPlaybook("reforge-proof-loop");
}
