import type { SupabaseClient } from "@supabase/supabase-js";
import { revealText } from "./crypto.ts";
import { processMessagingWebhookEvent } from "./service.ts";
import type { MessagingProvider } from "./provider.ts";

export async function drainMessagingEvents(service: SupabaseClient, limit = 8): Promise<number> {
  const { data, error } = await service.from("messaging_webhook_events")
    .select("id, provider, payload_ciphertext")
    .in("status", ["queued", "failed"])
    .lt("attempt_count", 3)
    .order("received_at", { ascending: true })
    .limit(Math.max(1, Math.min(20, limit)));
  if (error) throw new Error("message_queue_unavailable");
  let processed = 0;
  for (const row of data ?? []) {
    try {
      const payload = JSON.parse(revealText(row.payload_ciphertext));
      await processMessagingWebhookEvent(service, row.provider as MessagingProvider, row.id, payload);
      processed++;
    } catch {
      await service.from("messaging_webhook_events").update({ status: "failed", last_error: "encrypted_payload_invalid" }).eq("id", row.id);
    }
  }
  return processed;
}
