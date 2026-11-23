import type { SupabaseClient } from "@supabase/supabase-js";

export interface MessagingPilotMetrics {
  generatedAt: string;
  linkCodesCreated7d: number;
  reconnectEmailsSent7d: number;
  reconnectConversions7d: number;
  connectedTotal: number;
  activeConnections: number;
  pausedConnections: number;
  optedOutConnections: number;
  repliedWithinDay1: number;
  repliedOnDay3: number;
  taskCompleters7d: number;
  inboundMessages7d: number;
  outboundMessages7d: number;
  deliveryFailures7d: number;
  reportedWrongUserIncidents: number;
}

function count(value: number | null): number { return value ?? 0; }

export async function loadMessagingPilotMetrics(service: SupabaseClient, now = new Date()): Promise<MessagingPilotMetrics> {
  const since7d = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const [links, channels, activity, taskEvents, reconnectEvents, wrongUserReports] = await Promise.all([
    service.from("messaging_link_codes").select("user_id").gte("created_at", since7d).limit(1000),
    service.from("messaging_channels").select("id, user_id, status, consent_at").in("provider", ["linq", "sendblue"]).limit(1000),
    service.from("messaging_activity").select("user_id, direction, event_kind, created_at").in("provider", ["linq", "sendblue"]).gte("created_at", since7d).limit(10000),
    service.from("product_events").select("user_id").eq("event_name", "task_completed").contains("properties", { source: "imessage" }).gte("created_at", since7d).limit(1000),
    service.from("product_events").select("user_id, event_name, properties").in("event_name", ["imessage_reconnect_email_sent", "imessage_connected"]).gte("created_at", since7d).limit(1000),
    service.from("bug_reports").select("id", { count: "exact", head: true }).contains("metadata", { channel: "imessage", wrong_user: true }),
  ]);
  const failure = [links, channels, activity, taskEvents, reconnectEvents, wrongUserReports].find((result) => result.error)?.error;
  if (failure) throw new Error(`messaging_metrics_unavailable:${failure.message}`);

  const channelRows = channels.data ?? [];
  const consentByUser = new Map(channelRows.flatMap((row) => typeof row.user_id === "string" && typeof row.consent_at === "string" ? [[row.user_id, Date.parse(row.consent_at)] as const] : []));
  const day1 = new Set<string>();
  const day3 = new Set<string>();
  let inboundMessages7d = 0;
  let outboundMessages7d = 0;
  let deliveryFailures7d = 0;
  for (const row of activity.data ?? []) {
    if (row.direction === "inbound" && ["message", "command", "evidence"].includes(row.event_kind)) {
      inboundMessages7d++;
      if (typeof row.user_id === "string" && typeof row.created_at === "string") {
        const consentAt = consentByUser.get(row.user_id);
        const at = Date.parse(row.created_at);
        if (Number.isFinite(consentAt) && Number.isFinite(at)) {
          const elapsed = at - consentAt!;
          if (elapsed >= 0 && elapsed <= 86_400_000) day1.add(row.user_id);
          if (elapsed >= 2 * 86_400_000 && elapsed <= 4 * 86_400_000) day3.add(row.user_id);
        }
      }
    }
    if (row.direction === "outbound" && row.event_kind === "message") outboundMessages7d++;
    if (row.event_kind === "failed") deliveryFailures7d++;
  }
  return {
    generatedAt: now.toISOString(),
    linkCodesCreated7d: new Set((links.data ?? []).map((row) => row.user_id)).size,
    reconnectEmailsSent7d: new Set((reconnectEvents.data ?? []).filter((row) => row.event_name === "imessage_reconnect_email_sent").map((row) => row.user_id)).size,
    reconnectConversions7d: new Set((reconnectEvents.data ?? []).filter((row) => row.event_name === "imessage_connected" && row.properties?.source === "reconnect_email").map((row) => row.user_id)).size,
    connectedTotal: channelRows.length,
    activeConnections: channelRows.filter((row) => row.status === "active").length,
    pausedConnections: channelRows.filter((row) => row.status === "paused").length,
    optedOutConnections: channelRows.filter((row) => row.status === "opted_out").length,
    repliedWithinDay1: day1.size,
    repliedOnDay3: day3.size,
    taskCompleters7d: new Set((taskEvents.data ?? []).map((row) => row.user_id).filter(Boolean)).size,
    inboundMessages7d,
    outboundMessages7d,
    deliveryFailures7d,
    reportedWrongUserIncidents: count(wrongUserReports.count),
  };
}
