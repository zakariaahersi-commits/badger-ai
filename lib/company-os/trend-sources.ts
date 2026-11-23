import type { TrendSignal } from "./trend-radar.ts";
import type { CompanyMetrics } from "./types.ts";

type HackerNewsItem = { id?: number; title?: string; url?: string; score?: number; time?: number; descendants?: number; type?: string };

const BADGER_TERMS = /\b(founder|startup|business|customer|sell|sales|idea|entrepreneur|creator|small business|side project|bootstrapp|cofounder)\b/i;
const AI_TERMS = /\b(ai|agent|llm|automation)\b/i;
const PRODUCT_BEHAVIOUR_TERMS = /\b(productivity|coach|accountability|procrastin\w*|motivation|task|plan|habit)\b/i;
const SHOW_HN = /^show hn:/i;

function hackerNewsSignal(item: HackerNewsItem, now: Date): TrendSignal | null {
  if (!item.id || item.type !== "story" || !item.title) return null;
  const directRelevance = BADGER_TERMS.test(item.title);
  const productLaunch = SHOW_HN.test(item.title) && (directRelevance || AI_TERMS.test(item.title) || PRODUCT_BEHAVIOUR_TERMS.test(item.title));
  if (!directRelevance && !productLaunch) return null;
  const sourceUrl = item.url?.startsWith("https://") ? item.url : `https://news.ycombinator.com/item?id=${item.id}`;
  const ageHours = Math.max(0, (now.getTime() - Number(item.time ?? 0) * 1000) / 3_600_000);
  const points = Number(item.score ?? 0);
  const discussion = Number(item.descendants ?? 0);
  return {
    sourceType: "hacker_news",
    sourceItemId: String(item.id),
    sourceUrl,
    title: item.title,
    summary: `${points} points and ${discussion} comments on Hacker News; this is attention evidence, not payment evidence.`,
    category: productLaunch ? "product_behaviour" : AI_TERMS.test(item.title) ? "market_shift" : "founder_problem",
    velocity: points >= 300 ? 5 : points >= 150 ? 4 : points >= 70 ? 3 : points >= 30 ? 2 : 1,
    paymentEvidence: 0,
    badgerRelevance: directRelevance ? 4 : 2,
    reachability: discussion >= 100 ? 4 : discussion >= 30 ? 3 : 2,
    freshness: ageHours <= 12 ? 5 : ageHours <= 24 ? 4 : ageHours <= 48 ? 3 : 2,
    saturation: AI_TERMS.test(item.title) ? 4 : 2,
    risk: 1,
    observedAt: new Date(Number(item.time) * 1000).toISOString(),
  };
}

export async function fetchHackerNewsFounderSignals(now = new Date()): Promise<TrendSignal[]> {
  const idsResponse = await fetch("https://hacker-news.firebaseio.com/v0/topstories.json", { signal: AbortSignal.timeout(6000), cache: "no-store" });
  if (!idsResponse.ok) throw new Error("hacker_news_unavailable");
  const ids = (await idsResponse.json()) as unknown;
  if (!Array.isArray(ids)) throw new Error("hacker_news_invalid_response");
  const selected = ids.slice(0, 80).filter((id): id is number => Number.isInteger(id) && id > 0);
  const items = await Promise.all(selected.map(async (id) => {
    try {
      const response = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, { signal: AbortSignal.timeout(4000), cache: "no-store" });
      return response.ok ? await response.json() as HackerNewsItem : null;
    } catch { return null; }
  }));
  return items.flatMap((item) => item ? [hackerNewsSignal(item, now)].filter((signal): signal is TrendSignal => Boolean(signal)) : []).slice(0, 10);
}

export function companyMetricSignals(metrics: CompanyMetrics, now = new Date()): TrendSignal[] {
  const observedAt = now.toISOString();
  const localDate = observedAt.slice(0, 10);
  const sourceUrl = "https://badger.example.com/ops/company";
  const landings = metrics.onboardingLanded7d ?? 0;
  if (landings >= 3 && metrics.onboardingStarted7d / Math.max(1, landings) < 0.5) return [{
    sourceType: "product", sourceItemId: `${localDate}:onboarding-start-gap`, sourceUrl,
    title: "Interested visitors are not answering the first onboarding question",
    summary: `${landings} verified onboarding landings became ${metrics.onboardingStarted7d} starts in seven days.`,
    category: "product_behaviour", velocity: 3, paymentEvidence: 0, badgerRelevance: 5, reachability: 5, freshness: 5, saturation: 0, risk: 0, observedAt,
  }];
  if (metrics.onboardingStarted7d >= 3 && metrics.planRevealViewed7d / Math.max(1, metrics.onboardingStarted7d) < 0.35) return [{
    sourceType: "product", sourceItemId: `${localDate}:plan-reveal-gap`, sourceUrl,
    title: "Founders start the diagnostic but do not reach their plan",
    summary: `${metrics.onboardingStarted7d} verified starts became ${metrics.planRevealViewed7d} plan reveals in seven days.`,
    category: "product_behaviour", velocity: 3, paymentEvidence: 0, badgerRelevance: 5, reachability: 5, freshness: 5, saturation: 0, risk: 0, observedAt,
  }];
  if (metrics.paywallViewed7d >= 3 && metrics.checkoutStarted7d === 0) return [{
    sourceType: "product", sourceItemId: `${localDate}:payment-intent-gap`, sourceUrl,
    title: "Founders see the one-time price but do not open Checkout",
    summary: `${metrics.paywallViewed7d} verified paywall views produced no Checkout start in seven days.`,
    category: "product_behaviour", velocity: 3, paymentEvidence: 2, badgerRelevance: 5, reachability: 5, freshness: 5, saturation: 0, risk: 0, observedAt,
  }];
  return [];
}
