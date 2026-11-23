import { after, NextRequest, NextResponse } from "next/server";
import { deepseekKey } from "@/lib/coach";
import { recordAiUsage } from "@/lib/ai-usage";
import { classifyCoachSafety } from "@/lib/coach-policy";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { deepSeekCompletion, DeepSeekCompletionError } from "@/lib/deepseek-client";

export const runtime = "nodejs";
export const maxDuration = 60;

const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash";

const DEMO_SYSTEM_PROMPT = `You are Bo, a direct but warm AI coach, practical co-founder and accountability partner for people trying to launch in 28 days.

The visitor gives you a rough business idea. Create a small but impressive founder brief that proves you understood their words and can help with real work.

Rules:
- Simple global English. No startup jargon, US idioms or em dashes.
- Do not praise the idea or promise it will work.
- Never invent facts, people, market evidence or customer demand.
- Find the most important untested assumption.
- Draft a natural message the visitor could send to a possible customer today. It must ask about the person's real behaviour, not pitch or sell.
- Set one small action and exact proof to bring back.
- Be specific to their words. Do not sound like a generic chatbot.

Return only JSON:
{
  "summary": "clean restatement of what they may be trying to build and for whom, max 32 words",
  "focus": "the honest risk or assumption to test first, max 28 words",
  "draft": "a ready-to-send customer message, max 45 words",
  "action": "one action for today, max 18 words",
  "proof": "the exact evidence Bo expects, max 14 words",
  "minutes": 10, 15 or 20
}`;

function fallback(message: string) {
  const text = message.toLowerCase();
  const built = text.includes("built") || text.includes("app") || text.includes("product");
  return {
    summary: built
      ? "You have moved beyond the idea. The next question is whether a specific person cares enough to use what you built."
      : "Your idea is still broad. The fastest progress will come from one real conversation, not more private planning.",
    focus: built
      ? "The risk is not whether you can add more. It is whether the current version solves a problem someone feels today."
      : "Do not improve the solution yet. Learn how the problem appears in someone’s real day.",
    draft: "I am exploring a better way to solve this problem. When did it last happen to you, and what did you do?",
    action: "Send this message to one person who may have the problem.",
    proof: "Bring back one reply in their own words.",
    minutes: 15,
  };
}

function safeText(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function parseBrief(rawValue: unknown) {
  const raw = safeText(rawValue, 4_000).replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const parsed = JSON.parse(raw);
  const summary = safeText(parsed?.summary, 320);
  const focus = safeText(parsed?.focus, 280);
  const draft = safeText(parsed?.draft, 420);
  const action = safeText(parsed?.action, 160);
  const proof = safeText(parsed?.proof, 180);
  const minutes = [10, 15, 20].includes(Number(parsed?.minutes)) ? Number(parsed.minutes) : 15;
  if (!summary || !focus || !draft || !action || !proof) throw new Error("invalid_response");
  return { summary, focus, draft, action, proof, minutes };
}

export async function POST(req: NextRequest) {
  if (!rateLimit(`landing-demo:${clientIp(req)}`, 6, 10 * 60_000)) {
    return NextResponse.json({ error: "demo limit reached" }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const message = safeText(body?.message, 420);
  if (!message) return NextResponse.json({ error: "message required" }, { status: 400 });

  if (classifyCoachSafety(message) !== "none") {
    return NextResponse.json({ ...fallback(message), source: "guided" });
  }

  const deterministic = fallback(message);
  const { key } = deepseekKey();
  let provider = "deepseek";
  let model = DEEPSEEK_MODEL;
  if (!key) return NextResponse.json({ ...deterministic, source: "guided" });

  const aiStarted = Date.now();
  let promptTokens = 0;
  let completionTokens = 0;
  let aiSuccess = false;
  let errorCode: string | null = null;
  let attempts = 0;
  try {
    const completion = await deepSeekCompletion({
      apiKey: key,
      model,
      messages: [{ role: "system", content: DEMO_SYSTEM_PROMPT }, { role: "user", content: message }],
      maxTokens: 1_024,
      timeoutMs: 20_000,
      attempts: 2,
      temperature: 0.25,
      json: true,
      validate: (text) => {
        try {
          parseBrief(text);
          return true;
        } catch {
          return false;
        }
      },
    });
    promptTokens = completion.promptTokens;
    completionTokens = completion.completionTokens;
    attempts = completion.attempts;
    model = completion.model;
    provider = completion.model.includes("/") ? "vercel-ai-gateway" : "deepseek";
    const brief = parseBrief(completion.text);
    aiSuccess = true;
    return NextResponse.json({ ...brief, source: "ai" });
  } catch (error) {
    if (error instanceof DeepSeekCompletionError) {
      promptTokens = error.promptTokens;
      completionTokens = error.completionTokens;
      attempts = error.attempts;
      errorCode = error.code;
    } else {
      const reason = error instanceof Error ? error.message : "request_failed";
      errorCode = error instanceof Error && error.name === "AbortError"
        ? "timeout"
        : /^(provider_\d{3}|invalid_response)$/.test(reason) ? reason : "request_failed";
    }
    console.warn(`[demo] live brief unavailable provider=${provider} reason=${errorCode}`);
    return NextResponse.json({ ...deterministic, source: "guided" });
  } finally {
    after(() => recordAiUsage({
        feature: "landing_demo",
        provider,
        model,
        promptTokens,
        completionTokens,
        latencyMs: Date.now() - aiStarted,
        success: aiSuccess,
        errorCode,
        metadata: { attempts },
      }));
  }
}
