import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type UsageInput = {
  feature: string;
  provider: string;
  model: string;
  userId?: string | null;
  promptTokens?: number;
  completionTokens?: number;
  audioSeconds?: number;
  latencyMs?: number;
  success?: boolean;
  errorCode?: string | null;
  metadata?: Record<string, string | number | boolean | null>;
  service?: SupabaseClient | null;
};

function boundedNumber(value: unknown, max = 2_147_483_647): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(max, number)) : 0;
}

export function estimatedAiCostUsd({ provider, model, promptTokens = 0, completionTokens = 0, audioSeconds = 0 }: Pick<UsageInput, "provider" | "model" | "promptTokens" | "completionTokens" | "audioSeconds">): number {
  const input = boundedNumber(promptTokens);
  const output = boundedNumber(completionTokens);
  const seconds = boundedNumber(audioSeconds, 86_400);
  const normalizedModel = model.toLowerCase();

  if (provider === "deepseek") {
    // Conservative cache-miss rates per one million tokens. Environment
    // overrides keep the dashboard accurate when provider pricing changes.
    const isPro = normalizedModel.includes("pro");
    const inputRate = Number(process.env.DEEPSEEK_INPUT_USD_PER_MILLION) || (isPro ? 0.435 : 0.14);
    const outputRate = Number(process.env.DEEPSEEK_OUTPUT_USD_PER_MILLION) || (isPro ? 0.87 : 0.28);
    return (input * inputRate + output * outputRate) / 1_000_000;
  }
  if (provider === "groq" && normalizedModel.includes("whisper")) {
    const hourlyRate = Number(process.env.GROQ_WHISPER_USD_PER_HOUR) || 0.04;
    return Math.max(seconds, seconds ? 10 : 0) / 3_600 * hourlyRate;
  }
  if (provider === "openai" && normalizedModel === "whisper-1") {
    const minuteRate = Number(process.env.OPENAI_WHISPER_USD_PER_MINUTE) || 0.006;
    return seconds / 60 * minuteRate;
  }
  return 0;
}

export async function recordAiUsage(input: UsageInput): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const service = input.service ?? (url && key
    ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    : null);
  if (!service) return;

  const promptTokens = Math.round(boundedNumber(input.promptTokens));
  const completionTokens = Math.round(boundedNumber(input.completionTokens));
  const audioSeconds = boundedNumber(input.audioSeconds, 86_400);
  const { error } = await service.from("ai_usage_events").insert({
    user_id: input.userId ?? null,
    feature: input.feature.slice(0, 80),
    provider: input.provider.slice(0, 40),
    model: input.model.slice(0, 120),
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    audio_seconds: audioSeconds,
    estimated_cost_usd: estimatedAiCostUsd({
      provider: input.provider,
      model: input.model,
      promptTokens,
      completionTokens,
      audioSeconds,
    }),
    latency_ms: Math.round(boundedNumber(input.latencyMs)),
    success: input.success !== false,
    error_code: input.errorCode?.slice(0, 120) || null,
    metadata: input.metadata ?? {},
  });
  if (error) console.warn("[ai-usage] record unavailable", error.code ?? "database_error");
}
