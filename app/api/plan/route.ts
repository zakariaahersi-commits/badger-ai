import { NextRequest, NextResponse } from "next/server";
import { STARTUP_BUILDER_KNOWLEDGE, TRACK_META, buildFallbackPlan } from "@/lib/planEngine";
import { deepseekKey } from "@/lib/coach";
import { learnedPatternsText } from "@/lib/learn";
import { recordAiUsage } from "@/lib/ai-usage";
import { normalizeGeneratedPlan, repairGeneratedPlan } from "@/lib/plan-quality";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { deepSeekCompletion, DeepSeekCompletionError } from "@/lib/deepseek-client";
import type { Profile } from "@/lib/types";

// Generates an individualized 28-day plan. With DEEPSEEK_API_KEY, DeepSeek
// writes it from the person's full profile, grounded in proven early-customer
// practice. Without a key (or on any failure) it returns the funnel-specific
// deterministic plan so a real plan always comes back.

export const runtime = "nodejs";
// 28 detailed tasks take a while to generate; allow the function to run long
// enough to finish instead of aborting to the generic template.
export const maxDuration = 120;

const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash";

function safeText(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function safeProfile(value: unknown): Profile | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  if (input.track !== "A" && input.track !== "B" && input.track !== "C") return null;
  const sessionMinutes = Math.min(30, Math.max(10, Number(input.sessionMinutes) || 25));
  return {
    name: safeText(input.name, 80),
    idea: safeText(input.idea),
    ideaShort: safeText(input.ideaShort, 160),
    industry: safeText(input.industry, 120),
    track: input.track,
    monthsCarried: safeText(input.monthsCarried, 80),
    fear: safeText(input.fear, 200) as Profile["fear"],
    thinkingTime: safeText(input.thinkingTime, 120),
    days: Array.isArray(input.days)
      ? input.days.filter((day): day is number => Number.isInteger(day) && day >= 0 && day <= 6).slice(0, 7)
      : [],
    sessionMinutes,
    timezone: safeText(input.timezone, 80) || undefined,
    consequence: safeText(input.consequence, 160),
    stage: safeText(input.stage),
    audience: safeText(input.audience),
    experience: safeText(input.experience),
    whoFor: safeText(input.whoFor),
    skills: safeText(input.skills),
    interests: safeText(input.interests),
    problemsNoticed: safeText(input.problemsNoticed),
    builtWhat: safeText(input.builtWhat),
    triedSelling: safeText(input.triedSelling),
    goal: safeText(input.goal),
    commitment: safeText(input.commitment),
  };
}

export async function POST(req: NextRequest) {
  if (!rateLimit(`plan:${clientIp(req)}`, 6, 300_000)) {
    return NextResponse.json({ error: "rate limited" }, { status: 429 });
  }
  const body = await req.json().catch(() => null);
  const profile = safeProfile(body?.profile);
  if (!profile) {
    return NextResponse.json({ error: "profile required" }, { status: 400 });
  }
  // Quick mode generates just the first week fast (~10s) so the founder can
  // start Day 1; the client then asks for the full plan in the background.
  const quick = body?.quick === true;
  const count = quick ? 7 : 28;
  const fallback = buildFallbackPlan(profile);
  const fallbackPlan = quick ? fallback.slice(0, 7) : fallback;

  const { key: apiKey, name: keyName } = deepseekKey();
  console.log(`[plan] deepseek key ${apiKey ? `present (${keyName})` : "MISSING"}, model=${DEEPSEEK_MODEL}, track=${profile.track}`);
  if (apiKey) {
    const aiStarted = Date.now();
    let promptTokens = 0;
    let completionTokens = 0;
    let aiSuccess = false;
    let errorCode: string | null = null;
    let attempts = 0;
    let repairedTasks = 0;
    try {
      const meta = TRACK_META[profile.track];
      const system = `You are Bo, a startup coach for first-time, often non-technical founders. You design a 28-day plan that takes ONE person from where they are toward a launch and their first paying customer, or an honest decision to stop.

${STARTUP_BUILDER_KNOWLEDGE}

Hard rules for the plan:
- Exactly ${count} tasks${quick ? ", the FIRST WEEK only (days 1 to 7), a fast starter so they can begin today" : ", one per day, day 1 to 28"}.
- Every task is doable in under 30 minutes by someone with zero startup experience.
- Every task produces one tangible thing (a sent message, booked call, written note, a link, a payment).
- Plain language. No jargon. Never use the words or labels: outreach, pivot, MVP, traction, funnel, leverage, synergy, Mom Test. A first-timer must understand every word.
- The founder's answers are raw notes and may be incomplete, ungrammatical or dictated. Understand the meaning, then rewrite it in natural global English. Never paste a broken phrase into a task. If the meaning is unclear, use a general phrase such as "this problem" and make the task help them clarify it.
- Every title and instruction must be a complete grammatical sentence. Never output placeholders such as [what], [who], braces or unfinished quoted text.
- Personalize every task to THIS person: their idea, who it's for, their stage, the time they have, and what they've already done. Reference their specifics by name.
${quick ? `- Day 1 must be tiny and doable today. Day 7 is a short check-in.` : `- Day 14 must be a "keep going / change the angle / stop" decision. Day 28 must be the final "ship it or close it" decision. Days 7 and 21 are short check-ins.`}
- This person's situation: ${meta.situation}
${profile.track === "A" ? `- They have NO idea yet, BUT in onboarding they already told you what annoys them ("${profile.problemsNoticed || "—"}"), what they're good at ("${profile.skills || "—"}"), and what they're drawn to ("${profile.interests || "—"}"). USE their actual words. Do NOT ask them to "list things that annoy you" again — they literally just did. Days 1-6 help them sharpen and PICK one problem from what they already gave you, get a couple of reactions from real people, and commit to one by day 6. Make day 1 reference something specific they wrote.` : ""}

Return ONLY a JSON array of ${count} objects, no prose, no markdown fences. Each object:
{"type": one of "validate"|"build"|"market"|"revenue"|"reflection"|"call"|"kill", "title": short imperative task, "detail": ONE short sentence of plain how-to (keep it tight), "minutes": 10-30, "verify": short proof}`;

      const user = `Build my 28-day plan.
Name: ${profile.name}
Where I am: ${meta.label}${profile.stage ? ` — ${profile.stage}` : ""}
My idea: ${profile.idea || "(none yet)"}
Who it's for: ${profile.whoFor || "not sure yet"}
${profile.builtWhat ? `What I've built: ${profile.builtWhat}` : ""}
${profile.triedSelling ? `What I've tried for customers: ${profile.triedSelling}` : ""}
${profile.skills ? `I'm good at: ${profile.skills}` : ""}
${profile.interests ? `I'm drawn to: ${profile.interests}` : ""}
${profile.problemsNoticed ? `Problems I keep noticing: ${profile.problemsNoticed}` : ""}
How I reach people: ${profile.audience || "not sure"}
Experience: ${profile.experience || "first time"}
Time per session: ${profile.sessionMinutes || 25} minutes
My biggest fear: ${profile.fear}
A win in 28 days looks like: ${profile.goal || "one paying customer"}${profile.commitment ? `\nWhy I said this deserves 28 days: ${profile.commitment}` : ""}`;

      // Weave in what's working across other founders (anonymized, "" if none).
      const learned = await learnedPatternsText(profile.track);

      // Plan generation is bigger than a chat turn. DeepSeek thinking is
      // disabled in the shared client so the output allowance is spent on the
      // actual plan, and a transient timeout or malformed response gets one
      // clean retry before the deterministic fallback is used.
      const completion = await deepSeekCompletion({
        apiKey,
        model: DEEPSEEK_MODEL,
        messages: [
          { role: "system", content: learned ? `${system}\n\n${learned}` : system },
          { role: "user", content: user },
        ],
        maxTokens: quick ? 3_000 : 10_000,
        timeoutMs: quick ? 35_000 : 55_000,
        attempts: 2,
        temperature: 0.35,
        validate: (text) => {
          const start = text.indexOf("[");
          const end = text.lastIndexOf("]");
          if (start < 0 || end <= start) return false;
          try {
            const parsed = JSON.parse(text.slice(start, end + 1));
            return Array.isArray(parsed) && parsed.length === count;
          } catch {
            return false;
          }
        },
      });
      promptTokens = completion.promptTokens;
      completionTokens = completion.completionTokens;
      attempts = completion.attempts;
      const text = completion.text;

      const jsonStart = text.indexOf("[");
      const jsonEnd = text.lastIndexOf("]");
      if (jsonStart !== -1 && jsonEnd !== -1) {
        const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
        const strictPlan = normalizeGeneratedPlan(parsed, count);
        const repaired = strictPlan ? null : repairGeneratedPlan(parsed, fallbackPlan);
        const plan = strictPlan ?? repaired?.plan;
        if (plan) {
          repairedTasks = repaired?.repairedCount ?? 0;
          aiSuccess = true;
          console.log(`[plan] source=ai${quick ? "(week1)" : ""}, repaired=${repairedTasks}, day1="${plan[0].title.slice(0, 70)}"`);
          return NextResponse.json({ plan, source: "ai", repairedTasks });
        }
        console.error("[plan] deepseek returned JSON but fewer than 75% of tasks passed validation");
      } else if (text) {
        console.error(`[plan] deepseek returned no JSON array: ${text.slice(0, 200)}`);
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
      console.error(`[plan] deepseek call threw: ${e instanceof Error ? e.message : String(e)}`);
      // fall through to deterministic
    } finally {
      await recordAiUsage({
        feature: quick ? "plan_week_one" : "plan_full",
        provider: "deepseek",
        model: DEEPSEEK_MODEL,
        promptTokens,
        completionTokens,
        latencyMs: Date.now() - aiStarted,
        success: aiSuccess,
        errorCode,
        metadata: { track: profile.track, task_count: count, attempts, repaired_tasks: repairedTasks },
      });
    }
  }

  return NextResponse.json({ plan: fallbackPlan, source: "fallback" });
}
