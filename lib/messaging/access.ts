import type { SupabaseClient } from "@supabase/supabase-js";

export async function hasActiveMessagingAccess(service: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await service.from("entitlements")
    .select("status")
    .eq("user_id", userId)
    .eq("product", "badger-28-day")
    .maybeSingle();
  if (error) throw new Error("access_check_failed");
  return data?.status === "active";
}
