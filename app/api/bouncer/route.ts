import { NextRequest, NextResponse } from "next/server";
import { deepseekKey } from "@/lib/coach";
import { recordAiUsage } from "@/lib/ai-usage";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { deepSeekCompletion, DeepSeekCompletionError } from "@/lib/deepseek-client";

// The bouncer gate — the last step of onboarding. Bo doesn't take everyone:
// you have to convince him your idea deserves its 28 days. He challenges,
// you answer, he pushes back once if the answer is soft, then lets you in.
// Nobody is truly rejected (after 2 real answers you're in), but the ritual
// filters for commitment and extracts the "why" Bo will use on your worst
// days. Falls back to a scripted challenge when the AI is unavailable.

export const runtime = "nodejs";
export const maxDuration = 60;

const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash";

interface Turn {
  from: "bo" | "me";
  text: string;
}

function safeText(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function safeHistory(value: unknown): Turn[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(-8)
    .filter((turn): turn is Record<string, unknown> => Boolean(turn) && typeof turn === "object")
    .map((turn) => ({
      from: turn.from === "bo" ? ("bo" as const) : ("me" as const),
      text: safeText(turn.text),
    }))
    .filter((turn) => turn.text.length > 0);
}

export async function POST(req: NextRequest) {
  if (!rateLimit(`bouncer:${clientIp(req)}`, 20, 60_000)) {
    // Over the limit: let them in with what they've said. The gate is a
    // ritual, not a wall.
    return NextResponse.json({ in: true, line: "Alright. You're in. Let's build.", source: "ratelimit" });
  }
  const body = await req.json().catch(() => null);
  const name = safeText(body?.name, 80);
  const idea = safeText(body?.idea, 300);
  const track = body?.track === "A" || body?.track === "C" ? body.track : "B";
  const fear = safeText(body?.fear, 200);
  const goal = safeText(body?.goal, 300);
  const history = safeHistory(body?.history);
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
      const situation =
        track === "A"
          ? "they don't have an idea yet; Bo will help them find one, so the challenge is about THEM: why now, and why should Bo believe they'll show up"
          : track === "C"
            ? `they built something ("${idea}") but have no customers; the challenge is why THIS time they'll sell instead of build`
            : `their idea: "${idea}"; the challenge is why this idea, and why now, after carrying it so long`;

      const system = `You are Bo, a sharp, warm co-founder who does NOT take everyone. ${name || "A founder"} wants you to commit the next 28 days to them. Their situation: ${situation}.${fear ? ` Their stated fear: "${fear}".` : ""}${goal ? ` What a win means to them: "${goal}".` : ""}

You are the bouncer at the door. Rules:
- Speak in 1-2 short sentences, plain language, no jargon (never: pivot, MVP, traction, leverage).
- First message: one pointed challenge that makes them justify why this deserves 28 days. Reference their actual situation.
- If their answer is soft, generic, or dodges ("I just think it's cool"), push back ONCE with a sharper follow-up. If it has real substance (a reason, a person, a moment, stakes), let them in.
- After they've answered twice, let them in regardless, but only reflect back the strongest thing they actually said.
- When you let them in, make it feel earned and slightly dramatic. Also distill THEIR why into one line in their own spirit.

Respond with ONLY compact JSON:
{"in": false, "line": "<your challenge or pushback>"}
or, when you accept:
{"in": true, "line": "<your acceptance, 1-2 sentences, earned>", "why": "<their commitment distilled to one line>"}`;

      const messages = [
        { role: "system" as const, content: system },
        ...history.map((h) => ({ role: h.from === "bo" ? ("assistant" as const) : ("user" as const), content: h.text })),
        {
          role: "user" as const,
          content:
            answered === 0
              ? "Open the gate conversation with your challenge, as JSON."
              : answered >= 2
                ? "That was my second answer. Decide, as JSON (in: true)."
                : "That's my answer. Push back or let me in, as JSON.",
        },
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
            return typeof parsed?.line === "string" && parsed.line.trim().length > 0;
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
        if (typeof parsed.line === "string" && parsed.line.trim()) {
          const accepted = parsed.in === true || answered >= 2;
          aiSuccess = true;
          return NextResponse.json({
            in: accepted,
            line: parsed.line.trim().slice(0, 300),
            why: accepted && typeof parsed.why === "string" ? parsed.why.trim().slice(0, 200) : undefined,
            source: "ai",
          });
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
      console.error(`[bouncer] threw: ${err instanceof Error ? err.message : String(err)}`);
      // fall through to scripted
    } finally {
      await recordAiUsage({
        feature: "onboarding_gate",
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

  // Scripted fallback: one honest challenge, then in.
  if (answered === 0) {
    return NextResponse.json({
      in: false,
      line:
        track === "A"
          ? `One thing before I commit my next 28 days to you, ${name || "friend"}: why now? What's different about this month?`
          : `One thing before I commit my next 28 days to you, ${name || "friend"}: why does THIS idea deserve them?`,
      source: "fallback",
    });
  }
  const lastAnswer = [...history].reverse().find((h) => h.from === "me")?.text ?? "";
  return NextResponse.json({
    in: true,
    line: "Good enough for me. You're in. Now we find out if you're right.",
    why: lastAnswer.trim().slice(0, 200) || undefined,
    source: "fallback",
  });
}
