export const COMPANY_FUNNEL_EVENTS = ["page_view", "onboarding_landed", "onboarding_started", "plan_reveal_viewed", "plan_reveal_cta_clicked", "paywall_viewed", "checkout_started", "checkout_completed"] as const;

const FUNNEL_METRICS: Record<(typeof COMPANY_FUNNEL_EVENTS)[number], string> = {
  page_view: "attributed_landing_visits",
  onboarding_landed: "attributed_onboarding_landings",
  onboarding_started: "attributed_onboarding_starts",
  plan_reveal_viewed: "attributed_plan_reveals",
  plan_reveal_cta_clicked: "attributed_plan_reveal_cta_clicks",
  paywall_viewed: "attributed_paywall_views",
  checkout_started: "attributed_checkout_starts",
  checkout_completed: "attributed_checkout_completions",
};

type EventRow = { event_name: string; user_id?: string | null; anonymous_id?: string | null; properties: unknown };
export type ProductObservation = {
  metric: string;
  value: number;
  unit: string;
  source: "product_events";
  evidence: Record<string, unknown>;
  dedupeKey: string;
};

function actor(row: EventRow): string | null {
  if (typeof row.user_id === "string" && row.user_id) return `user:${row.user_id}`;
  if (typeof row.anonymous_id === "string" && row.anonymous_id) return `anonymous:${row.anonymous_id}`;
  return null;
}

function properties(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function productObservations(input: {
  experimentId: number;
  sourceCode: string;
  channel?: string | null;
  targetMetric: string | null;
  bucket: string;
  rows: EventRow[];
}): ProductObservation[] {
  const cohort = input.channel === "product"
    ? input.rows
    : input.rows.filter((row) => String(properties(row.properties).utm_campaign ?? "") === input.sourceCode);
  const unique = (eventName: string) => new Set(cohort.flatMap((row) => row.event_name === eventName ? [actor(row)].filter((value): value is string => Boolean(value)) : [])).size;
  const attributed = COMPANY_FUNNEL_EVENTS.map((eventName) => ({
    metric: FUNNEL_METRICS[eventName],
    value: unique(eventName),
    unit: "founders",
    source: "product_events" as const,
    evidence: input.channel === "product"
      ? { cohort: "experiment_window", eventName }
      : { attribution: "utm_campaign", sourceCode: input.sourceCode, eventName },
    dedupeKey: `product:${input.experimentId}:${input.bucket}:${FUNNEL_METRICS[eventName]}`,
  }));
  const productRates: ProductObservation[] = input.channel === "product" ? [
    {
      metric: "onboarding_start_rate",
      value: unique("onboarding_landed") ? unique("onboarding_started") / unique("onboarding_landed") : 0,
      unit: "ratio",
      source: "product_events",
      evidence: { cohort: "experiment_window", numerator: "onboarding_started", denominator: "onboarding_landed" },
      dedupeKey: `product:${input.experimentId}:${input.bucket}:onboarding_start_rate`,
    },
    {
      metric: "plan_reveal_rate",
      value: unique("onboarding_started") ? unique("plan_reveal_viewed") / unique("onboarding_started") : 0,
      unit: "ratio",
      source: "product_events",
      evidence: { cohort: "experiment_window", numerator: "plan_reveal_viewed", denominator: "onboarding_started" },
      dedupeKey: `product:${input.experimentId}:${input.bucket}:plan_reveal_rate`,
    },
  ] : [];
  if (input.targetMetric !== "referred_onboarding_starts") return [...attributed, ...productRates];
  const referredActors = new Set(input.rows.flatMap((row) => row.event_name === "onboarding_started" && String(properties(row.properties).utm_campaign ?? "") === "product_proof_loop"
    ? [actor(row)].filter((value): value is string => Boolean(value))
    : []));
  return [...attributed, ...productRates, {
    metric: "referred_onboarding_starts",
    value: referredActors.size,
    unit: "founders",
    source: "product_events",
    evidence: { attribution: "utm_campaign", campaign: "product_proof_loop", eventName: "onboarding_started" },
    dedupeKey: `product:${input.experimentId}:${input.bucket}:referred_onboarding_starts`,
  }];
}
