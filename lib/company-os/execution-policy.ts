const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const SOCIAL_LIMITS = { x: 280, linkedin: 3000, instagram: 2200, threads: 500, tiktok: 2200 } as const;
export type SocialChannel = keyof typeof SOCIAL_LIMITS;

const PREPARED_SOCIAL_CHANNELS = new Set<SocialChannel>(["x", "tiktok"]);
const UGC_FORMATS = ["founder_to_camera", "ai_founder_avatar", "bo_animation", "screen_demo"] as const;
export type UgcFormat = typeof UGC_FORMATS[number];
export type PreparedUgcScene = { visual: string; onScreenText: string; voiceover: string };
export type PreparedSocialContent = {
  posts: { x: string; tiktok: string };
  ugc: {
    platform: "tiktok";
    format: UgcFormat;
    disclosure: string | null;
    hook: string;
    durationSeconds: number;
    script: string;
    scenes: PreparedUgcScene[];
    cta: string;
  };
};

function requiredText(value: unknown, max: number, label: string): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw new Error(`invalid_${label}`);
  return value.trim();
}

export function normalizeCompanyEmail(payload: Record<string, unknown>) {
  const userRef = requiredText(payload.userRef, 36, "user_ref");
  if (!UUID.test(userRef)) throw new Error("invalid_user_ref");
  const subject = requiredText(payload.subject, 160, "subject");
  const content = requiredText(payload.content, 3000, "content");
  const toneDeaf = /you(?:'ve| have) been (?:quiet|inactive)|we noticed you (?:haven't|have not)|what(?:'s| is) actually blocking you|no excuses|stop procrastinating|this is a pattern/i;
  if (toneDeaf.test(`${subject}\n${content}`)) throw new Error("invalid_customer_tone");
  return { userRef, subject, content };
}

export function normalizeCompanyInboxReply(payload: Record<string, unknown>) {
  const inboxId = requiredText(payload.inboxId, 240, "inbox_id");
  const messageId = requiredText(payload.messageId, 240, "message_id");
  const threadId = requiredText(payload.threadId, 240, "thread_id");
  const recipientEmail = requiredText(payload.recipientEmail, 320, "recipient_email").toLowerCase();
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(recipientEmail)) throw new Error("invalid_recipient_email");
  const subject = requiredText(payload.subject, 500, "subject");
  const content = requiredText(payload.content, 3000, "content");
  return { inboxId, messageId, threadId, recipientEmail, subject, content };
}

export function normalizeSocialPosts(payload: Record<string, unknown>): Partial<Record<SocialChannel, string>> {
  const raw = payload.posts;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("invalid_social_posts");
  const suppliedChannels = Object.keys(raw);
  if (suppliedChannels.some((channel) => !Object.prototype.hasOwnProperty.call(SOCIAL_LIMITS, channel))) throw new Error("invalid_social_posts");
  const posts: Partial<Record<SocialChannel, string>> = {};
  for (const channel of Object.keys(SOCIAL_LIMITS) as SocialChannel[]) {
    const value = (raw as Record<string, unknown>)[channel];
    if (value === undefined) continue;
    posts[channel] = requiredText(value, SOCIAL_LIMITS[channel], `${channel}_post`);
  }
  if (!Object.keys(posts).length) throw new Error("invalid_social_posts");
  return posts;
}

function assertPublicCopyQuality(value: string, label: string) {
  const genericSaasCopy = /most founders don['’]t need|game[ -]?changer|unlock your|supercharge|revolutioni[sz]e|are you ready|prove to yourself|first step is waiting|doesn['’]t let you coast|evidence,? not promises|no vague motivation|not another tool|(?:🚀|🔥|✨)/i;
  const productSpecific = /\bbo\b/i.test(value) && /\b(task|plan|proof|evidence|follow(?:s|ed|ing)? up|check[ -]?in|next move)\b/i.test(value);
  const hashtagCount = (value.match(/#[\p{L}\p{N}_]+/gu) ?? []).length;
  if (genericSaasCopy.test(value) || !productSpecific || hashtagCount > 2) throw new Error(`invalid_${label}_quality`);
}

export function normalizePreparedSocialContent(payload: Record<string, unknown>): PreparedSocialContent {
  const posts = normalizeSocialPosts(payload);
  const channels = Object.keys(posts) as SocialChannel[];
  if (channels.length !== 2 || channels.some((channel) => !PREPARED_SOCIAL_CHANNELS.has(channel)) || !posts.x || !posts.tiktok) {
    throw new Error("invalid_prepared_social_posts");
  }
  assertPublicCopyQuality(posts.x, "x_copy");
  assertPublicCopyQuality(posts.tiktok, "tiktok_copy");

  const rawUgc = payload.ugc;
  if (!rawUgc || typeof rawUgc !== "object" || Array.isArray(rawUgc)) throw new Error("invalid_ugc_brief");
  const ugc = rawUgc as Record<string, unknown>;
  if (ugc.platform !== "tiktok" || !UGC_FORMATS.includes(ugc.format as UgcFormat)) throw new Error("invalid_ugc_brief");
  const format = ugc.format as UgcFormat;
  const disclosure = format === "ai_founder_avatar"
    ? requiredText(ugc.disclosure, 80, "ugc_disclosure")
    : typeof ugc.disclosure === "string" && ugc.disclosure.trim()
      ? requiredText(ugc.disclosure, 80, "ugc_disclosure")
      : null;
  if (format === "ai_founder_avatar" && (!disclosure || disclosure.toLowerCase() !== "ai-generated presenter")) throw new Error("invalid_ugc_disclosure");
  const durationSeconds = Number(ugc.durationSeconds);
  if (!Number.isInteger(durationSeconds) || durationSeconds < 15 || durationSeconds > 60) throw new Error("invalid_ugc_duration");
  if (!Array.isArray(ugc.scenes) || ugc.scenes.length < 3 || ugc.scenes.length > 8) throw new Error("invalid_ugc_scenes");
  const scenes = ugc.scenes.map((item): PreparedUgcScene => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("invalid_ugc_scene");
    const scene = item as Record<string, unknown>;
    return {
      visual: requiredText(scene.visual, 220, "ugc_visual"),
      onScreenText: requiredText(scene.onScreenText, 140, "ugc_on_screen_text"),
      voiceover: requiredText(scene.voiceover, 420, "ugc_voiceover"),
    };
  });
  const hook = requiredText(ugc.hook, 180, "ugc_hook");
  const script = requiredText(ugc.script, 1800, "ugc_script");
  const cta = requiredText(ugc.cta, 180, "ugc_cta");
  assertPublicCopyQuality(`${hook}\n${script}\n${cta}`, "ugc_script");
  return { posts: { x: posts.x, tiktok: posts.tiktok }, ugc: { platform: "tiktok", format, disclosure, hook, durationSeconds, script, scenes, cta } };
}

function boundedTrackedPost(value: string, trackingUrl: string, max: number): string {
  const withoutOldStartLinks = value.replace(/https:\/\/badger\.example\.com\/start\?[^\s<>'"]+/gi, "").trim();
  const available = Math.max(0, max - trackingUrl.length - 2);
  const body = withoutOldStartLinks.slice(0, available).trimEnd();
  return body ? `${body}\n\n${trackingUrl}` : trackingUrl;
}

export function withPreparedSocialTracking(payload: Record<string, unknown>, trackingUrl: string | null): PreparedSocialContent {
  const prepared = normalizePreparedSocialContent(payload);
  if (!trackingUrl) return prepared;
  let target: URL;
  try { target = new URL(trackingUrl); } catch { return prepared; }
  if (target.protocol !== "https:" || target.hostname !== "badger.example.com" || target.pathname !== "/start" || target.username || target.password) return prepared;
  return {
    ...prepared,
    posts: {
      x: boundedTrackedPost(prepared.posts.x, target.toString(), SOCIAL_LIMITS.x),
      tiktok: boundedTrackedPost(prepared.posts.tiktok, target.toString(), SOCIAL_LIMITS.tiktok),
    },
  };
}

export function normalizeEngineeringJob(payload: Record<string, unknown>) {
  const evidence = payload.evidence;
  const acceptance = payload.acceptanceCriteria;
  if (!Array.isArray(evidence) || !Array.isArray(acceptance)) throw new Error("invalid_engineering_job");
  const cleanedEvidence = evidence.map((item) => requiredText(item, 500, "engineering_evidence")).slice(0, 8);
  const cleanedAcceptance = acceptance.map((item) => requiredText(item, 300, "acceptance_criterion")).slice(0, 8);
  if (!cleanedEvidence.length || !cleanedAcceptance.length) throw new Error("invalid_engineering_job");
  return {
    title: requiredText(payload.title, 180, "engineering_title"),
    problem: requiredText(payload.problem, 2000, "engineering_problem"),
    evidence: cleanedEvidence,
    acceptanceCriteria: cleanedAcceptance,
  };
}

export function safeCompanyWebhook(value: string | undefined): URL | null {
  try {
    if (!value) return null;
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const privateIpv4 = /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
    const privateIpv6 = host === "[::1]" || host === "::1" || /^\[?(fc|fd|fe80):/i.test(host);
    if (url.protocol !== "https:" || url.username || url.password || host === "localhost" || host.endsWith(".local") || privateIpv4 || privateIpv6) return null;
    return url;
  } catch { return null; }
}
