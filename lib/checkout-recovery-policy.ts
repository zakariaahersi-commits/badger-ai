export const FIRST_RECOVERY_MS = 60 * 60 * 1000;
export const FINAL_CHECKOUT_RECOVERY_MS = 24 * 60 * 60 * 1000;
export const JOURNEY_RECOVERY_LOOKBACK_MS = 14 * 24 * 60 * 60 * 1000;

export type CheckoutRecoveryTiming = {
  checkout_started_at: string;
  reminder_count: number;
};

export type JourneyRecoverySignal = {
  user_id: string | null;
  event_name: string;
  created_at: string;
};

export type JourneyRecoveryCandidate = {
  userId: string;
  signalledAt: string;
  source: "account_save" | "saved_paywall";
};

export function latestJourneyRecoveryCandidates(rows: JourneyRecoverySignal[]): JourneyRecoveryCandidate[] {
  const latestByUser = new Map<string, JourneyRecoveryCandidate>();
  for (const row of rows) {
    if (!row.user_id || (row.event_name !== "account_save_completed" && row.event_name !== "paywall_viewed")) continue;
    const timestamp = Date.parse(row.created_at);
    if (!Number.isFinite(timestamp)) continue;
    const current = latestByUser.get(row.user_id);
    if (current && Date.parse(current.signalledAt) >= timestamp) continue;
    latestByUser.set(row.user_id, {
      userId: row.user_id,
      signalledAt: row.created_at,
      source: row.event_name === "paywall_viewed" ? "saved_paywall" : "account_save",
    });
  }
  return [...latestByUser.values()].sort((left, right) => Date.parse(right.signalledAt) - Date.parse(left.signalledAt));
}

export function recoveryReminderDue(row: CheckoutRecoveryTiming, now = new Date()): 1 | 2 | null {
  const age = now.getTime() - Date.parse(row.checkout_started_at);
  if (!Number.isFinite(age)) return null;
  if (row.reminder_count === 0 && age >= FIRST_RECOVERY_MS) return 1;
  if (row.reminder_count === 1 && age >= FINAL_CHECKOUT_RECOVERY_MS) return 2;
  return null;
}

export function journeyReadyReminderDue(viewedAt: string, now = new Date()): boolean {
  const age = now.getTime() - Date.parse(viewedAt);
  return Number.isFinite(age) && age >= FIRST_RECOVERY_MS && age <= JOURNEY_RECOVERY_LOOKBACK_MS;
}
