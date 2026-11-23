import type { ServerAuth } from "./server-auth.ts";
import { BADGER_PRODUCT } from "./entitlements.ts";

export type PaidAccessState = "active" | "missing" | "unavailable";

export async function paidAccessState(auth: ServerAuth): Promise<PaidAccessState> {
  if (!auth.userId || !auth.service || auth.invalid) return "missing";
  const entitlement = await auth.service
    .from("entitlements")
    .select("status")
    .eq("user_id", auth.userId)
    .eq("product", BADGER_PRODUCT)
    .maybeSingle();
  if (entitlement.error) return "unavailable";
  return entitlement.data?.status === "active" ? "active" : "missing";
}
