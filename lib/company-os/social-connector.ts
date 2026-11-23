import { normalizeSocialPosts } from "./execution-policy.ts";
import { INSTAGRAM_ASSET_CATALOG, type InstagramAssetId } from "./social-assets.ts";
export type SocialConnectorProvider = "instagram" | "webhook";

type InstagramConnector = {
  provider: "instagram";
  accountId: string;
  accessToken: string;
  expectedUsername: string;
  apiVersion: string;
  site: URL;
};

type WebhookConnector = {
  provider: "webhook";
  webhook: URL;
  secret: string;
};

export type SocialConnector = InstagramConnector | WebhookConnector;

type InstagramMedia = {
  id: string;
  caption?: string;
  permalink?: string;
  timestamp?: string;
  mediaType?: string;
  mediaProductType?: string;
  likeCount?: number;
  commentsCount?: number;
};
export type InstagramMediaInsight = InstagramMedia & {
  metrics: Record<string, number>;
  observedAt: string;
};
type Fetcher = typeof fetch;

const ACCOUNT_ID = /^\d{5,40}$/;
const API_VERSION = /^v\d{1,2}\.0$/;
const USERNAME = /^[a-z0-9._]{1,30}$/i;
const MEDIA_ID = /^\d{5,40}$/;

function publicSite(value: string | undefined): URL | null {
  try {
    const site = new URL(value || "https://badger.example.com");
    if (site.protocol !== "https:" || site.username || site.password) return null;
    return site;
  } catch {
    return null;
  }
}

function instagramConfiguration(env: NodeJS.ProcessEnv): InstagramConnector | null {
  const accountId = env.INSTAGRAM_BUSINESS_ACCOUNT_ID?.trim() ?? "";
  const accessToken = env.INSTAGRAM_BUSINESS_ACCESS_TOKEN?.trim() ?? "";
  const expectedUsername = env.INSTAGRAM_EXPECTED_USERNAME?.trim() ?? "";
  const apiVersion = env.INSTAGRAM_GRAPH_API_VERSION?.trim() || "v26.0";
  const site = publicSite(env.NEXT_PUBLIC_SITE_URL);
  if (!ACCOUNT_ID.test(accountId) || accessToken.length < 20 || !USERNAME.test(expectedUsername) || !API_VERSION.test(apiVersion) || !site) return null;
  return { provider: "instagram", accountId, accessToken, expectedUsername, apiVersion, site };
}

function webhookConfiguration(env: NodeJS.ProcessEnv): WebhookConnector | null {
  const value = env.COMPANY_SOCIAL_WEBHOOK_URL?.trim();
  const secret = env.COMPANY_SOCIAL_WEBHOOK_SECRET?.trim() ?? "";
  try {
    if (!value || secret.length < 16) return null;
    const webhook = new URL(value);
    const host = webhook.hostname.toLowerCase();
    const privateIpv4 = /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
    const privateIpv6 = host === "[::1]" || host === "::1" || /^\[?(fc|fd|fe80):/i.test(host);
    if (webhook.protocol !== "https:" || webhook.username || webhook.password || host === "localhost" || host.endsWith(".local") || privateIpv4 || privateIpv6) return null;
    return { provider: "webhook", webhook, secret };
  } catch {
    return null;
  }
}

export function socialConnector(env: NodeJS.ProcessEnv = process.env): SocialConnector | null {
  const instagramKeys = [env.INSTAGRAM_BUSINESS_ACCOUNT_ID, env.INSTAGRAM_BUSINESS_ACCESS_TOKEN, env.INSTAGRAM_EXPECTED_USERNAME];
  const instagramStarted = instagramKeys.some((value) => Boolean(value?.trim()));
  if (instagramStarted) return instagramConfiguration(env);
  return webhookConfiguration(env);
}

export function socialConnectorProvider(env: NodeJS.ProcessEnv = process.env): SocialConnectorProvider | null {
  return socialConnector(env)?.provider ?? null;
}

export function normalizeInstagramPublication(payload: Record<string, unknown>, site: URL) {
  const posts = normalizeSocialPosts(payload);
  const channels = Object.keys(posts);
  if (channels.length !== 1 || channels[0] !== "instagram" || !posts.instagram) throw new Error("invalid_instagram_publication");
  const caption = posts.instagram.trim();
  const genericSaasCopy = /most founders don['’]t need|game[ -]?changer|unlock your|supercharge|revolutioni[sz]e|are you ready|prove to yourself|first step is waiting|(?:🚀|🔥|✨)/i;
  const productSpecific = /\bbo\b/i.test(caption) && /\b(task|plan|proof|evidence|follow(?:s|ed|ing)? up|check[ -]?in)\b/i.test(caption);
  const hashtagCount = (caption.match(/#[\p{L}\p{N}_]+/gu) ?? []).length;
  if (genericSaasCopy.test(caption) || !productSpecific || hashtagCount > 2) throw new Error("invalid_instagram_copy_quality");
  const assetId = typeof payload.instagramAsset === "string" ? payload.instagramAsset.trim() : "";
  if (!Object.prototype.hasOwnProperty.call(INSTAGRAM_ASSET_CATALOG, assetId)) throw new Error("invalid_instagram_asset");
  const asset = INSTAGRAM_ASSET_CATALOG[assetId as InstagramAssetId];
  const imageUrl = new URL(asset.path, site);
  if (imageUrl.origin !== site.origin) throw new Error("invalid_instagram_asset");
  return { caption, assetId: assetId as InstagramAssetId, imageUrl: imageUrl.href };
}

function graphUrl(connector: InstagramConnector, path: string): URL {
  const url = new URL(`https://graph.instagram.com/${connector.apiVersion}/${path.replace(/^\/+/, "")}`);
  if (url.hostname !== "graph.instagram.com") throw new Error("invalid_instagram_endpoint");
  return url;
}

async function graphRequest(
  connector: InstagramConnector,
  path: string,
  init: { method?: "GET" | "POST"; body?: URLSearchParams } = {},
  fetcher: Fetcher = fetch,
): Promise<Record<string, unknown>> {
  const response = await fetcher(graphUrl(connector, path), {
    method: init.method ?? "GET",
    headers: { Authorization: `Bearer ${connector.accessToken}`, ...(init.body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
    body: init.body,
    signal: AbortSignal.timeout(10_000),
  });
  const body = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok) throw new Error(`instagram_provider_${response.status}`);
  if (!body || typeof body !== "object") throw new Error("invalid_instagram_response");
  return body;
}

function responseId(body: Record<string, unknown>): string {
  const id = typeof body.id === "string" ? body.id : "";
  if (!MEDIA_ID.test(id)) throw new Error("invalid_instagram_response");
  return id;
}

async function verifyInstagramAccount(connector: InstagramConnector, fetcher: Fetcher) {
  const body = await graphRequest(connector, `${connector.accountId}?fields=id,username`, {}, fetcher);
  const id = responseId(body);
  const username = typeof body.username === "string" ? body.username : "";
  if (id !== connector.accountId || username.toLowerCase() !== connector.expectedUsername.toLowerCase()) throw new Error("instagram_account_mismatch");
}

async function recentInstagramMedia(connector: InstagramConnector, fetcher: Fetcher): Promise<InstagramMedia[]> {
  const body = await graphRequest(connector, `${connector.accountId}/media?fields=id,caption,permalink,timestamp,media_type,media_product_type,like_count,comments_count&limit=25`, {}, fetcher);
  if (!Array.isArray(body.data)) throw new Error("invalid_instagram_response");
  return body.data.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const media = item as Record<string, unknown>;
    if (typeof media.id !== "string" || !MEDIA_ID.test(media.id)) return [];
    return [{
      id: media.id,
      caption: typeof media.caption === "string" ? media.caption : undefined,
      permalink: typeof media.permalink === "string" ? media.permalink : undefined,
      timestamp: typeof media.timestamp === "string" ? media.timestamp : undefined,
      mediaType: typeof media.media_type === "string" ? media.media_type : undefined,
      mediaProductType: typeof media.media_product_type === "string" ? media.media_product_type : undefined,
      likeCount: typeof media.like_count === "number" && Number.isFinite(media.like_count) ? media.like_count : undefined,
      commentsCount: typeof media.comments_count === "number" && Number.isFinite(media.comments_count) ? media.comments_count : undefined,
    }];
  });
}

function insightValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.value === "number" && Number.isFinite(record.value)) return record.value;
  return null;
}

function parseInsightMetrics(body: Record<string, unknown>): Record<string, number> {
  if (!Array.isArray(body.data)) throw new Error("invalid_instagram_response");
  const metrics: Record<string, number> = {};
  for (const item of body.data) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const name = typeof row.name === "string" ? row.name.trim() : "";
    if (!/^[a-z][a-z0-9_]{1,60}$/.test(name)) continue;
    const total = insightValue(row.total_value);
    const values = Array.isArray(row.values) ? row.values.map(insightValue).filter((entry): entry is number => entry !== null) : [];
    const value = total ?? values.at(-1) ?? null;
    if (value !== null) metrics[name] = value;
  }
  return metrics;
}

async function mediaMetadata(connector: InstagramConnector, mediaId: string, fetcher: Fetcher): Promise<InstagramMedia> {
  if (!MEDIA_ID.test(mediaId)) throw new Error("invalid_instagram_media_id");
  const body = await graphRequest(connector, `${mediaId}?fields=id,caption,permalink,timestamp,media_type,media_product_type,like_count,comments_count`, {}, fetcher);
  return {
    id: responseId(body),
    caption: typeof body.caption === "string" ? body.caption : undefined,
    permalink: typeof body.permalink === "string" ? body.permalink : undefined,
    timestamp: typeof body.timestamp === "string" ? body.timestamp : undefined,
    mediaType: typeof body.media_type === "string" ? body.media_type : undefined,
    mediaProductType: typeof body.media_product_type === "string" ? body.media_product_type : undefined,
    likeCount: typeof body.like_count === "number" && Number.isFinite(body.like_count) ? body.like_count : undefined,
    commentsCount: typeof body.comments_count === "number" && Number.isFinite(body.comments_count) ? body.comments_count : undefined,
  };
}

const INSIGHT_METRICS = ["views", "reach", "saved", "shares", "total_interactions"] as const;

async function mediaInsightMetrics(connector: InstagramConnector, mediaId: string, fetcher: Fetcher): Promise<Record<string, number>> {
  const grouped = await graphRequest(connector, `${mediaId}/insights?metric=${INSIGHT_METRICS.join(",")}`, {}, fetcher)
    .then(parseInsightMetrics)
    .catch(() => null);
  if (grouped) return grouped;
  const attempts = await Promise.all(INSIGHT_METRICS.map(async (metric) => {
    const body = await graphRequest(connector, `${mediaId}/insights?metric=${metric}`, {}, fetcher).catch(() => null);
    return body ? parseInsightMetrics(body) : {};
  }));
  return Object.assign({}, ...attempts);
}

/**
 * Reads only media owned by the configured account. Insight requests first use
 * the current common metric set, then fall back per metric because Meta's
 * supported matrix differs between images, carousels and reels.
 */
export async function collectInstagramMediaInsights(input: {
  connector: InstagramConnector;
  mediaIds: string[];
  observedAt?: Date;
  fetcher?: Fetcher;
}): Promise<InstagramMediaInsight[]> {
  const fetcher = input.fetcher ?? fetch;
  const mediaIds = [...new Set(input.mediaIds.filter((id) => MEDIA_ID.test(id)))].slice(0, 25);
  if (!mediaIds.length) return [];
  await verifyInstagramAccount(input.connector, fetcher);
  const observedAt = (input.observedAt ?? new Date()).toISOString();
  return Promise.all(mediaIds.map(async (mediaId) => {
    const [media, metrics] = await Promise.all([
      mediaMetadata(input.connector, mediaId, fetcher),
      mediaInsightMetrics(input.connector, mediaId, fetcher),
    ]);
    if (media.likeCount !== undefined) metrics.likes = media.likeCount;
    if (media.commentsCount !== undefined) metrics.comments = media.commentsCount;
    return { ...media, metrics, observedAt };
  }));
}

async function createImageContainer(connector: InstagramConnector, imageUrl: string, caption: string, fetcher: Fetcher) {
  const body = new URLSearchParams({ image_url: imageUrl, caption });
  return responseId(await graphRequest(connector, `${connector.accountId}/media`, { method: "POST", body }, fetcher));
}

async function waitForContainer(connector: InstagramConnector, containerId: string, fetcher: Fetcher, delay: (ms: number) => Promise<void>) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const body = await graphRequest(connector, `${containerId}?fields=status_code,status`, {}, fetcher);
    const status = typeof body.status_code === "string" ? body.status_code.toUpperCase() : "";
    if (["FINISHED", "PUBLISHED"].includes(status)) return;
    if (["ERROR", "EXPIRED"].includes(status)) throw new Error(`instagram_container_${status.toLowerCase()}`);
    if (attempt < 3) await delay(750 * (attempt + 1));
  }
  throw new Error("instagram_container_timeout");
}

async function publishContainer(connector: InstagramConnector, containerId: string, fetcher: Fetcher) {
  const body = new URLSearchParams({ creation_id: containerId });
  return responseId(await graphRequest(connector, `${connector.accountId}/media_publish`, { method: "POST", body }, fetcher));
}

async function publishedMedia(connector: InstagramConnector, mediaId: string, fetcher: Fetcher): Promise<InstagramMedia> {
  const body = await graphRequest(connector, `${mediaId}?fields=id,caption,permalink,timestamp`, {}, fetcher);
  return {
    id: responseId(body),
    caption: typeof body.caption === "string" ? body.caption : undefined,
    permalink: typeof body.permalink === "string" ? body.permalink : undefined,
    timestamp: typeof body.timestamp === "string" ? body.timestamp : undefined,
  };
}

export async function publishInstagramImage(input: {
  connector: InstagramConnector;
  caption: string;
  imageUrl: string;
  existingContainerId?: string | null;
  onContainerCreated?: (containerId: string) => Promise<void>;
  fetcher?: Fetcher;
  delay?: (ms: number) => Promise<void>;
}) {
  const fetcher = input.fetcher ?? fetch;
  const delay = input.delay ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  await verifyInstagramAccount(input.connector, fetcher);
  const existing = (await recentInstagramMedia(input.connector, fetcher)).find((media) => media.caption === input.caption);
  if (existing) return { mediaId: existing.id, permalink: existing.permalink ?? null, containerId: input.existingContainerId ?? null, recovered: true };
  let containerId = input.existingContainerId && MEDIA_ID.test(input.existingContainerId) ? input.existingContainerId : null;
  if (!containerId) {
    containerId = await createImageContainer(input.connector, input.imageUrl, input.caption, fetcher);
    await input.onContainerCreated?.(containerId);
  }
  await waitForContainer(input.connector, containerId, fetcher, delay);
  let mediaId: string;
  try {
    mediaId = await publishContainer(input.connector, containerId, fetcher);
  } catch (error) {
    const recovered = (await recentInstagramMedia(input.connector, fetcher)).find((media) => media.caption === input.caption);
    if (!recovered) throw error;
    return { mediaId: recovered.id, permalink: recovered.permalink ?? null, containerId, recovered: true };
  }
  const media: InstagramMedia = await publishedMedia(input.connector, mediaId, fetcher).catch(() => ({ id: mediaId }));
  return { mediaId, permalink: media.permalink ?? null, containerId, recovered: false };
}
