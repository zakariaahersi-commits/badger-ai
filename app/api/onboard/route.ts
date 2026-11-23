import { NextRequest, NextResponse } from "next/server";
import { deepseekKey } from "@/lib/coach";
import { recordAiUsage } from "@/lib/ai-usage";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { deepSeekCompletion, DeepSeekCompletionError } from "@/lib/deepseek-client";

// Dynamic onboarding interview. Bo asks ONE adaptive question at a time,
// building on the founder's last answer (DeepSeek). Returns the next question
// + which profile field it collects, or done=true when it has enough. Falls
// back to a fixed per-track script when the AI is unavailable, so onboarding
// never dead-ends.

export const runtime = "nodejs";
export const maxDuration = 60;

const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash";

const FIELDS = ["idea", "whoFor", "stage", "audience", "skills", "interests", "problemsNoticed", "builtWhat", "triedSelling", "experience"];

// Scripted fallback — mirrors the old fixed funnel, used only without AI.
const SCRIPT: Record<string, { q: string; field: string }[]> = {
  A: [
    { q: "What are you good at, or known for?", field: "skills" },
    { q: "What could you happily talk about for an hour?", field: "interests" },
    { q: "What annoys you, or the people around you?", field: "problemsNoticed" },
    { q: "Who could you easily reach ten of?", field: "audience" },
  ],
  B: [
    { q: "Tell me the idea you keep coming back to.", field: "idea" },
    { q: "Who is it for?", field: "whoFor" },
    { q: "How far have you taken it so far?", field: "stage" },
    { q: "Could you reach a few of those people this week?", field: "audience" },
  ],
  C: [
    { q: "What did you build?", field: "builtWhat" },
    { q: "Who is it meant for?", field: "whoFor" },
    { q: "Where's it at right now?", field: "stage" },
    { q: "What have you tried to get customers?", field: "triedSelling" },
  ],
};

interface Turn { from: "bo" | "me"; text: string }

function safeText(value: unknown, max = 1_500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function safeHistory(value: unknown): Turn[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(-10)
    .filter((turn): turn is Record<string, unknown> => Boolean(turn) && typeof turn === "object")
    .map((turn) => ({
      from: turn.from === "bo" ? ("bo" as const) : ("me" as const),
      text: safeText(turn.text),
    }))
    .filter((turn) => turn.text.length > 0);
}

export async function POST(req: NextRequest) {
  if (!rateLimit(`onboard:${clientIp(req)}`, 20, 60_000)) {
    // Over the limit -> end the interview gracefully with what we have.
    return NextResponse.json({ done: true, source: "ratelimit" }, { status: 429 });
  }
  const body = await req.json().catch(() => null);
  const track = (typeof body?.track === "string" && SCRIPT[body.track] ? body.track : "B") as keyof typeof SCRIPT;
  const name = safeText(body?.name, 80);
  const history = safeHistory(body?.history);
  const script = SCRIPT[track];
  const answered = history.filter((h) => h.from === "me").length;

  const { key } = deepseekKey();
  if (key) {
    const aiStarted = Date.now();
    let promptTokens = 0;
    let completionTokens = 0;
    let aiSuccess = false;
    let errorCode: string | null = null;
    let attempts = 0;
    try {
      const wants =
        track === "A" ? "skills, interests, problemsNoticed, audience" :
        track === "C" ? "builtWhat, whoFor, stage, triedSelling" :
        "idea, whoFor, stage, audience";
      const situation =
        track === "A" ? "they have NO idea yet, you're helping them find one" :
        track === "C" ? "they built something but have no customers" :
        "they have an idea but feel stuck and haven't tested it";

      const system = `You are Bo, a warm, sharp startup co-founder onboarding a first-time founder named ${name || "the founder"}. Their situation: ${situation}.

Ask exactly ONE short question at a time (one sentence, plain language, no jargon, no banned words like pivot/MVP/traction). ALWAYS build on what they just said, reference it. Never repeat a question. Be human and specific, like a real co-founder who's curious about them.

You are gathering these facts: ${wants}. Pick the most useful one to ask about next based on the conversation. After they've answered about 4 questions, you have enough, set done=true.

Respond with ONLY compact JSON, nothing else:
{"done": false, "question": "<your next question>", "field": "<the profile field this answer maps to, one of: ${wants}>"}
or when finished:
{"done": true}`;

      const messages = [
        { role: "system" as const, content: system },
        ...history.map((h) => ({ role: h.from === "bo" ? ("assistant" as const) : ("user" as const), content: h.text })),
        { role: "user" as const, content: answered >= 4 ? "I've answered enough. Return {\"done\": true}." : "Ask the next question as JSON." },
      ];

      const completion = await deepSeekCompletion({
        apiKey: key,
        model: DEEPSEEK_MODEL,
        messages,
        maxTokens: 768,
        timeoutMs: 25_000,
        attempts: 2,
        temperature: 0.5,
        json: true,
        validate: (text) => {
          const start = text.indexOf("{");
          const end = text.lastIndexOf("}");
          if (start < 0 || end <= start) return false;
          try {
            const parsed = JSON.parse(text.slice(start, end + 1));
            return parsed?.done === true || (typeof parsed?.question === "string" && parsed.question.trim().length > 0);
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
        const parsed = JSON.parse(text.slice(s, e + 1));
        if (parsed.done) {
          aiSuccess = true;
          return NextResponse.json({ done: true, source: "ai" });
        }
        if (typeof parsed.question === "string" && parsed.question.trim()) {
          const field = FIELDS.includes(parsed.field) ? parsed.field : script[Math.min(answered, script.length - 1)].field;
          aiSuccess = true;
          return NextResponse.json({ done: false, question: parsed.question.trim().slice(0, 200), field, source: "ai" });
        }
      }
    } catch (err) {
      if (err instanceof DeepSeekCompletionError) {
        promptTokens = err.promptTokens;
        completionTokens = err.completionTokens;
        attempts = err.attempts;
        errorCode = err.code;
      } else {
        errorCode = "request_failed";
      }
      console.error(`[onboard] threw: ${err instanceof Error ? err.message : String(err)}`);
      // fall through to scripted
    } finally {
      await recordAiUsage({
        feature: "onboarding_interview",
        provider: "deepseek",
        model: DEEPSEEK_MODEL,
        promptTokens,
        completionTokens,
        latencyMs: Date.now() - aiStarted,
        success: aiSuccess,
        errorCode,
        metadata: { track, attempts },
      });
    }
  }

  if (answered >= script.length) return NextResponse.json({ done: true, source: "fallback" });
  const next = script[answered];
  return NextResponse.json({ done: false, question: next.q, field: next.field, source: "fallback" });
}
