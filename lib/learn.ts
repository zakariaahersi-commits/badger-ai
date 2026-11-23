import { createClient } from "@supabase/supabase-js";

// Cross-user learning, read side. Returns a compact "what's working across
// founders" hint to weave into Bo's plan + coach prompts — or "" when there's
// no data or Supabase isn't configured. Anonymized aggregate only, never PII.
// (Queries on each call for now; cache with a short TTL once signals get big.)
export async function learnedPatternsText(track?: string): Promise<string> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return "";
  try {
    const client = createClient(url, key);
    const { data } = await client.from("signals").select("track, task_type, outcome").limit(5000);
    const rows = data ?? [];
    const strong = new Set(["yes", "paid", "shipped"]);
    const tally: Record<string, { taskType: string; strong: number; total: number }> = {};
    for (const r of rows) {
      if (!r.task_type) continue;
      if (track && r.track !== track) continue;
      const t = (tally[r.task_type] ??= { taskType: r.task_type, strong: 0, total: 0 });
      t.total++;
      if (strong.has(r.outcome)) t.strong++;
    }
    const patterns = Object.values(tally)
      .filter((t) => t.total >= 5) // ignore noise until there's a real sample
      .map((t) => ({ taskType: t.taskType, total: t.total, rate: Math.round((t.strong / t.total) * 100) }))
      .sort((a, b) => b.rate - a.rate)
      .slice(0, 6);
    if (!patterns.length) return "";
    return `WHAT'S WORKING ACROSS FOUNDERS (anonymized signal from real sprints; a hint, not a rule):\n${patterns
      .map((p) => `- "${p.taskType}" tasks precede real progress ${p.rate}% of the time (${p.total} sprints)`)
      .join("\n")}`;
  } catch {
    return "";
  }
}
