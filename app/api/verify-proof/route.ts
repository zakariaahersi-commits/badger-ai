import { NextRequest, NextResponse } from "next/server";
import { lookup } from "node:dns/promises";
import { deepseekKey } from "@/lib/coach";
import { recordAiUsage } from "@/lib/ai-usage";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { serverAuth } from "@/lib/server-auth";
import { paidAccessState } from "@/lib/paid-access";
import { deepSeekCompletion, DeepSeekCompletionError } from "@/lib/deepseek-client";

// Bo's eyes. Fetches a public proof URL (a post, a page, a listing) and has
// the model judge whether it matches what the founder claims they did.
// Login-walled pages (most DMs, some socials) come back "unreachable" and the
// client falls back to trusting the text, so this only ever adds signal.

export const runtime = "nodejs";
export const maxDuration = 60;

const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash";

// Reject anything that could point at internal infrastructure.
function isForbiddenHost(host: string): boolean {
  const h = host.toLowerCase();
  return (
    h === "localhost" ||
    h.endsWith(".local") ||
    h.endsWith(".internal") ||
    /^127\./.test(h) ||
    /^10\./.test(h) ||
    /^192\.168\./.test(h) ||
    /^169\.254\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
    /^0\./.test(h) ||
    /^100\.(6[4-9]|[789]\d|1[01]\d|12[0-7])\./.test(h) ||
    /^198\.1[89]\./.test(h) ||
    /^224\./.test(h) ||
    /^24[0-9]\./.test(h) ||
    /^25[0-5]\./.test(h) ||
    /^\[?::1\]?$/.test(h) ||
    /^\[?f[cd]/i.test(h) ||
    /^\[?fe80/i.test(h)
  );
}

async function isPublicTarget(url: URL): Promise<boolean> {
  if (!/^https?:$/.test(url.protocol) || isForbiddenHost(url.hostname) || url.username || url.password) return false;
  try {
    const addresses = await lookup(url.hostname, { all: true, verbatim: true });
    return addresses.length > 0 && addresses.every(({ address }) => !isForbiddenHost(address.replace(/^::ffff:/i, "")));
  } catch {
    return false;
  }
}

async function readLimitedText(res: Response, limit: number): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < limit) {
    const { done, value } = await reader.read();
    if (done) break;
    const remaining = limit - size;
    const chunk = value.byteLength > remaining ? value.slice(0, remaining) : value;
    chunks.push(chunk);
    size += chunk.byteLength;
    if (size >= limit) await reader.cancel();
  }
  const merged = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(merged);
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function POST(req: NextRequest) {
  if (!rateLimit(`verify:${clientIp(req)}`, 10, 60_000)) {
    return NextResponse.json({ error: "rate limited" }, { status: 429 });
  }
  const body = await req.json().catch(() => null);
  const auth = await serverAuth(req);
  if (auth.invalid || !auth.userId || !auth.service) {
    return NextResponse.json({ error: "authentication required" }, { status: 401 });
  }
  const access = await paidAccessState(auth);
  if (access === "unavailable") return NextResponse.json({ error: "access check unavailable" }, { status: 503 });
  if (access !== "active") return NextResponse.json({ error: "payment required" }, { status: 402 });
  const url = typeof body?.url === "string" ? body.url.trim() : "";
  const taskTitle = typeof body?.taskTitle === "string" ? body.taskTitle.slice(0, 200) : "";
  const claim = typeof body?.claim === "string" ? body.claim.slice(0, 500) : "";
  const day = Math.max(1, Math.min(28, Number(body?.day) || 1));
  const claimType = ["validate", "build", "market", "revenue", "reflection", "call", "kill"].includes(body?.claimType) ? body.claimType : "build";

  const record = async (verdict: string, note: string, status: string) => {
    const { error } = await auth.service!.from("evidence_records").insert({
      user_id: auth.userId,
      day_num: day,
      claim_type: claimType,
      source_type: "public_url",
      status,
      claim_summary: claim || taskTitle || "Submitted proof link",
      source_url: url.slice(0, 2_000),
      verifier: "public_page_content",
      verdict_note: note || `Public link result: ${verdict}.`,
      occurred_at: new Date().toISOString(),
      metadata: { verdict, taskTitle },
    });
    if (error) console.warn("[verify-proof] evidence record unavailable", error.code ?? "database_error");
  };

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ reachable: false, verdict: "invalid", note: "" });
  }
  if (!(await isPublicTarget(parsed))) {
    return NextResponse.json({ reachable: false, verdict: "invalid", note: "" });
  }

  // Fetch the public page. Many socials are login-walled; that's fine.
  let pageText = "";
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      let current = parsed;
      let res: Response | null = null;
      for (let redirects = 0; redirects <= 3; redirects++) {
        if (!(await isPublicTarget(current))) return NextResponse.json({ reachable: false, verdict: "invalid", note: "" });
        res = await fetch(current.href, {
          signal: controller.signal,
          redirect: "manual",
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; BadgerAIProofCheck/1.0)",
            Accept: "text/html,application/xhtml+xml,text/plain",
          },
        });
        if (![301, 302, 303, 307, 308].includes(res.status)) break;
        const location = res.headers.get("location");
        if (!location || redirects === 3) return NextResponse.json({ reachable: false, verdict: "unreachable", note: "" });
        current = new URL(location, current);
        res = null;
      }
      if (!res) return NextResponse.json({ reachable: false, verdict: "unreachable", note: "" });
      if (!res.ok) {
        return NextResponse.json({ reachable: false, verdict: "unreachable", note: "" });
      }
      const contentType = res.headers.get("content-type")?.toLowerCase() ?? "";
      if (contentType && !contentType.includes("text/html") && !contentType.includes("text/plain") && !contentType.includes("application/xhtml+xml")) {
        return NextResponse.json({ reachable: false, verdict: "invalid", note: "" });
      }
      const raw = await readLimitedText(res, 120_000);
      pageText = stripHtml(raw).slice(0, 4000);
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return NextResponse.json({ reachable: false, verdict: "unreachable", note: "" });
  }
  if (!pageText) {
    return NextResponse.json({ reachable: false, verdict: "unreachable", note: "" });
  }

  const { key } = deepseekKey();
  if (!key) {
    // No AI available: we can at least confirm the link exists and is public.
    await record("unverified", "The link is public, but its content was not checked.", "submitted");
    return NextResponse.json({ reachable: true, verdict: "unverified", note: "" });
  }

  const aiStarted = Date.now();
  let promptTokens = 0;
  let completionTokens = 0;
  let aiSuccess = false;
  let errorCode: string | null = null;
  let attempts = 0;
  try {
    const completion = await deepSeekCompletion({
      apiKey: key,
      model: DEEPSEEK_MODEL,
      messages: [
        {
          role: "system",
          content: `You verify a founder's proof-of-work. Given a task, the founder's claim, and the text content of the URL they submitted as proof, judge whether the page plausibly supports the claim. Respond with ONLY compact JSON: {"verdict":"solid"|"thin"|"mismatch","note":"<one sharp sentence a coach could say about this proof, plain language, no jargon>"}. "solid" = page clearly supports the claim. "thin" = related but weak (e.g. a post with no ask, a page without the promised thing). "mismatch" = page has nothing to do with the claim.`,
        },
        {
          role: "user",
          content: `Task: ${taskTitle || "(unknown)"}\nClaim: ${claim || "(none given)"}\nPage content:\n${pageText}`,
        },
      ],
      maxTokens: 768,
      timeoutMs: 20_000,
      attempts: 2,
      temperature: 0.3,
      json: true,
      validate: (text) => {
        const start = text.indexOf("{");
        const end = text.lastIndexOf("}");
        if (start < 0 || end <= start) return false;
        try {
          const parsed = JSON.parse(text.slice(start, end + 1));
          return ["solid", "thin", "mismatch"].includes(parsed?.verdict) && typeof parsed?.note === "string";
        } catch {
          return false;
        }
      },
    });
    promptTokens = completion.promptTokens;
    completionTokens = completion.completionTokens;
    attempts = completion.attempts;
    const text = completion.text;
    const s = text.indexOf("{");
    const e = text.lastIndexOf("}");
    if (s !== -1 && e !== -1) {
      const out = JSON.parse(text.slice(s, e + 1));
      const verdict = ["solid", "thin", "mismatch"].includes(out.verdict) ? out.verdict : "unverified";
      const note = typeof out.note === "string" ? out.note.slice(0, 240) : "";
      aiSuccess = true;
      console.log(`[verify-proof] ${parsed.hostname} -> ${verdict}`);
      await record(verdict, note, verdict === "mismatch" ? "rejected" : "checked");
      return NextResponse.json({ reachable: true, verdict, note });
    }
  } catch (e) {
    if (e instanceof DeepSeekCompletionError) {
      promptTokens = e.promptTokens;
      completionTokens = e.completionTokens;
      attempts = e.attempts;
      errorCode = e.code;
    } else {
      errorCode = "request_failed";
    }
    console.error(`[verify-proof] judge threw: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    await recordAiUsage({
      feature: "proof_check",
      provider: "deepseek",
      model: DEEPSEEK_MODEL,
      userId: auth.userId,
      promptTokens,
      completionTokens,
      latencyMs: Date.now() - aiStarted,
      success: aiSuccess,
      errorCode,
      metadata: { day, claim_type: claimType, attempts },
      service: auth.service,
    });
  }
  return NextResponse.json({ reachable: true, verdict: "unverified", note: "" });
}
