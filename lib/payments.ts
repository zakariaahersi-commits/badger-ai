"use client";

import { authJsonHeaders } from "./cloud";
import { firstTouchAttribution } from "./telemetry";

// Payment seam. Byqqa has no free product path: if Stripe is unavailable we
// keep the plan locked and show a clear error instead of silently unlocking it.

export async function startCheckout(opts: {
  cancelPath?: string;
  onUnavailable?: () => void;
}): Promise<void> {
  try {
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: await authJsonHeaders(),
      body: JSON.stringify({ cancelPath: opts.cancelPath, attribution: firstTouchAttribution() }),
    });
    const data = await res.json();
    if (res.ok && data.configured && data.url) {
      window.location.href = data.url;
      return;
    }
  } catch {
    /* fall through to demo */
  }
  opts.onUnavailable?.();
}

export type PaymentAccess = {
  access: boolean;
  paid: boolean;
  status: "none" | "paid" | "refunded" | "revoked" | "disputed";
  startedAt: string | null;
  productId: string | null;
  revenue: number | null;
  currency: string | null;
  transactionId: string | null;
};

const NO_ACCESS: PaymentAccess = {
  access: false, paid: false, status: "none", startedAt: null,
  productId: null, revenue: null, currency: null, transactionId: null,
};

function paymentAccess(data: Record<string, unknown>, ok: boolean): PaymentAccess {
  const status = ["paid", "refunded", "revoked", "disputed"].includes(String(data.status))
    ? data.status as PaymentAccess["status"]
    : "none";
  return {
    access: ok && Boolean(data.access ?? data.paid),
    paid: ok && Boolean(data.paid),
    status,
    startedAt: typeof data.startedAt === "string" ? data.startedAt : null,
    productId: typeof data.productId === "string" ? data.productId : null,
    revenue: typeof data.revenue === "number" && Number.isFinite(data.revenue) ? data.revenue : null,
    currency: typeof data.currency === "string" ? data.currency : null,
    transactionId: typeof data.transactionId === "string" ? data.transactionId : null,
  };
}

export async function verifyCheckout(sessionId: string): Promise<PaymentAccess> {
  try {
    const res = await fetch(`/api/checkout/verify?session_id=${encodeURIComponent(sessionId)}`, {
      headers: await authJsonHeaders(),
      cache: "no-store",
    });
    const data = await res.json();
    return paymentAccess(data, res.ok);
  } catch {
    return NO_ACCESS;
  }
}

export async function hasActiveEntitlement(): Promise<PaymentAccess> {
  try {
    const res = await fetch("/api/entitlement", {
      headers: await authJsonHeaders(),
      cache: "no-store",
    });
    const data = await res.json();
    return paymentAccess(data, res.ok);
  } catch {
    return NO_ACCESS;
  }
}
