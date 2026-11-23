import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { GROWTH_PLAYBOOKS, growthPlaybook, type GrowthPlaybookSlug } from "./growth-playbooks.ts";

export type TrendSignalScore = {
  velocity: number;
  paymentEvidence: number;
  badgerRelevance: number;
  reachability: number;
  freshness: number;
  saturation: number;
  risk: number;
};

export type TrendSignal = TrendSignalScore & {
  id?: number;
  sourceType: "hacker_news" | "customer" | "payment" | "product" | "founder" | "manual";
  sourceItemId?: string;
  sourceUrl: string;
  title: string;
  summary?: string;
  category: "founder_problem" | "market_shift" | "distribution" | "competitor" | "product_behaviour";
  observedAt: string;
  score?: number;
  status?: "fresh" | "watch" | "testing" | "used" | "retired";
};

const clamp = (value: number) => Math.max(0, Math.min(5, Math.round(value)));

export function scoreTrendSignal(input: TrendSignalScore): number {
  const velocity = clamp(input.velocity);
  const payment = clamp(input.paymentEvidence);
  const relevance = clamp(input.badgerRelevance);
  const reachability = clamp(input.reachability);
  const freshness = clamp(input.freshness);
  const saturation = clamp(input.saturation);
  const risk = clamp(input.risk);
  return Number((velocity * 2 + payment * 3 + relevance * 3 + reachability * 2 + freshness * 2 - saturation * 1.5 - risk * 2).toFixed(2));
}

export function trendFingerprint(input: Pick<TrendSignal, "sourceType" | "sourceItemId" | "sourceUrl">): string {
  return createHash("sha256").update(`${input.sourceType}:${input.sourceItemId ?? input.sourceUrl}`).digest("hex");
}

function matchingPlaybook(signal: TrendSignal): GrowthPlaybookSlug {
  if (signal.category === "founder_problem" || signal.sourceType === "customer") return "yc-customer-interviews";
  if (signal.category === "product_behaviour") return "reforge-proof-loop";
  if (signal.category === "distribution") return "polsia-build-in-public";
  if (signal.paymentEvidence >= 3) return "yc-manual-first-customers";
  return "donnelly-code";
}

export function rankTrendSignals(signals: TrendSignal[]) {
  return signals
    .map((signal) => ({ ...signal, score: scoreTrendSignal(signal), recommendedPlaybook: growthPlaybook(matchingPlaybook(signal)) }))
    .sort((left, right) => (right.score ?? 0) - (left.score ?? 0) || Date.parse(right.observedAt) - Date.parse(left.observedAt));
}

export async function loadGrowthRadar(service: SupabaseClient, limit = 8) {
  const result = await service.from("company_trend_signals")
    .select("id,source_type,source_url,title,summary,category,velocity,payment_evidence,badger_relevance,reachability,freshness,saturation,risk,score,status,observed_at,last_seen_at")
    .in("status", ["fresh", "watch", "testing"])
    .order("score", { ascending: false })
    .order("observed_at", { ascending: false })
    .limit(limit);
  if (result.error) throw new Error("growth_radar_unavailable");
  const signals = (result.data ?? []).map((row) => ({
    id: Number(row.id),
    sourceType: row.source_type as TrendSignal["sourceType"],
    sourceUrl: row.source_url,
    title: row.title,
    summary: row.summary,
    category: row.category as TrendSignal["category"],
    velocity: Number(row.velocity),
    paymentEvidence: Number(row.payment_evidence),
    badgerRelevance: Number(row.badger_relevance),
    reachability: Number(row.reachability),
    freshness: Number(row.freshness),
    saturation: Number(row.saturation),
    risk: Number(row.risk),
    score: Number(row.score),
    status: row.status as TrendSignal["status"],
    observedAt: row.observed_at,
    lastSeenAt: row.last_seen_at,
    recommendedPlaybook: growthPlaybook(matchingPlaybook({
      sourceType: row.source_type as TrendSignal["sourceType"], sourceUrl: row.source_url, title: row.title, summary: row.summary,
      category: row.category as TrendSignal["category"], velocity: Number(row.velocity), paymentEvidence: Number(row.payment_evidence),
      badgerRelevance: Number(row.badger_relevance), reachability: Number(row.reachability), freshness: Number(row.freshness),
      saturation: Number(row.saturation), risk: Number(row.risk), observedAt: row.observed_at,
    })),
  }));
  return { signals, playbooks: GROWTH_PLAYBOOKS };
}

export async function upsertTrendSignals(service: SupabaseClient, signals: TrendSignal[]) {
  if (!signals.length) return { stored: 0 };
  const rows = signals.map((signal) => ({
    fingerprint: trendFingerprint(signal),
    source_type: signal.sourceType,
    source_item_id: signal.sourceItemId ?? null,
    source_url: signal.sourceUrl,
    title: signal.title.slice(0, 300),
    summary: (signal.summary ?? "").slice(0, 2000),
    category: signal.category,
    velocity: clamp(signal.velocity),
    payment_evidence: clamp(signal.paymentEvidence),
    badger_relevance: clamp(signal.badgerRelevance),
    reachability: clamp(signal.reachability),
    freshness: clamp(signal.freshness),
    saturation: clamp(signal.saturation),
    risk: clamp(signal.risk),
    observed_at: signal.observedAt,
    last_seen_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));
  const result = await service.from("company_trend_signals").upsert(rows, { onConflict: "fingerprint" }).select("id");
  if (result.error) throw new Error("growth_radar_write_failed");
  return { stored: result.data?.length ?? 0 };
}
