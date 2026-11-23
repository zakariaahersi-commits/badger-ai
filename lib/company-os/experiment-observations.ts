import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { collectInstagramMediaInsights, socialConnector } from "@/lib/company-os/social-connector";
import { canonicalExperimentMetric } from "@/lib/company-os/experiment-attribution";
import { COMPANY_FUNNEL_EVENTS, productObservations } from "@/lib/company-os/experiment-funnel";
import { warmOutreachCounts } from "@/lib/company-os/warm-outreach";

type Experiment = {
  id: number;
  daily_plan_id?: number | null;
  status?: string | null;
  channel?: string | null;
  source_code?: string | null;
  target_metric?: string | null;
  success_threshold?: number | string | null;
  starts_at?: string | null;
  result?: Record<string, unknown> | null;
};

type Observation = {
  metric: string;
  value: number;
  unit: string;
  source: "product_events" | "instagram" | "manual";
  evidence: Record<string, unknown>;
  dedupeKey: string;
};

export type CompanyExperimentEvidence = {
  experimentId: number;
  targetMetric: string | null;
  successThreshold: number | null;
  targetValue: number | null;
  targetReached: boolean;
  observations: Array<{ metric: string; value: number; unit: string; source: string }>;
  observedAt: string;
};

function number(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function experimentObservationBucket(now: Date): string {
  return now.toISOString().slice(0, 13).replaceAll(/[-T:]/g, "");
}

function publicResult(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function collectCompanyExperimentEvidence(input: {
  service: SupabaseClient;
  experiment: Experiment | null | undefined;
  now?: Date;
  env?: NodeJS.ProcessEnv;
  fetcher?: typeof fetch;
}): Promise<CompanyExperimentEvidence | null> {
  const experiment = input.experiment;
  if (!experiment || !Number.isInteger(experiment.id) || experiment.id <= 0) return null;
  const now = input.now ?? new Date();
  const observedAt = now.toISOString();
  const bucket = experimentObservationBucket(now);
  const sourceCode = typeof experiment.source_code === "string" ? experiment.source_code : "";
  const since = experiment.starts_at && Number.isFinite(Date.parse(experiment.starts_at))
    ? experiment.starts_at
    : new Date(now.getTime() - 14 * 86_400_000).toISOString();

  const events = await input.service.from("product_events")
    .select("event_name,user_id,anonymous_id,properties")
    .in("event_name", [...COMPANY_FUNNEL_EVENTS])
    .gte("created_at", since)
    .limit(10_000);
  if (events.error) throw new Error("experiment_product_evidence_unavailable");

  const observations: Observation[] = sourceCode
    ? productObservations({ experimentId: experiment.id, sourceCode, channel: experiment.channel, targetMetric: canonicalExperimentMetric(experiment.target_metric), bucket, rows: events.data ?? [] })
    : [];

  if (experiment.channel === "warm_dm") {
    const batch = await input.service.from("company_outreach_batches")
      .select("id,company_outreach_contacts(status)")
      .eq("experiment_id", experiment.id)
      .limit(1)
      .maybeSingle();
    if (batch.error) throw new Error("experiment_warm_outreach_evidence_unavailable");
    if (batch.data) {
      const counts = warmOutreachCounts((batch.data.company_outreach_contacts ?? []).map((contact) => contact.status));
      for (const [metric, value] of Object.entries({ warm_messages_sent: counts.sent, warm_replies: counts.replies, warm_links_shared: counts.linksShared })) {
        observations.push({
          metric,
          value,
          unit: "founders",
          source: "manual",
          evidence: { batchId: String(batch.data.id), storesRecipientPii: false },
          dedupeKey: `manual:${experiment.id}:${bucket}:${metric}`,
        });
      }
    }
  }

  const actions = await input.service.from("company_actions")
    .select("id,result,executed_at")
    .eq("experiment_id", experiment.id)
    .eq("action_type", "publish_social_content")
    .eq("status", "completed")
    .order("executed_at", { ascending: false })
    .limit(25);
  if (actions.error) throw new Error("experiment_social_evidence_unavailable");

  const mediaActions = (actions.data ?? []).flatMap((action) => {
    const result = publicResult(action.result);
    const mediaId = typeof result.externalId === "string" && /^\d{5,40}$/.test(result.externalId) ? result.externalId : null;
    if (result.provider !== "instagram" || !mediaId) return [];
    return [{ actionId: String(action.id), mediaId, permalink: typeof result.permalink === "string" ? result.permalink : null }];
  });
  const connector = socialConnector(input.env ?? process.env);
  if (connector?.provider === "instagram" && mediaActions.length) {
    const insights = await collectInstagramMediaInsights({
      connector,
      mediaIds: mediaActions.map((item) => item.mediaId),
      observedAt: now,
      fetcher: input.fetcher,
    });
    const byMedia = new Map(mediaActions.map((item) => [item.mediaId, item]));
    for (const insight of insights) {
      const action = byMedia.get(insight.id);
      if (!action) continue;
      for (const [metric, value] of Object.entries(insight.metrics)) {
        if (!Number.isFinite(value)) continue;
        observations.push({
          metric: `instagram_${metric}`.slice(0, 100),
          value,
          unit: "count",
          source: "instagram",
          evidence: {
            mediaId: insight.id,
            actionId: action.actionId,
            permalink: action.permalink,
            mediaType: insight.mediaType ?? null,
            mediaProductType: insight.mediaProductType ?? null,
          },
          dedupeKey: `instagram:${experiment.id}:${insight.id}:${bucket}:${metric}`,
        });
      }
    }
  }

  if (observations.length) {
    const upsert = await input.service.from("company_experiment_observations").upsert(
      observations.map((item) => ({
        experiment_id: experiment.id,
        metric: item.metric,
        value: item.value,
        unit: item.unit,
        source: item.source,
        evidence: item.evidence,
        observed_at: observedAt,
        dedupe_key: item.dedupeKey,
      })),
      { onConflict: "dedupe_key" },
    );
    if (upsert.error) throw new Error("experiment_observation_write_failed");
  }

  const latest = new Map<string, Observation>();
  for (const observation of observations) latest.set(observation.metric, observation);
  const targetMetric = canonicalExperimentMetric(experiment.target_metric);
  const successThreshold = number(experiment.success_threshold);
  const targetValue = targetMetric ? latest.get(targetMetric)?.value ?? null : null;
  const targetReached = targetValue !== null && successThreshold !== null && targetValue >= successThreshold;
  const summary = [...latest.values()].map((item) => ({ metric: item.metric, value: item.value, unit: item.unit, source: item.source }));
  const update = await input.service.from("company_experiments").update({
    status: targetReached ? "won" : mediaActions.length || summary.some((item) => item.value > 0) ? "measuring" : experiment.status,
    ...(targetReached ? { ends_at: observedAt, learning: `Success threshold reached: ${targetMetric} ${targetValue}/${successThreshold}.` } : {}),
    result: { ...publicResult(experiment.result), latestObservations: summary, lastObservedAt: observedAt, targetReached },
    updated_at: observedAt,
  }).eq("id", experiment.id);
  if (update.error) throw new Error("experiment_state_update_failed");

  if (targetReached && Number.isInteger(experiment.daily_plan_id) && Number(experiment.daily_plan_id) > 0) {
    const [completed, links] = await Promise.all([
      input.service.from("company_daily_plans").update({ status: "completed", completed_at: observedAt, updated_at: observedAt })
        .eq("id", experiment.daily_plan_id)
        .eq("status", "active"),
      input.service.from("company_experiment_signals").select("signal_id").eq("experiment_id", experiment.id),
    ]);
    if (completed.error) throw new Error("daily_plan_completion_failed");
    if (links.error) throw new Error("experiment_signal_state_failed");
    const signalIds = (links.data ?? []).map((row) => Number(row.signal_id)).filter((id) => Number.isInteger(id) && id > 0);
    if (signalIds.length) {
      const signals = await input.service.from("company_trend_signals").update({ status: "used", updated_at: observedAt }).in("id", signalIds).eq("status", "testing");
      if (signals.error) throw new Error("experiment_signal_state_failed");
    }
  }

  return { experimentId: experiment.id, targetMetric, successThreshold, targetValue, targetReached, observations: summary, observedAt };
}
