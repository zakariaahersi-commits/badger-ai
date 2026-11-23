// The startup knowledge base + the individualized plan engine.
//
// The single source of startup methodology Byqqa coaches from, distilled
// from knowledge shared by top startup builders and the classic
// first-customer canon. Used two ways:
//   1. Injected into the AI plan/coach prompts so DeepSeek reasons from it.
//   2. As the deterministic fallback generator when no AI key is set, so
//      a real, funnel-specific, individualized plan always exists.

import type { Profile, SprintTask, TaskType, Track } from "./types";

// ---- Bo's coaching doctrine, distilled from top startup builders and
// experienced company coaches. Kept in plain words a first-timer understands.
// Injected into the AI coach + plan prompts; the deterministic fallback plan
// also reflects it. Coach from the knowledge without name-dropping sources.
export const STARTUP_BUILDER_KNOWLEDGE = `HOW BO COACHES:
- People first. The work gets done through a person who feels seen. Ask how they are before what they did.
- Candor with care. Tell the hard truth, then show you're on their side. Never sugarcoat, never belittle.
- Courage is the job. Most people already know the next step and are scared to take it. Make them braver, not just smarter.
- Build the person, not only the company. Confidence compounds. Name what they did well, specifically and truthfully, never empty praise.
- Listen more than you talk. The answer is usually already in them. Pull it out with one good question.

WHAT TO DO (TOP STARTUP BUILDERS' KNOWLEDGE):
- The only two things that matter early: talk to users, and make something people want. Everything else is procrastination.
- Make something a small number of people want a LOT, not something a lot of people want a little.
- Do things that don't scale. Get your first customers by hand, one at a time, recruited personally.
- Talk to people to LEARN, never to pitch (The Mom Test). Ask about their past and their life: "When did you last hit this? What did you do? What did it cost you?" Never "would you use my app?".
- Charge money early. A yes with a payment is the only real yes. "Would you pay?" is weak; "here's how to pay" is strong.
- Launch when you're a little embarrassed. Shipping beats polishing. You learn nothing from an unlaunched product.
- Find ideas by noticing what's missing or annoying in your own life. The best ideas look small or unsexy at first.
- Default alive, not default dead: know if you're on a path to covering your own costs. Get to "ramen profitable" as fast as you can.
- Each week, check one thing: are you talking to people, and is the thing getting better.
- A clear "no" is a gift; it saves months. Kill ideas the evidence rejects, fast, and keep the lesson.`;

// ---- Per-funnel framing the coach uses ----
export const TRACK_META: Record<
  Track,
  {
    label: string;
    diagnosisName: string;
    diagnosisLine: string;
    diagnosisSub: string;
    day1Verb: string;
    day1Object: string;
    day1Note: string;
    bombshell: (name: string, months: string) => string;
    // one-line summary of where this person is, for AI + fallback
    situation: string;
  }
> = {
  A: {
    label: "No idea yet",
    diagnosisName: "Idea Paralysis",
    diagnosisLine: "You read, you bookmark, you don't pick.",
    diagnosisSub: "Then you collect another framework to avoid choosing.",
    day1Verb: "List",
    day1Object: "5 things that annoyed or slowed you down this week.",
    day1Note: 'Not "ideas." Annoyances. Your idea is hiding inside one of them.',
    bombshell: (name, months) =>
      `${name}, you've wanted to start something for ${months}. The block isn't the idea. It's that you've never let yourself pick one.`,
    situation:
      "Has no specific idea yet. Needs an idea-finder: surface real problems they've personally felt, pick ONE worth pursuing, then begin validating it. The first several days are discovery, not building.",
  },
  B: {
    label: "Have an idea, stuck",
    diagnosisName: "Idea Avoidance",
    diagnosisLine: "You have the idea. You haven't talked to a soul.",
    diagnosisSub: "Then you start a new idea to avoid the first scary conversation.",
    day1Verb: "Find",
    day1Object: "3 replies from people who face this problem.",
    day1Note:
      "Not 30. Not a customer base. Three. A text, an email, or a message to someone you already know.",
    bombshell: (name, months) =>
      `${name}, you've carried this idea for ${months}. The tools are ready. The only missing step is talking to a human.`,
    situation:
      "Has a specific idea but hasn't validated it with real people. Needs to talk to potential customers (Mom Test style), find the real problem, then test willingness to pay.",
  },
  C: {
    label: "Built it, not selling",
    diagnosisName: "Build Avoidance",
    diagnosisLine: "You ship features. You don't ask for the sale.",
    diagnosisSub: "Then you add one more feature to avoid the conversation about money.",
    day1Verb: "Message",
    day1Object: "5 people who fit your customer and ask for 15 minutes.",
    day1Note: "You've been waiting for people to find you on their own. The real work is talking to them.",
    bombshell: (name, months) =>
      `${name}, you shipped ${months} ago and still have no paying customers. You don't have a product problem. You have an asking problem.`,
    situation:
      "Has already built something but isn't selling. Needs to stop building, get in front of real prospects, and make direct asks for money.",
  },
};

export const WEEK_META = [
  { n: 1, label: "Find your people", phase: "LISTEN", color: "yellow" },
  { n: 2, label: "Learn what they really need", phase: "LEARN", color: "teal" },
  { n: 3, label: "Decide, then start selling", phase: "SELL", color: "red" },
  { n: 4, label: "Get to paying customers", phase: "CLOSE", color: "teal" },
] as const;

export const TASK_TYPE_META: Record<
  TaskType,
  { label: string; color: string; bg: string }
> = {
  validate: { label: "Listen", color: "#3A8E68", bg: "rgba(76,175,130,0.14)" },
  build: { label: "Make", color: "#8a7a13", bg: "rgba(232,212,77,0.25)" },
  market: { label: "Reach out", color: "#C2410C", bg: "rgba(249,115,22,0.13)" },
  revenue: { label: "Ask", color: "#B91C1C", bg: "rgba(239,68,68,0.12)" },
  reflection: { label: "Reflect", color: "#52525B", bg: "rgba(107,114,128,0.12)" },
  call: { label: "Check-in", color: "#3A8E68", bg: "rgba(58,142,104,0.14)" },
  kill: { label: "Decide", color: "#991B1B", bg: "rgba(153,27,27,0.12)" },
};

// ---- Deterministic, individualized fallback ----
// Builds a 28-day plan that differs by funnel AND adapts copy to the
// person's idea, audience, stage and time. Not as fluid as the AI, but
// genuinely personal and always available.

type Tpl = [TaskType, string, string, number, string];

function safeInlinePhrase(value: string | undefined, fallback: string): string {
  const clean = value?.replace(/\s+/g, " ").trim().replace(/[.!?]+$/, "") ?? "";
  if (
    !clean
    || clean.split(" ").length > 12
    || /[{}\[\]]|\b(undefined|null|not sure yet)\b/i.test(clean)
    || /^(if|when|whether|because|how|that|why)\b/i.test(clean)
    || /\b(?:do|is|are|was|were|for|to|with)\s*$/i.test(clean)
  ) return fallback;
  return clean;
}

function fill(s: string, p: Partial<Profile>): string {
  const idea = safeInlinePhrase(p.ideaShort, p.track === "A" ? "the problem you pick" : "your idea");
  const who = safeInlinePhrase(p.whoFor, "the people it's for");
  const audience = safeInlinePhrase(p.audience, "people you can reach");
  return s
    .replace(/\{idea\}/g, idea)
    .replace(/\{who\}/g, who)
    .replace(/\{audience\}/g, audience)
    .replace(/\{name\}/g, p.name || "");
}

// Track A — idea finder first (days 1–7 discover + commit), then validate, sell, close.
function planA(): Tpl[][] {
  return [
    [
      ["reflection", "List 5 things that annoyed or slowed you down this week.", "Not ideas. Annoyances. Big or tiny. Your idea is hiding in one of them.", 15, "Your list of 5, in the log"],
      ["reflection", "For each annoyance, write who else has it.", "Just you? Everyone? A specific group? The best ideas are a sharp problem for a clear group.", 20, "Who-has-it note for each"],
      ["validate", "Pick the 2 that bug the most people you can reach.", "Cross off the ones only you have. Keep the 2 with the widest, reachable group.", 15, "Your 2 finalists, logged"],
      ["market", "Message 3 people about finalist #1. Just ask if they feel it too.", "No solution talk. 'Hey, does X annoy you as much as it annoys me?' Learn if it's real.", 25, "3 messages sent (screenshots)"],
      ["market", "Message 3 people about finalist #2. Same question.", "Same message, second problem. You're seeing which one people react to more.", 25, "3 messages sent (screenshots)"],
      ["build", "Pick ONE. This is your idea for the next 21 days.", "Whichever got the stronger reaction wins. Write it as: 'I help {who} with [problem].' You can't change it now.", 15, "Your one-sentence idea, logged"],
      ["call", "Sunday check-in with Bo: you have an idea now.", "10 minutes. Which problem won, and why. Bo shapes Week 2 around it.", 10, "Check-in done in app"],
    ],
    week2(),
    week3(),
    week4(),
  ];
}

// Track B — has an idea, go validate it.
function planB(): Tpl[][] {
  return [
    [
      ["market", "Message 3 people who might have this problem. Ask what they do now.", "They can be friends or people in an online group. Say: 'I am looking into {idea}. Can I ask you three quick questions?'", 25, "3 messages sent (screenshots)"],
      ["build", 'Write {idea} in one sentence: "I help {who} do [what]."', "This is your one sentence. You can't change the idea for 28 days, and that's the point.", 15, "The sentence, logged"],
      ["reflection", "Write the 3 real reasons you haven't started before today.", "Be honest. Nobody sees this but you and Bo.", 15, "3 reasons, logged"],
      ["validate", "Look up who else helps {who} with this. Note what's missing.", "Other people doing it is proof the problem is real, not a reason to stop. Find the gap.", 20, "3 bullets in the log"],
      ["market", "Follow up with your 3 people. Add 2 more.", "Five total. The follow-up is where replies happen. One line, no pressure.", 20, "Follow-ups sent"],
      ["validate", 'Ask each person: "When did you last deal with this, and what did you do?"', "Their story, in their words. Do not pitch. You're collecting evidence, not compliments (The Mom Test).", 25, "Word-for-word notes"],
      ["call", "Sunday check-in with Bo: how did Week 1 go?", "10 minutes. Who replied, what you heard, what scared you. Bo adjusts Week 2.", 10, "Check-in done in app"],
    ],
    week2(),
    week3(),
    week4(),
  ];
}

// Track C — built it, go sell it.
function planC(): Tpl[][] {
  return [
    [
      ["market", "Message 5 people who fit {who}. Ask for 15 minutes.", "You've been waiting for people to find you on their own. They won't. Go to them. Message them today.", 25, "5 messages sent (screenshots)"],
      ["reflection", "Write why each past attempt to sell didn't land.", "Was it ever the product? Or was it always the moment you had to ask for money?", 20, "Honest notes, logged"],
      ["validate", "Reply to everyone who answers. Book 2 calls this week.", "No pitch yet. 'Can I show you what I made and get your honest reaction?'", 20, "2 calls booked (names + times)"],
      ["build", 'Rewrite your one-line pitch: "I help {who} do [what]."', "If a stranger can't repeat it in 5 seconds, nothing else matters. Put it at the top of everything.", 25, "Before/after, logged"],
      ["revenue", "Write your price down. Then add 50%.", "You're underpricing because asking feels uncomfortable. Log the number you'll quote this week.", 15, "The price, logged"],
      ["validate", "On each call: ask what they do today and what it costs them.", "Understand the gap your thing fills before you pitch it. Their words, logged.", 30, "Notes from the calls"],
      ["call", "Sunday check-in with Bo: what did you hear?", "10 minutes. Who you reached, what they said. Bo adjusts Week 2.", 10, "Check-in done in app"],
    ],
    week2(),
    week3(),
    week4(),
  ];
}

function week2(): Tpl[] {
  return [
    ["validate", "Book 3 conversations for this week. Real names, real times.", "From the people who replied, or 3 new ones. 10 minutes each is plenty.", 20, "3 bookings logged"],
    ["call", "Conversation 1: ask the 4 questions. Don't pitch.", "(1) When did you last hit this problem? (2) What did you do? (3) What did that cost you in time or money? (4) What would make it go away?", 30, "Word-for-word answers"],
    ["reflection", "Write one paragraph describing your real customer.", "A specific person. What their Tuesday looks like, what frustrates them, what they've already tried.", 20, "The paragraph, logged"],
    ["call", "Conversation 2: same 4 questions, different person.", "Listen for the moment their voice changes. That's the real problem. Log the exact words.", 30, "Word-for-word answers"],
    ["validate", "List what people already use instead. Why does it fall short?", "If they still have the problem, something is missing. Name it precisely.", 20, "The list, logged"],
    ["call", "Conversation 3, then count your evidence.", "After this, count: how many confirmed the problem is real and painful? That number decides tomorrow.", 30, "Tally logged: X of Y"],
    ["kill", "DAY 14: keep going, change the angle, or stop. You decide.", "Bo shows you your numbers. If people lean in, commit and start selling. If they don't, change the angle or stop cleanly. No middle ground.", 15, "Decision logged"],
  ];
}

function week3(): Tpl[] {
  return [
    ["build", "Write the ONE thing your idea must do. One sentence.", "Not five features. The single core thing. Everything else waits.", 20, "The sentence, logged"],
    ["build", "Make the smallest version someone could use today.", "A one-page site, a form, a shared doc, or just you doing it by hand over chat. It does not need to be clever. Put it in front of someone before bed.", 30, "Link or photo of the thing"],
    ["market", "Show it to 10 people. Count who responds.", "Your earlier contacts plus 5 new. This is your first real interest number.", 25, "Sent + response count"],
    ["revenue", 'Ask 3 people directly: "Would this be worth paying for?"', "Log exact words: yes / maybe / no. A polite 'maybe' is a 'no' in disguise.", 20, "3 answers, word for word"],
    ["build", "Make it possible to actually pay you. Today.", "A payment link, an invoice, even a bank detail with a note. Anything a real person can send money through. No 'coming soon.'", 25, "Link to your payment method"],
    ["revenue", "Make one real ask for money. Today.", "'Here's the link, it's [price].' One person, one ask. Log the outcome word for word.", 20, "The ask and the answer"],
    ["call", "Sunday check-in with Bo: what did the asks teach you?", "10 minutes. Bo helps you adjust your price and where you look for people.", 10, "Check-in done in app"],
  ];
}

function week4(): Tpl[] {
  return [
    ["market", "Show what you made to 3 people outside your circle.", "Not friends or family. Note their honest reaction.", 25, "3 reactions, logged"],
    ["revenue", "Follow up with everyone who said yes or maybe.", "One line each: 'Ready to start? Here's the link.' Send the payment link with it.", 20, "Follow-ups sent"],
    ["market", "Ask your warmest person to pay, on a call if you can.", "Talking converts far better than text. Say the price, then go quiet and wait.", 30, "Outcome logged"],
    ["revenue", "Get customer #1 over the line. Whatever it honestly takes today.", "A first-customer discount is fine. Free is not. Even a small amount counts. A payment is a payment.", 30, "Payment confirmation"],
    ["market", "Work your list: 5 more asks today.", "Volume is the last variable. Five asks, same message, no overthinking between them.", 25, "5 asks logged"],
    ["revenue", "Get customer #2. Close the loop.", "Two customers is a pattern, not luck. Push every open conversation to a yes or a clean no.", 30, "Payment #2, or closest near-miss"],
    ["kill", "DAY 28: Ship it or close it. Make the call.", "SHIP: people are paying, keep going. CLOSE: you learned more in 28 days than most learn in two years. Both are wins. 'Someday' is the only loss.", 15, "Outcome logged"],
  ];
}

export function generatePlan(track: Track, ideaShort: string): SprintTask[] {
  // Back-compat shim: builds from a partial profile.
  return buildFallbackPlan({ track, ideaShort } as Profile);
}

export function buildFallbackPlan(p: Profile): SprintTask[] {
  const weeks = p.track === "A" ? planA() : p.track === "C" ? planC() : planB();
  const tasks: SprintTask[] = [];
  weeks.forEach((week, wi) => {
    week.forEach(([type, title, detail, minutes, verify], di) => {
      const day = wi * 7 + di + 1;
      tasks.push({
        day,
        week: wi + 1,
        type,
        title: fill(title, p),
        detail: fill(detail, p),
        minutes,
        verify: fill(verify, p),
      });
    });
  });
  return tasks;
}
