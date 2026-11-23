import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { grantCheckoutEntitlement, isBadgerCheckout, isSettledCheckout } from "./entitlements.ts";
import { authoritativeCheckoutEvent } from "./checkout-attribution.ts";

const PROCESSING_TIMEOUT_MS = 5 * 60_000;

function dbError(label: string, error: { code?: string; message?: string } | null): Error {
  return new Error(`${label}:${error?.code ?? "database_error"}`);
}

export async function claimStripeEvent(
  service: SupabaseClient,
  event: Pick<Stripe.Event, "id" | "type">,
  now = new Date(),
): Promise<"process" | "duplicate"> {
  const timestamp = now.toISOString();
  const inserted = await service.from("stripe_webhook_events").insert({
    stripe_event_id: event.id,
    event_type: event.type,
    status: "processing",
    updated_at: timestamp,
  });
  if (!inserted.error) return "process";
  if (inserted.error.code !== "23505") throw dbError("stripe_event_claim", inserted.error);

  const existing = await service.from("stripe_webhook_events")
    .select("status, attempt_count, updated_at")
    .eq("stripe_event_id", event.id)
    .single();
  if (existing.error || !existing.data) throw dbError("stripe_event_read", existing.error);
  if (existing.data.status === "processed") return "duplicate";

  const updatedAt = Date.parse(existing.data.updated_at);
  if (existing.data.status === "processing" && Number.isFinite(updatedAt) && now.getTime() - updatedAt < PROCESSING_TIMEOUT_MS) {
    throw new Error("stripe_event_already_processing");
  }

  const retry = await service.from("stripe_webhook_events").update({
    status: "processing",
    attempt_count: Number(existing.data.attempt_count || 1) + 1,
    last_error: null,
    updated_at: timestamp,
  }).eq("stripe_event_id", event.id);
  if (retry.error) throw dbError("stripe_event_retry", retry.error);
  return "process";
}

export async function markStripeEventProcessed(service: SupabaseClient, eventId: string, now = new Date()) {
  const timestamp = now.toISOString();
  const result = await service.from("stripe_webhook_events").update({
    status: "processed",
    processed_at: timestamp,
    updated_at: timestamp,
    last_error: null,
  }).eq("stripe_event_id", eventId);
  if (result.error) throw dbError("stripe_event_complete", result.error);
}

export async function markStripeEventFailed(service: SupabaseClient, eventId: string, error: unknown, now = new Date()) {
  const message = error instanceof Error ? error.message : "unknown_error";
  const result = await service.from("stripe_webhook_events").update({
    status: "failed",
    updated_at: now.toISOString(),
    last_error: message.slice(0, 500),
  }).eq("stripe_event_id", eventId);
  if (result.error) throw dbError("stripe_event_fail", result.error);
}

function objectId(value: string | { id: string } | null): string | null {
  return typeof value === "string" ? value : value?.id ?? null;
}

export async function applyStripeEvent(service: SupabaseClient, event: Stripe.Event): Promise<"applied" | "ignored"> {
  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const session = event.data.object;
    if (!isBadgerCheckout(session) || !isSettledCheckout(session)) return "ignored";
    const granted = await grantCheckoutEntitlement(service, session);
    if (!granted) throw new Error("entitlement_grant_failed");
    const purchase = authoritativeCheckoutEvent(session);
    if (!purchase) throw new Error("checkout_attribution_missing_user");
    const recorded = await service.from("product_events").insert({
      user_id: purchase.userId,
      anonymous_id: null,
      event_name: "checkout_completed",
      path: purchase.path,
      properties: purchase.properties,
    });
    if (recorded.error && recorded.error.code !== "23505") throw dbError("checkout_attribution", recorded.error);
    return "applied";
  }

  if (event.type === "charge.refunded") {
    const charge = event.data.object;
    if (charge.amount_refunded < charge.amount) return "ignored";
    const paymentIntentId = objectId(charge.payment_intent);
    if (!paymentIntentId) throw new Error("refund_missing_payment_intent");
    const updated = await service.from("entitlements")
      .update({ status: "refunded", updated_at: new Date().toISOString() })
      .eq("stripe_payment_intent_id", paymentIntentId)
      .select("user_id");
    if (updated.error) throw dbError("refund_entitlement", updated.error);
    if (!updated.data?.length) throw new Error("refund_entitlement_not_found");
    return "applied";
  }

  if (event.type === "charge.dispute.created") {
    const paymentIntentId = objectId(event.data.object.payment_intent);
    if (!paymentIntentId) throw new Error("dispute_missing_payment_intent");
    const updated = await service.from("entitlements")
      .update({ status: "disputed", updated_at: new Date().toISOString() })
      .eq("stripe_payment_intent_id", paymentIntentId)
      .select("user_id");
    if (updated.error) throw dbError("dispute_entitlement", updated.error);
    if (!updated.data?.length) throw new Error("dispute_entitlement_not_found");
    return "applied";
  }

  return "ignored";
}
