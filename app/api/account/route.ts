import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { serverAuth } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function DELETE(req: NextRequest) {
  if (!rateLimit(`account-delete:${clientIp(req)}`, 3, 60_000)) {
    return NextResponse.json({ error: "rate limited" }, { status: 429 });
  }
  const auth = await serverAuth(req);
  if (auth.invalid || !auth.userId || !auth.service) return NextResponse.json({ error: "authentication required" }, { status: 401 });
  const userId = auth.userId;

  const entitlement = await auth.service.from("entitlements")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (entitlement.error) return NextResponse.json({ error: "billing state unavailable" }, { status: 503 });

  const customerId = entitlement.data?.stripe_customer_id;
  if (customerId && process.env.STRIPE_SECRET_KEY) {
    try {
      await new Stripe(process.env.STRIPE_SECRET_KEY).customers.del(customerId);
    } catch (error) {
      console.error("[account] Stripe customer deletion failed", error instanceof Error ? error.message : "unknown_error");
      return NextResponse.json({ error: "payment details could not be erased; no charge will be made" }, { status: 503 });
    }
  }

  const listed = await auth.service.storage.from("avatars").list(userId, { limit: 100 });
  if (!listed.error && listed.data?.length) {
    const removed = await auth.service.storage.from("avatars").remove(listed.data.map((item) => `${userId}/${item.name}`));
    if (removed.error) return NextResponse.json({ error: "avatar deletion failed" }, { status: 503 });
  }

  // These ledgers use ON DELETE SET NULL for aggregate reporting, so remove
  // the user's rows explicitly before deleting the Auth account.
  const erasures = await Promise.all([
    auth.service.from("email_events").delete().eq("user_id", userId),
    auth.service.from("product_events").delete().eq("user_id", userId),
    auth.service.from("ai_usage_events").delete().eq("user_id", userId),
  ]);
  if (erasures.some((result) => result.error)) return NextResponse.json({ error: "account data deletion failed" }, { status: 503 });

  const deleted = await auth.service.auth.admin.deleteUser(userId, false);
  if (deleted.error) {
    console.error("[account] auth deletion failed", deleted.error.message);
    return NextResponse.json({ error: "account deletion failed" }, { status: 503 });
  }
  return NextResponse.json({ deleted: true });
}
