import type { CompanyMetrics } from "./types.ts";

export type CapitalGateStatus = "met" | "not_met" | "unknown";

export type CapitalGate = {
  id: "paid_founders" | "activation" | "return_behavior" | "funnel_sample" | "product_reliability";
  label: string;
  status: CapitalGateStatus;
  evidence: string;
  next: string | null;
};

export type CapitalPackStatus = "verified" | "partial" | "missing" | "gated";

export type CapitalPackItem = {
  title: string;
  status: CapitalPackStatus;
  evidence: string;
  next: string | null;
};

export type CompanyCapitalPack = {
  generatedFrom: "verified_company_metrics";
  fundraiseRecommendation: string;
  termSheetStatus: "not_started" | "owner_decision_required";
  deckOutline: CapitalPackItem[];
  dataRoomChecklist: CapitalPackItem[];
  objectionLog: Array<{ question: string; honestAnswer: string; evidenceNeeded: string | null }>;
};

export type CompanyCapitalReadiness = {
  stage: "customer_evidence" | "retention_evidence" | "outreach_ready";
  headline: string;
  priceUsd: number;
  monthlyRevenueTargetUsd: number;
  monthlySalesNeeded: number;
  canBeginInvestorOutreach: boolean;
  gates: CapitalGate[];
  verifiedFacts: string[];
  permittedNow: string[];
  heldUntilReady: string[];
  capitalPack: CompanyCapitalPack;
};

const PRICE_USD = 49;
const MONTHLY_REVENUE_TARGET_USD = 10_000;

function noMetricsCapitalPack(): CompanyCapitalPack {
  return {
    generatedFrom: "verified_company_metrics",
    fundraiseRecommendation: "Do not begin investor outreach until the live company metrics can be verified.",
    termSheetStatus: "not_started",
    deckOutline: [{ title: "Live traction", status: "missing", evidence: "Company metrics are unavailable.", next: "Restore verified metrics before drafting traction claims." }],
    dataRoomChecklist: [{ title: "Verified metrics export", status: "missing", evidence: "No current evidence is available.", next: "Restore the Company OS metrics connection." }],
    objectionLog: [{ question: "What traction is verified?", honestAnswer: "The current system cannot verify traction.", evidenceNeeded: "A current metrics snapshot and payment ledger." }],
  };
}

function buildCapitalPack(metrics: CompanyMetrics, canBeginInvestorOutreach: boolean): CompanyCapitalPack {
  const aiFailureRate = metrics.aiCallsToday > 0 ? metrics.aiFailuresToday / metrics.aiCallsToday : null;
  const reliable = metrics.blockingBugs === 0 && metrics.aiCallsToday >= 10 && (aiFailureRate ?? 1) <= 0.05;
  const hasPaidEvidence = metrics.paidFounders > 0;
  const hasActivationEvidence = metrics.activatedPaidFounders28d > 0;
  const hasReturnEvidence = metrics.returningPaidFounders28d > 0;
  return {
    generatedFrom: "verified_company_metrics",
    fundraiseRecommendation: canBeginInvestorOutreach
      ? "The evidence gate is open. Prepare a private owner-reviewed process before contacting investors."
      : "Stay in customer-evidence mode. Build the private pack, but spend the next operating cycle on paid conversion, activation and return behaviour.",
    termSheetStatus: canBeginInvestorOutreach ? "owner_decision_required" : "not_started",
    deckOutline: [
      { title: "01 · Product", status: "verified", evidence: `Badger sells a 28-day founder journey for $${PRICE_USD} once; it is not a subscription.`, next: null },
      { title: "02 · Customer evidence", status: hasPaidEvidence ? "partial" : "missing", evidence: `${metrics.paidFounders} verified paid founders; ${metrics.testerAccess} no-cost accounts are reported separately.`, next: metrics.paidFounders >= 10 ? null : `Reach ten verified full-price customers (${Math.max(0, 10 - metrics.paidFounders)} remaining).` },
      { title: "03 · Activation", status: hasActivationEvidence ? "partial" : "missing", evidence: `${metrics.activatedPaidFounders28d}/${metrics.paidFounders} paid founders completed a task in 28 days.`, next: "Record which first task creates the strongest Day 1 activation." },
      { title: "04 · Return behaviour", status: metrics.returningPaidFounders28d >= 3 ? "verified" : hasReturnEvidence ? "partial" : "missing", evidence: `${metrics.returningPaidFounders28d} paid founders acted on at least two separate days.`, next: metrics.returningPaidFounders28d >= 3 ? null : "Reach three returning paid founders and document why they returned." },
      { title: "05 · Buying funnel", status: metrics.paywallViewed7d >= 50 ? "verified" : "partial", evidence: `${metrics.onboardingStarted7d} starts → ${metrics.onboardingCaptured7d ?? 0} early accounts → ${metrics.planRevealViewed7d} plans → ${metrics.paywallViewed7d} paywalls → ${metrics.checkoutStarted7d} Checkouts in seven days.`, next: metrics.paywallViewed7d >= 50 ? null : `Collect ${Math.max(0, 50 - metrics.paywallViewed7d)} more genuine paywall views before drawing a pricing conclusion.` },
      { title: "06 · Business model", status: "verified", evidence: `$${PRICE_USD} one-time revenue. $${MONTHLY_REVENUE_TARGET_USD.toLocaleString()}/month requires ${Math.ceil(MONTHLY_REVENUE_TARGET_USD / PRICE_USD)} new full-price sales each month.`, next: "Do not call this MRR unless the commercial model changes." },
      { title: "07 · Product reliability", status: reliable ? "verified" : metrics.aiCallsToday >= 10 ? "partial" : "missing", evidence: `${metrics.blockingBugs} blocking bugs and ${metrics.aiFailuresToday}/${metrics.aiCallsToday} AI calls failed today.`, next: reliable ? null : "Prove at least ten live calls with no blocking bugs and no more than a 5% AI failure rate." },
      { title: "08 · Raise and use of funds", status: canBeginInvestorOutreach ? "partial" : "gated", evidence: canBeginInvestorOutreach ? "Every early evidence gate is met; terms and use of funds still require the owner." : "The customer, retention or reliability evidence gate is not yet open.", next: canBeginInvestorOutreach ? "Owner defines whether to raise, the amount and the use-of-funds model." : "Do not invent a raise, valuation or term sheet." },
    ],
    dataRoomChecklist: [
      { title: "Payment ledger", status: "verified", evidence: `${metrics.paidFounders} paid entitlements are separated from ${metrics.testerAccess} no-cost accounts.`, next: null },
      { title: "Funnel event dictionary", status: "verified", evidence: "Onboarding, plan, account, paywall and Checkout stages are measured by unique actors.", next: null },
      { title: "Activation cohort", status: hasActivationEvidence ? "partial" : "missing", evidence: `${metrics.activatedPaidFounders28d} paid founders completed a task in the current 28-day window.`, next: "Export founder-level cohort evidence only with appropriate privacy controls." },
      { title: "Return cohort", status: metrics.returningPaidFounders28d >= 3 ? "verified" : hasReturnEvidence ? "partial" : "missing", evidence: `${metrics.returningPaidFounders28d} returning paid founders are verified.`, next: "Collect the reason for return without manufacturing testimonials." },
      { title: "Reliability log", status: reliable ? "verified" : "partial", evidence: `${metrics.blockingBugs} blocking bugs; ${metrics.aiFailuresToday}/${metrics.aiCallsToday} AI failures today.`, next: reliable ? null : "Close the current reliability evidence gap." },
      { title: "Terms and financing", status: "gated", evidence: "No valuation, financing terms or investor commitment is claimed.", next: canBeginInvestorOutreach ? "Owner and qualified counsel review any real financing process." : "Keep this section empty until the evidence gate and owner decision are both complete." },
    ],
    objectionLog: [
      { question: "Is this recurring revenue?", honestAnswer: `No. Badger currently charges $${PRICE_USD} once for a 28-day journey.`, evidenceNeeded: null },
      { question: "Are tester accounts customers?", honestAnswer: `No. Company OS reports ${metrics.paidFounders} paid founders and ${metrics.testerAccess} no-cost accounts separately.`, evidenceNeeded: null },
      { question: "Do paid founders actually execute?", honestAnswer: `${metrics.activatedPaidFounders28d} paid founders completed a task in 28 days.`, evidenceNeeded: hasActivationEvidence ? "A larger paid cohort and task-quality review." : "At least one verified paid-founder task completion." },
      { question: "Do founders come back?", honestAnswer: `${metrics.returningPaidFounders28d} paid founders have meaningful activity on at least two separate days.`, evidenceNeeded: metrics.returningPaidFounders28d >= 3 ? "Longer cohort retention as the sample grows." : "Three returning paid founders and qualitative reasons for return." },
      { question: "Why raise now?", honestAnswer: canBeginInvestorOutreach ? "The early evidence gates are met, but the owner has not yet approved a fundraise." : "Badger should not raise on the current evidence; the next milestone is stronger customer and retention proof.", evidenceNeeded: canBeginInvestorOutreach ? "An owner-approved use-of-funds plan." : "All capital-readiness gates met." },
    ],
  };
}

function gate(
  id: CapitalGate["id"],
  label: string,
  status: CapitalGateStatus,
  evidence: string,
  next: string | null,
): CapitalGate {
  return { id, label, status, evidence, next: status === "met" ? null : next };
}

export function buildCompanyCapitalReadiness(metrics: CompanyMetrics | null): CompanyCapitalReadiness {
  const monthlySalesNeeded = Math.ceil(MONTHLY_REVENUE_TARGET_USD / PRICE_USD);
  if (!metrics) return {
    stage: "customer_evidence",
    headline: "Capital readiness cannot be assessed until verified company metrics are available.",
    priceUsd: PRICE_USD,
    monthlyRevenueTargetUsd: MONTHLY_REVENUE_TARGET_USD,
    monthlySalesNeeded,
    canBeginInvestorOutreach: false,
    gates: [],
    verifiedFacts: [`$${PRICE_USD} one-time product; no subscription revenue is claimed.`],
    permittedNow: ["Maintain a private narrative outline and data-room checklist."],
    heldUntilReady: ["Public investor deck claims", "Investor outreach", "Valuation or term-sheet language"],
    capitalPack: noMetricsCapitalPack(),
  };

  const aiFailureRate = metrics.aiCallsToday > 0 ? metrics.aiFailuresToday / metrics.aiCallsToday : null;
  const activationTarget = Math.min(5, Math.max(1, metrics.paidFounders));
  const gates: CapitalGate[] = [
    gate("paid_founders", "Ten paying founders", metrics.paidFounders >= 10 ? "met" : "not_met", `${metrics.paidFounders}/10 verified paid founders.`, `Earn ${Math.max(0, 10 - metrics.paidFounders)} more full-price payments.`),
    gate("activation", "Paid founder activation", metrics.paidFounders === 0 ? "unknown" : metrics.activatedPaidFounders28d >= activationTarget ? "met" : "not_met", `${metrics.activatedPaidFounders28d}/${metrics.paidFounders} paid founders completed a task in 28 days.`, `Get at least ${activationTarget} paid founders to complete a real task.`),
    gate("return_behavior", "Early return signal", metrics.paidFounders === 0 ? "unknown" : metrics.returningPaidFounders28d >= 3 ? "met" : "not_met", `${metrics.returningPaidFounders28d} paid founders took a meaningful action on at least two separate days.`, "Reach three returning paid founders and learn why they came back."),
    gate("funnel_sample", "Buying-decision sample", metrics.paywallViewed7d >= 50 ? "met" : "not_met", `${metrics.paywallViewed7d}/50 verified paywall views in seven days; ${metrics.checkoutStarted7d} Checkout starts.`, `Collect ${Math.max(0, 50 - metrics.paywallViewed7d)} more genuine paywall views before making a pricing claim.`),
    gate("product_reliability", "Product reliability", metrics.blockingBugs > 0 ? "not_met" : aiFailureRate === null || metrics.aiCallsToday < 10 ? "unknown" : aiFailureRate <= 0.05 ? "met" : "not_met", `${metrics.blockingBugs} blocking bugs; ${metrics.aiFailuresToday}/${metrics.aiCallsToday} AI calls failed today.`, metrics.blockingBugs > 0 ? "Resolve every blocking issue before investor outreach." : "Prove at least ten live AI calls with no more than a 5% failure rate."),
  ];
  const canBeginInvestorOutreach = gates.every((item) => item.status === "met");
  const stage = metrics.paidFounders < 10 ? "customer_evidence" : canBeginInvestorOutreach ? "outreach_ready" : "retention_evidence";
  const headline = stage === "customer_evidence"
    ? "Earn customer evidence before asking investors to believe the story."
    : stage === "retention_evidence"
      ? "The first customer gate is open; now prove activation, return behaviour and reliability."
      : "The early evidence gate is open. The owner may choose whether to begin a fundraise.";

  return {
    stage,
    headline,
    priceUsd: PRICE_USD,
    monthlyRevenueTargetUsd: MONTHLY_REVENUE_TARGET_USD,
    monthlySalesNeeded,
    canBeginInvestorOutreach,
    gates,
    verifiedFacts: [
      `$${PRICE_USD} one-time access; no subscription or MRR is claimed.`,
      `${metrics.paidFounders} paid founders and ${metrics.testerAccess} no-cost accounts.`,
      `${metrics.activatedPaidFounders28d} paid founders completed a task in 28 days.`,
      `${metrics.returningPaidFounders28d} paid founders returned for meaningful action on another day.`,
      `${metrics.onboardingStarted7d} onboarding starts, ${metrics.onboardingCaptured7d ?? 0} early accounts, ${metrics.planRevealViewed7d} plan reveals and ${metrics.checkoutStarted7d} Checkout starts in seven days.`,
    ],
    permittedNow: ["Private investor factsheet", "Data-room checklist", "Evidence-backed deck outline", "Investor objection log"],
    heldUntilReady: ["Public investor deck claims", "Investor outreach", "Valuation language", "A fabricated term sheet"],
    capitalPack: buildCapitalPack(metrics, canBeginInvestorOutreach),
  };
}
