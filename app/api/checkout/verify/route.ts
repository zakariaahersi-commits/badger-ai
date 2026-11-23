import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { grantCheckoutEntitlement } from "@/lib/entitlements";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { serverAuth } from "@/lib/server-auth";

// Confirms a returning Checkout session actually paid before the client
// marks the sprint as unlocked. Never trust the query param alone.

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!rateLimit(`checkout-verify:${clientIp(req)}`, 20, 60_000)) {
    return NextResponse.json({ paid: false }, { status: 429 });
  }
  const key = process.env.STRIPE_SECRET_KEY;
  const sessionId = req.nextUrl.searchParams.get("session_id");
  if (!key || !sessionId) {
    return NextResponse.json({ paid: false }, { status: 200 });
  }
  const auth = await serverAuth(req);
  if (!auth.userId || !auth.service || auth.invalid) {
    return NextResponse.json({ paid: false }, { status: 401 });
  }
  const stripe = new Stripe(key);
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const paid = await grantCheckoutEntitlement(auth.service, session, auth.userId);
    if (!paid) return NextResponse.json({ access: false, paid: false });
    const entitlement = await auth.service.from("entitlements")
      .select("granted_at")
      .eq("user_id", auth.userId)
      .eq("product", "badger-28-day")
      .eq("status", "active")
      .maybeSingle();
    const paymentIntent = typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? session.id;
    return NextResponse.json({
      access: true,
      paid: true,
      status: "paid",
      startedAt: entitlement.data?.granted_at ?? null,
      productId: "badger-28-day",
      revenue: (session.amount_total ?? 0) / 100,
      currency: (session.currency ?? "usd").toUpperCase(),
      transactionId: paymentIntent,
    });
  } catch {
    return NextResponse.json({ access: false, paid: false });
  }
}
