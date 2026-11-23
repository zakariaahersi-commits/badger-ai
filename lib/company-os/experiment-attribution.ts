const TARGET_METRIC_ALIASES: Record<string, string> = {
  page_view: "attributed_landing_visits",
  onboarding_started: "attributed_onboarding_starts",
  plan_reveal_viewed: "attributed_plan_reveals",
  plan_reveal_cta_clicked: "attributed_plan_reveal_cta_clicks",
  paywall_viewed: "attributed_paywall_views",
  checkout_started: "attributed_checkout_starts",
  checkout_completed: "attributed_checkout_completions",
};

export function canonicalExperimentMetric(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const metric = value.trim().slice(0, 100);
  return TARGET_METRIC_ALIASES[metric] ?? metric;
}

export function buildExperimentTrackingUrl(input: { site?: string | null; sourceCode?: string | null; channel?: string | null }): string | null {
  const sourceCode = typeof input.sourceCode === "string" ? input.sourceCode.trim().slice(0, 64) : "";
  if (!sourceCode) return null;
  try {
    const site = new URL(input.site?.trim() || "https://badger.example.com");
    const target = new URL("/start", site.origin);
    target.searchParams.set("utm_source", "badger_company_os");
    target.searchParams.set("utm_medium", typeof input.channel === "string" && input.channel.trim() ? input.channel.trim().slice(0, 40) : "other");
    target.searchParams.set("utm_campaign", sourceCode);
    return target.toString();
  } catch {
    return null;
  }
}

export function withExperimentTrackingLink(content: unknown, trackingUrl: string | null): string {
  if (typeof content !== "string" || !content.trim()) return "";
  const clean = content.trim().replace(/\r\n/g, "\n").replace(/[\t ]+/g, " ").replace(/\n{3,}/g, "\n\n");
  if (!trackingUrl) return clean;
  let target: URL;
  try { target = new URL(trackingUrl); } catch { return clean; }
  const replaced = clean.replace(/https?:\/\/[^\s<>"']+/gi, (candidate) => {
    try {
      const parsed = new URL(candidate);
      return parsed.hostname === target.hostname && parsed.pathname === "/start" ? trackingUrl : candidate;
    } catch {
      return candidate;
    }
  });
  return replaced.includes(trackingUrl) ? replaced : `${replaced}\n\n${trackingUrl}`;
}
