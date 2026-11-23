import assert from "node:assert/strict";
import test from "node:test";
import { companyAgentEvidenceFingerprint } from "../lib/company-os/evidence-fingerprint.ts";

const metrics = {
  generatedAt: "2026-08-21T07:00:00.000Z", totalUsers: 9, activeEntitlements: 6, paidFounders: 2, testerAccess: 4, newPaidFounders24h: 0,
  onboardingStarted7d: 0, onboardingCompleted7d: 0, planRevealViewed7d: 0, planRevealCtaClicked7d: 0, journeySaveViewed7d: 0,
  accountSaveStarted7d: 0, accountSaveCompleted7d: 0, paywallViewed7d: 0, paywallCtaClicked7d: 0, checkoutStarted7d: 0,
  activatedPaidFounders28d: 0, returningPaidFounders28d: 0, openBugs: 0, blockingBugs: 0, checkoutPending: 0,
  aiCallsToday: 12, aiFailuresToday: 0, aiCostTodayUsd: 0.04, productEvents24h: 0, tasksCompleted24h: 0, coachMessages24h: 0, failedDeliveries24h: 0,
};

function context(starts = 0) {
  return {
    eventCounts7d: { page_view: 4 },
    currentWorkOrder: { assigned: true, experimentTitle: "Five clean starts", channel: "other", sourceCode: "badger-20260821-other", deliverable: "Draft one invitation." },
    sharedOperatingMemory: {
      currentDailyPlan: {
        id: 4,
        company_experiments: [{ id: 4, status: "running", target_metric: "attributed_onboarding_starts", success_threshold: 5, result: { latestObservations: [{ metric: "attributed_onboarding_starts", value: starts }] } }],
      },
    },
  };
}

test("unchanged evidence produces the same fingerprint despite runtime telemetry", () => {
  const first = companyAgentEvidenceFingerprint({ agentId: "growth", localDate: "2026-08-21", planId: 4, experimentId: 4, metrics, agentContext: context() });
  const second = companyAgentEvidenceFingerprint({ agentId: "growth", localDate: "2026-08-21", planId: 4, experimentId: 4, metrics: { ...metrics, generatedAt: "2026-08-21T08:00:00.000Z", aiCallsToday: 99, aiCostTodayUsd: 4.2 }, agentContext: context() });
  assert.equal(first, second);
});

test("a genuine experiment signal wakes the assigned agent", () => {
  const before = companyAgentEvidenceFingerprint({ agentId: "growth", localDate: "2026-08-21", planId: 4, experimentId: 4, metrics, agentContext: context(0) });
  const after = companyAgentEvidenceFingerprint({ agentId: "growth", localDate: "2026-08-21", planId: 4, experimentId: 4, metrics: { ...metrics, onboardingStarted7d: 1, productEvents24h: 1 }, agentContext: context(1) });
  assert.notEqual(before, after);
});

test("a new date wakes the CEO but not specialists without new evidence", () => {
  const growthToday = companyAgentEvidenceFingerprint({ agentId: "growth", localDate: "2026-08-21", planId: 4, experimentId: 4, metrics, agentContext: context() });
  const growthTomorrow = companyAgentEvidenceFingerprint({ agentId: "growth", localDate: "2026-08-22", planId: 4, experimentId: 4, metrics, agentContext: context() });
  const ceoToday = companyAgentEvidenceFingerprint({ agentId: "ceo", localDate: "2026-08-21", planId: 4, experimentId: 4, metrics, agentContext: context() });
  const ceoTomorrow = companyAgentEvidenceFingerprint({ agentId: "ceo", localDate: "2026-08-22", planId: 4, experimentId: 4, metrics, agentContext: context() });
  assert.equal(growthToday, growthTomorrow);
  assert.notEqual(ceoToday, ceoTomorrow);
});
