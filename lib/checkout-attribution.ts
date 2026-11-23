const ATTRIBUTION_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "referrer", "device", "standalone"] as const;

export function normalizeCheckoutAttribution(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  const result: Record<string, string> = {};
  for (const key of ATTRIBUTION_KEYS) {
    const raw = source[key];
    const text = typeof raw === "boolean" ? String(raw) : typeof raw === "string" ? raw.trim() : "";
    if (text) result[key] = text.slice(0, key === "referrer" ? 220 : 120);
  }
  return result;
}

type CheckoutLike = {
  id: string;
  client_reference_id?: string | null;
  metadata?: Record<string, string> | null;
  amount_total?: number | null;
  currency?: string | null;
  payment_intent?: string | { id: string } | null;
};

function objectId(value: string | { id: string } | null | undefined): string | null {
  return typeof value === "string" ? value : value?.id ?? null;
}

export function authoritativeCheckoutEvent(session: CheckoutLike) {
  const userId = session.metadata?.user_id ?? session.client_reference_id ?? null;
  if (!userId) return null;
  return {
    userId,
    path: "/app",
    properties: {
      product_id: session.metadata?.product || "badger-28-day",
      revenue: Number.isFinite(session.amount_total) ? Number(session.amount_total) / 100 : 49,
      currency: (session.currency || "usd").toUpperCase(),
      transaction_id: objectId(session.payment_intent) || session.id,
      purchase_model: "one_time",
      source: "stripe_webhook",
      ...normalizeCheckoutAttribution(session.metadata),
    },
  };
}
