import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

export const BADGER_PRODUCT = "badger-28-day";
const LEGACY_PRODUCT = "sprint-founding";

function stripeId(value: string | { id: string } | null): string | null {
  return typeof value === "string" ? value : value?.id ?? null;
}

export function isBadgerCheckout(session: Stripe.Checkout.Session): boolean {
  const product = session.metadata?.product;
  return session.mode === "payment" && (product === BADGER_PRODUCT || product === LEGACY_PRODUCT);
}

export function isSettledCheckout(session: Stripe.Checkout.Session): boolean {
  return session.status === "complete" &&
    (session.payment_status === "paid" || session.payment_status === "no_payment_required");
}

export async function grantCheckoutEntitlement(
  service: SupabaseClient,
  session: Stripe.Checkout.Session,
  expectedUserId?: string,
): Promise<boolean> {
  const userId = session.metadata?.user_id ?? session.client_reference_id;
  if (!userId || (expectedUserId && userId !== expectedUserId)) return false;
  if (!isBadgerCheckout(session) || !isSettledCheckout(session)) return false;

  const now = new Date().toISOString();
  const { error } = await service.from("entitlements").upsert({
    user_id: userId,
    product: BADGER_PRODUCT,
    status: "active",
    stripe_customer_id: stripeId(session.customer),
    stripe_checkout_session_id: session.id,
    stripe_payment_intent_id: stripeId(session.payment_intent),
    // Omit granted_at. Postgres supplies it on the first insert and preserves
    // it on conflict, so re-verifying Checkout cannot restart the 28-day clock.
    updated_at: now,
  }, { onConflict: "user_id" });

  if (error) {
    console.error("[entitlement] grant failed", error.code ?? "database_error");
    return false;
  }
  await service.from("checkout_recoveries").update({
    status: "converted",
    converted_at: now,
    updated_at: now,
  }).eq("user_id", userId).eq("status", "pending");
  return true;
}
