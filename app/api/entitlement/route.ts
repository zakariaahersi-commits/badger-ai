import { NextRequest, NextResponse } from "next/server";
import { serverAuth } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = await serverAuth(req);
  if (!auth.userId || !auth.service || auth.invalid) {
    return NextResponse.json({ access: false, paid: false }, { status: 401 });
  }
  const entitlement = await auth.service.from("entitlements")
    .select("status, granted_at")
    .eq("user_id", auth.userId)
    .eq("product", "badger-28-day")
    .maybeSingle();
  if (entitlement.error) {
    console.error("[entitlement] lookup failed", entitlement.error.code ?? "database_error");
    return NextResponse.json({ access: false, paid: false }, { status: 503 });
  }
  const paid = entitlement.data?.status === "active";
  return NextResponse.json({
    access: paid,
    paid,
    status: paid ? "paid" : entitlement.data?.status ?? "none",
    startedAt: paid ? entitlement.data?.granted_at ?? null : null,
  }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
