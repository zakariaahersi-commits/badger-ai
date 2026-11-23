export const MESSAGING_RECONNECT_DELAY_MS = 30 * 60 * 1000;
export const MESSAGING_RECONNECT_LOOKBACK_MS = 14 * 24 * 60 * 60 * 1000;
export const IMESSAGE_RECONNECT_EVENT_KEY = "support/imessage-reconnect/v1";

export type MessagingLinkAttempt = {
  user_id: string | null;
  provider: string;
  used_at: string | null;
  expires_at: string;
  created_at: string;
};

export type MessagingReconnectCandidate = {
  userId: string;
  provider: string;
  attemptedAt: string;
  expiredAt: string;
};

export function latestExpiredMessagingLinks(rows: MessagingLinkAttempt[], now = new Date()): MessagingReconnectCandidate[] {
  const latestByUser = new Map<string, MessagingReconnectCandidate>();
  const latestAllowedExpiry = now.getTime() - MESSAGING_RECONNECT_DELAY_MS;
  const earliestAttempt = now.getTime() - MESSAGING_RECONNECT_LOOKBACK_MS;

  for (const row of rows) {
    if (!row.user_id || row.used_at || !["linq", "sendblue"].includes(row.provider)) continue;
    const createdAt = Date.parse(row.created_at);
    const expiresAt = Date.parse(row.expires_at);
    if (!Number.isFinite(createdAt) || !Number.isFinite(expiresAt)) continue;
    if (createdAt < earliestAttempt || expiresAt > latestAllowedExpiry) continue;
    const current = latestByUser.get(row.user_id);
    if (current && Date.parse(current.attemptedAt) >= createdAt) continue;
    latestByUser.set(row.user_id, {
      userId: row.user_id,
      provider: row.provider,
      attemptedAt: row.created_at,
      expiredAt: row.expires_at,
    });
  }

  return [...latestByUser.values()].sort((left, right) => Date.parse(right.attemptedAt) - Date.parse(left.attemptedAt));
}
