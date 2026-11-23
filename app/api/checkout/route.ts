import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { BADGER_PRODUCT } from "@/lib/entitlements";
import { BADGER_CURRENCY, BADGER_PRICE_CENTS } from "@/lib/product";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { serverAuth } from "@/lib/server-auth";
import { hasRecoveryConsent } from "@/lib/recovery-consent";
import { normalizeCheckoutAttribution } from "@/lib/checkout-attribution";

// One transparent one-time purchase. Stripe collects and charges $49 during
// Checkout; there is no trial, delayed charge, subscription, or renewal.
// Without STRIPE_SECRET_KEY the route reports "not configured" and the
// client falls back to the clearly-labeled demo paywall.

export const runtime = "nodejs";

function checkoutOrigin(req: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) {
    try {
      const url = new URL(configured);
      if (url.protocol === "https:" || (process.env.NODE_ENV !== "production" && url.protocol === "http:")) {
        return url.origin;
      }
    } catch {
      // Fall through to the safe production default.
    }
  }
  if (process.env.NODE_ENV !== "production") return req.nextUrl.origin;
  return "https://badger.example.com";
}

function safeCancelPath(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return "/start";
  try {
    const parsed = new URL(value, "https://badger.example.com");
    return `${parsed.pathname}${parsed.search}`.slice(0, 300);
  } catch {
    return "/start";
  }
}

export async function POST(req: NextRequest) {
  if (!rateLimit(`checkout:${clientIp(req)}`, 8, 60_000)) {
    return NextResponse.json({ configured: true, error: "too many requests" }, { status: 429 });
  }
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    return NextResponse.json({ configured: false }, { status: 200 });
  }
  const auth = await serverAuth(req);
  if (!auth.userId || !auth.service || auth.invalid) {
    return NextResponse.json({ configured: true, error: "sign in required" }, { status: 401 });
  }
  const stripe = new Stripe(key);
  const origin = checkoutOrigin(req);
  const body = await req.json().catch(() => ({}));
  const attribution = normalizeCheckoutAttribution(body.attribution);

  try {
    const entitlementResult = await auth.service.from("entitlements")
      .select("status, stripe_customer_id")
      .eq("user_id", auth.userId)
      .eq("product", BADGER_PRODUCT)
      .maybeSingle();
    if (entitlementResult.error) throw new Error("billing_state_unavailable");
    if (entitlementResult.data?.status === "active") {
      return NextResponse.json({ configured: true, url: `${origin}/app` });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      allow_promotion_codes: true,
      line_items: [{
        price_data: {
          currency: BADGER_CURRENCY,
          unit_amount: BADGER_PRICE_CENTS,
          product_data: {
            name: "Badger AI · The 28-Day Launch",
            description: "A personalised daily plan, Bo coaching and accountability to reach your first paying customers.",
          },
        },
        quantity: 1,
      }],
      customer: entitlementResult.data?.stripe_customer_id || undefined,
      customer_email: entitlementResult.data?.stripe_customer_id ? undefined : auth.email ?? undefined,
      client_reference_id: auth.userId,
      success_url: `${origin}/app?checkout=success&session_id={CHECKOUT_SESSION_ID}&first_task=1`,
      cancel_url: `${origin}${safeCancelPath(body.cancelPath)}${safeCancelPath(body.cancelPath).includes("?") ? "&" : "?"}checkout=cancelled`,
      metadata: { product: BADGER_PRODUCT, user_id: auth.userId, purchase_kind: "one_time", ...attribution },
      payment_intent_data: { metadata: { product: BADGER_PRODUCT, user_id: auth.userId, purchase_kind: "one_time", ...attribution } },
      custom_text: {
        submit: { message: "You will be charged $49 once for the complete 28-day programme. No subscription and no recurring charge." },
      },
    });

    const now = new Date().toISOString();
    const preference = await auth.service.from("email_preferences")
      .select("journey_nudges_enabled")
      .eq("user_id", auth.userId)
      .maybeSingle();
    if (!preference.error && hasRecoveryConsent(preference.data?.journey_nudges_enabled)) {
      await auth.service.from("checkout_recoveries").upsert({
        user_id: auth.userId,
        status: "pending",
        checkout_started_at: now,
        last_checkout_session_id: session.id,
        updated_at: now,
      }, { onConflict: "user_id" });
    }

    return NextResponse.json({ configured: true, url: session.url, mode: "payment" });
  } catch (error) {
    console.error("[checkout] session creation failed", error instanceof Error ? error.message : "unknown_error");
    return NextResponse.json({ configured: true, error: "checkout unavailable" }, { status: 502 });
  }
}
