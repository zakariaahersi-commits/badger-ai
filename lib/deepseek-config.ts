// One source of truth for every DeepSeek-backed feature. Production can use
// Vercel AI Gateway identity, the canonical key, or the legacy key names that
// predate the current environment-variable convention.
export function deepseekKey(): { key?: string; name?: string } {
  if (process.env.AI_GATEWAY_API_KEY) return { key: process.env.AI_GATEWAY_API_KEY, name: "AI_GATEWAY_API_KEY" };
  if (process.env.VERCEL_OIDC_TOKEN) return { key: process.env.VERCEL_OIDC_TOKEN, name: "VERCEL_OIDC_TOKEN" };
  for (const name of ["DEEPSEEK_API_KEY", "Deepseek_API", "DEEPSEEK_API"]) {
    const key = process.env[name]?.trim();
    if (key?.startsWith("sk-") && key.length >= 24) return { key, name };
  }
  return {};
}
