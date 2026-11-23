import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import {
  applyStripeEvent,
  claimStripeEvent,
  markStripeEventFailed,
  markStripeEventProcessed,
} from "@/lib/stripe-webhook";
import { checkoutTelegramMessage, sendOwnerTelegramAlert } from "@/lib/telegram";

export const runtime = "nodejs";

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key
    ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;
}

export async function POST(req: NextRequest) {
  const key = process.env.STRIPE_SECRET_KEY;
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = req.headers.get("stripe-signature");
  const service = serviceClient();
  if (!key || !secret || !signature || !service) {
    return NextResponse.json({ received: false }, { status: 503 });
  }

  const stripe = new Stripe(key);
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(await req.text(), signature, secret);
  } catch {
    return NextResponse.json({ received: false }, { status: 400 });
  }

  try {
    const claim = await claimStripeEvent(service, event);
    if (claim === "duplicate") return NextResponse.json({ received: true, duplicate: true });
    const applied = await applyStripeEvent(service, event);
    await markStripeEventProcessed(service, event.id);
    if (applied === "applied" && (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded")) {
      const session = event.data.object;
      await sendOwnerTelegramAlert(checkoutTelegramMessage({
        email: session.customer_details?.email ?? session.customer_email,
        amountTotal: session.amount_total,
        currency: session.currency,
      }));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    // A concurrent delivery is not a processing failure. Leave the first worker's
    // claim intact so it can complete without a later request changing its state.
    if (message !== "stripe_event_already_processing") {
      await markStripeEventFailed(service, event.id, error).catch(() => undefined);
    }
    console.error("[stripe-webhook] processing failed", message);
    return NextResponse.json({ received: false }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
