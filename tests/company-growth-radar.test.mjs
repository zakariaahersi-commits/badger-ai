import assert from "node:assert/strict";
import test from "node:test";
import { GROWTH_PLAYBOOKS, selectGrowthPlaybook } from "../lib/company-os/growth-playbooks.ts";
import { rankTrendSignals, scoreTrendSignal, trendFingerprint } from "../lib/company-os/trend-radar.ts";
import { companyMetricSignals, fetchHackerNewsFounderSignals } from "../lib/company-os/trend-sources.ts";

const metrics = {
  generatedAt: "2026-08-24T12:00:00.000Z", totalUsers: 72, activeEntitlements: 2, paidFounders: 2, testerAccess: 0,
  newPaidFounders24h: 0, onboardingStarted7d: 6, onboardingCompleted7d: 0, planRevealViewed7d: 0,
  planRevealCtaClicked7d: 0, journeySaveViewed7d: 0, accountSaveStarted7d: 0, accountSaveCompleted7d: 0,
  paywallViewed7d: 0, paywallCtaClicked7d: 0, checkoutStarted7d: 0, activatedPaidFounders28d: 1,
  returningPaidFounders28d: 0, openBugs: 0, blockingBugs: 0, checkoutPending: 0, aiCallsToday: 12,
  aiFailuresToday: 0, aiCostTodayUsd: 0.08, productEvents24h: 20, tasksCompleted24h: 1, coachMessages24h: 3,
  failedDeliveries24h: 0,
};

test("the playbook library is versioned and every playbook has a source and stop rule", () => {
  assert.equal(GROWTH_PLAYBOOKS.length, 5);
  for (const playbook of GROWTH_PLAYBOOKS) {
    assert.equal(playbook.version, 1);
    assert.ok(playbook.sources.every((source) => source.startsWith("https://")));
    assert.ok(playbook.stopRule.length > 20);
  }
});

test("early social acquisition uses the public proof playbook", () => {
  const selected = selectGrowthPlaybook(metrics, {
    objective: "Find the next customer", bottleneck: "Few starts", hypothesis: "Show the work", leadingSignal: "Starts", stopCondition: "Three posts",
    experiment: { title: "Show Bo working", audience: "idea-stage founders", channel: "social", cta: "Start with Bo", targetMetric: "attributed_onboarding_starts", successThreshold: 1 },
  });
  assert.equal(selected.slug, "polsia-build-in-public");
});

test("funnel work uses customer evidence instead of trend chasing", () => {
  const selected = selectGrowthPlaybook(metrics, {
    objective: "Reach the plan", bottleneck: "Drop-off", hypothesis: "Ask less", leadingSignal: "Plan reveals", stopCondition: "Twenty starts",
    experiment: { title: "Reach the plan", audience: "new founders", channel: "product", cta: "See the plan", targetMetric: "plan_reveal_rate", successThreshold: 0.35 },
  });
  assert.equal(selected.slug, "yc-customer-interviews");
});

test("radar rewards relevance, payment evidence and freshness while penalising saturation and risk", () => {
  const strong = scoreTrendSignal({ velocity: 4, paymentEvidence: 4, badgerRelevance: 5, reachability: 4, freshness: 5, saturation: 1, risk: 0 });
  const noisy = scoreTrendSignal({ velocity: 5, paymentEvidence: 0, badgerRelevance: 1, reachability: 1, freshness: 5, saturation: 5, risk: 4 });
  assert.ok(strong > noisy);
  assert.equal(scoreTrendSignal({ velocity: 99, paymentEvidence: -4, badgerRelevance: 0, reachability: 0, freshness: 0, saturation: 0, risk: 0 }), 10);
});

test("signal ranking is deterministic and fingerprints deduplicate a provider item", () => {
  const base = { sourceType: "hacker_news", sourceUrl: "https://example.com/a", category: "distribution", observedAt: "2026-08-24T08:00:00.000Z", paymentEvidence: 0, badgerRelevance: 4, reachability: 3, freshness: 5, saturation: 2, risk: 1 };
  const ranked = rankTrendSignals([
    { ...base, sourceItemId: "1", title: "Founder distribution", velocity: 2 },
    { ...base, sourceItemId: "2", sourceUrl: "https://example.com/b", title: "Fast founder distribution", velocity: 5 },
  ]);
  assert.equal(ranked[0].title, "Fast founder distribution");
  assert.equal(ranked[0].recommendedPlaybook.slug, "polsia-build-in-public");
  assert.equal(trendFingerprint({ sourceType: "hacker_news", sourceItemId: "1", sourceUrl: "https://example.com/a" }), trendFingerprint({ sourceType: "hacker_news", sourceItemId: "1", sourceUrl: "https://elsewhere.test" }));
});

test("the daily radar turns the current verified funnel gap into one internal signal", () => {
  const signals = companyMetricSignals({ ...metrics, onboardingLanded7d: 12, onboardingStarted7d: 3 }, new Date("2026-08-24T08:00:00.000Z"));
  assert.equal(signals.length, 1);
  assert.equal(signals[0].sourceItemId, "2026-08-24:onboarding-start-gap");
  assert.match(signals[0].summary, /12 verified onboarding landings became 3 starts/);
});

test("the public scan accepts launch evidence but not arbitrary news", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.endsWith("topstories.json")) return new Response(JSON.stringify([11, 12]));
    if (href.endsWith("/11.json")) return new Response(JSON.stringify({ id: 11, type: "story", title: "Show HN: A tiny tool for customer interviews", url: "https://example.com/tool", score: 80, descendants: 30, time: 1787554800 }));
    return new Response(JSON.stringify({ id: 12, type: "story", title: "Show HN: A new species of bird", url: "https://example.com/bird", score: 400, descendants: 200, time: 1787554800 }));
  };
  try {
    const signals = await fetchHackerNewsFounderSignals(new Date("2026-08-24T20:00:00.000Z"));
    assert.equal(signals.length, 1);
    assert.equal(signals[0].category, "product_behaviour");
    assert.match(signals[0].summary, /attention evidence, not payment evidence/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
