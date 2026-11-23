import { normalizePreparedSocialContent, type PreparedSocialContent } from "./execution-policy.ts";

const HEYGEN_API = "https://api.heygen.com";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type UgcRenderJob = {
  preparedActionId: string;
  title: string;
  prepared: PreparedSocialContent;
};

export type HeyGenConnector = {
  apiKey: string;
  avatarId: string;
  voiceId: string;
};

export type HeyGenVideoStatus = {
  state: "pending" | "waiting" | "processing" | "completed" | "failed";
  videoUrl: string | null;
  thumbnailUrl: string | null;
  error: string | null;
};

export function companyUgcAssetPath(result: unknown, actionId: string): string | null {
  if (!UUID.test(actionId) || !result || typeof result !== "object" || Array.isArray(result)) return null;
  const record = result as Record<string, unknown>;
  if (record.state !== "completed" || record.storageBucket !== "company-content" || typeof record.storagePath !== "string") return null;
  const prefix = `ugc/${actionId}/`;
  return record.storagePath.startsWith(prefix) && /^[a-zA-Z0-9/_-]+\.mp4$/.test(record.storagePath) ? record.storagePath : null;
}

function requiredText(value: unknown, max: number, label: string): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw new Error(`invalid_${label}`);
  return value.trim();
}

function safeHttpsUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const privateIpv4 = /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
    const privateIpv6 = host === "[::1]" || host === "::1" || /^\[?(fc|fd|fe80):/i.test(host);
    if (url.protocol !== "https:" || url.username || url.password || host === "localhost" || host.endsWith(".local") || privateIpv4 || privateIpv6) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function heyGenConnector(env: NodeJS.ProcessEnv = process.env): HeyGenConnector | null {
  const apiKey = env.HEYGEN_API_KEY?.trim();
  const avatarId = env.HEYGEN_AVATAR_ID?.trim();
  const voiceId = env.HEYGEN_VOICE_ID?.trim();
  if (!apiKey && !avatarId && !voiceId) return null;
  if (!apiKey || !avatarId || !voiceId) throw new Error("ugc_renderer_configuration_incomplete");
  if (apiKey.length > 500 || avatarId.length > 240 || voiceId.length > 240) throw new Error("ugc_renderer_configuration_invalid");
  return { apiKey, avatarId, voiceId };
}

export function normalizeUgcRenderJob(payload: Record<string, unknown>): UgcRenderJob {
  const preparedActionId = requiredText(payload.preparedActionId, 36, "prepared_action_id");
  if (!UUID.test(preparedActionId)) throw new Error("invalid_prepared_action_id");
  const content = payload.prepared;
  if (!content || typeof content !== "object" || Array.isArray(content)) throw new Error("invalid_prepared_social_content");
  const prepared = normalizePreparedSocialContent(content as Record<string, unknown>);
  if (prepared.ugc.format !== "ai_founder_avatar" || prepared.ugc.disclosure !== "AI-generated presenter") throw new Error("invalid_ugc_render_format");
  return { preparedActionId, title: requiredText(payload.title, 120, "ugc_title"), prepared };
}

export async function createHeyGenVideo(input: {
  connector: HeyGenConnector;
  job: UgcRenderJob;
  fetchImpl?: typeof fetch;
}): Promise<{ videoId: string }> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(`${HEYGEN_API}/v2/video/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Api-Key": input.connector.apiKey },
    body: JSON.stringify({
      title: input.job.title,
      caption: true,
      dimension: { width: 720, height: 1280 },
      video_inputs: [{
        character: { type: "avatar", avatar_id: input.connector.avatarId, avatar_style: "normal" },
        voice: { type: "text", input_text: input.job.prepared.ugc.script, voice_id: input.connector.voiceId },
        background: { type: "color", value: "#FFF1E5" },
      }],
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`heygen_provider_${response.status}`);
  const body = await response.json().catch(() => null) as { data?: { video_id?: unknown } } | null;
  const videoId = typeof body?.data?.video_id === "string" ? body.data.video_id.trim() : "";
  if (!videoId || videoId.length > 240) throw new Error("heygen_invalid_response");
  return { videoId };
}

export async function retrieveHeyGenVideo(input: {
  connector: HeyGenConnector;
  videoId: string;
  fetchImpl?: typeof fetch;
}): Promise<HeyGenVideoStatus> {
  const videoId = requiredText(input.videoId, 240, "heygen_video_id");
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(`${HEYGEN_API}/v1/video_status.get?video_id=${encodeURIComponent(videoId)}`, {
    method: "GET",
    headers: { "Accept": "application/json", "X-Api-Key": input.connector.apiKey },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`heygen_provider_${response.status}`);
  const body = await response.json().catch(() => null) as { data?: Record<string, unknown> } | null;
  const data = body?.data;
  const state = typeof data?.status === "string" ? data.status.trim().toLowerCase() : "";
  if (!(["pending", "waiting", "processing", "completed", "failed"] as const).includes(state as HeyGenVideoStatus["state"])) throw new Error("heygen_invalid_response");
  const videoUrl = safeHttpsUrl(data?.video_url);
  const thumbnailUrl = safeHttpsUrl(data?.thumbnail_url);
  if (state === "completed" && !videoUrl) throw new Error("heygen_invalid_response");
  const providerError = typeof data?.error === "string" ? data.error.trim().slice(0, 500) : null;
  return { state: state as HeyGenVideoStatus["state"], videoUrl, thumbnailUrl, error: providerError };
}

export async function downloadRenderedVideo(input: { videoUrl: string; fetchImpl?: typeof fetch }): Promise<Uint8Array> {
  const videoUrl = safeHttpsUrl(input.videoUrl);
  if (!videoUrl) throw new Error("invalid_ugc_video_url");
  const fetchImpl = input.fetchImpl ?? fetch;
  // Fail closed on redirects so a provider response cannot bounce this
  // server-side download into a private network address.
  const response = await fetchImpl(videoUrl, { method: "GET", redirect: "error", signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`ugc_video_download_${response.status}`);
  const length = Number(response.headers.get("content-length") || 0);
  if (Number.isFinite(length) && length > 100 * 1024 * 1024) throw new Error("ugc_video_too_large");
  const contentType = (response.headers.get("content-type") || "").toLowerCase();
  if (contentType && !contentType.includes("video/mp4") && !contentType.includes("application/octet-stream")) throw new Error("invalid_ugc_video_type");
  const result = new Uint8Array(await response.arrayBuffer());
  if (!result.byteLength || result.byteLength > 100 * 1024 * 1024) throw new Error("ugc_video_too_large");
  return result;
}
