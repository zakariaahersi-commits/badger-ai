import type { NextRequest } from "next/server";

// Simple sliding-window rate limiter for the AI endpoints, so a public URL
// can't be scripted against to burn DeepSeek credits. In-memory per serverless
// instance — not a distributed guarantee, but it stops naive hammering (the
// realistic abuse) with zero infra. Swap for Upstash/KV if abuse gets real.

const buckets = new Map<string, number[]>();

export function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

// Returns true if the request is allowed, false if over the limit.
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  // Prune the whole map occasionally so it can't grow unbounded.
  if (buckets.size > 2000) {
    for (const [k, v] of buckets) {
      if (!v.some((t) => now - t < windowMs)) buckets.delete(k);
    }
  }
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    buckets.set(key, hits);
    return false;
  }
  hits.push(now);
  buckets.set(key, hits);
  return true;
}
