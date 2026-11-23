export type DeepSeekMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface DeepSeekCompletionOptions {
  apiKey: string;
  model?: string;
  messages: DeepSeekMessage[];
  maxTokens: number;
  timeoutMs: number;
  attempts?: number;
  temperature?: number;
  json?: boolean;
  validate?: (text: string) => boolean;
  retryDelayMs?: number;
  fetchImpl?: FetchLike;
  gatewayKey?: string | null;
}

export interface DeepSeekCompletion {
  text: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  attempts: number;
  finishReason: string | null;
  priorErrorCodes: string[];
}

export class DeepSeekCompletionError extends Error {
  readonly code: string;
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly latencyMs: number;
  readonly attempts: number;
  readonly attemptCodes: string[];

  constructor(input: {
    code: string;
    promptTokens: number;
    completionTokens: number;
    latencyMs: number;
    attempts: number;
    attemptCodes?: string[];
  }) {
    super(input.code);
    this.name = "DeepSeekCompletionError";
    this.code = input.code;
    this.promptTokens = input.promptTokens;
    this.completionTokens = input.completionTokens;
    this.latencyMs = input.latencyMs;
    this.attempts = input.attempts;
    this.attemptCodes = input.attemptCodes ?? [input.code];
  }
}

const API_URL = "https://api.deepseek.com/v1/chat/completions";
const GATEWAY_API_URL = "https://ai-gateway.vercel.sh/v1/chat/completions";

function positiveInteger(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function errorCode(error: unknown): string {
  if (error instanceof DeepSeekCompletionError) return error.code;
  if (error instanceof Error && error.name === "AbortError") return "timeout";
  if (error instanceof SyntaxError) return "invalid_json";
  const message = error instanceof Error ? error.message : "request_failed";
  return /^(provider_\d{3}|empty_response|invalid_response)$/.test(message) ? message : "request_failed";
}

export function isRetryableDeepSeekErrorCode(code: string): boolean {
  if (["timeout", "request_failed", "empty_response", "invalid_json", "invalid_response"].includes(code)) return true;
  const status = Number(code.match(/^provider_(\d{3})$/)?.[1]);
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

function wait(milliseconds: number): Promise<void> {
  return milliseconds > 0 ? new Promise((resolve) => setTimeout(resolve, milliseconds)) : Promise.resolve();
}

export async function deepSeekCompletion(options: DeepSeekCompletionOptions): Promise<DeepSeekCompletion> {
  const startedAt = Date.now();
  const model = options.model ?? process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash";
  const configuredGatewayKey = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN;
  const gatewayKey = options.gatewayKey === undefined ? configuredGatewayKey : options.gatewayKey || undefined;
  const apiKey = gatewayKey || options.apiKey;
  const apiUrl = gatewayKey ? GATEWAY_API_URL : API_URL;
  const requestModel = gatewayKey && !model.startsWith("deepseek/") ? `deepseek/${model}` : model;
  const attempts = Math.min(3, positiveInteger(options.attempts ?? 2, 2));
  const timeoutMs = positiveInteger(options.timeoutMs, 30_000);
  const maxTokens = positiveInteger(options.maxTokens, 2_048);
  const fetchImpl = options.fetchImpl ?? fetch;
  let promptTokens = 0;
  let completionTokens = 0;
  let lastCode = "request_failed";
  const priorErrorCodes: string[] = [];

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: requestModel,
          messages: options.messages,
          max_tokens: maxTokens,
          temperature: options.temperature ?? 0.3,
          // Badger needs a short final answer, not a hidden reasoning trace.
          // This parameter is DeepSeek-specific and must not be forwarded when
          // the gateway routes a feature to a different model family.
          thinking: { type: "disabled" },
          // DeepSeek documents occasional empty responses in JSON mode. Retry
          // without the transport-level JSON constraint while keeping the JSON
          // instruction in the prompt.
          ...(options.json && attempt === 1 ? { response_format: { type: "json_object" } } : {}),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        await response.text().catch(() => "");
        throw new Error(`provider_${response.status}`);
      }

      const data = await response.json();
      promptTokens += Number(data?.usage?.prompt_tokens) || 0;
      completionTokens += Number(data?.usage?.completion_tokens) || 0;
      const text = typeof data?.choices?.[0]?.message?.content === "string"
        ? data.choices[0].message.content.trim()
        : "";
      if (!text) throw new Error("empty_response");
      if (options.validate && !options.validate(text)) throw new Error("invalid_response");

      return {
        text,
        model: requestModel,
        promptTokens,
        completionTokens,
        latencyMs: Date.now() - startedAt,
        attempts: attempt,
        finishReason: typeof data?.choices?.[0]?.finish_reason === "string" ? data.choices[0].finish_reason : null,
        priorErrorCodes,
      };
    } catch (error) {
      lastCode = errorCode(error);
      if (attempt >= attempts || !isRetryableDeepSeekErrorCode(lastCode)) {
        throw new DeepSeekCompletionError({
          code: lastCode,
          promptTokens,
          completionTokens,
          latencyMs: Date.now() - startedAt,
          attempts: attempt,
          attemptCodes: [...priorErrorCodes, lastCode],
        });
      }
      priorErrorCodes.push(lastCode);
      await wait((options.retryDelayMs ?? 200) * attempt);
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new DeepSeekCompletionError({
    code: lastCode,
    promptTokens,
    completionTokens,
    latencyMs: Date.now() - startedAt,
    attempts,
    attemptCodes: [...priorErrorCodes, lastCode],
  });
}
