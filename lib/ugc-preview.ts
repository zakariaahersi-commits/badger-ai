import { buildFallbackPlan } from "./planEngine";
import type { ChatMessage, Connection, Profile, TaskLog } from "./types";

const MAYA_PROFILE: Profile = {
  name: "Maya",
  idea: "A simple invoice follow-up service that helps freelancers get paid without awkward chasing",
  ideaShort: "invoice follow-ups for freelancers",
  industry: "Freelancer tools",
  track: "B",
  monthsCarried: "8 months",
  fear: "Nobody will pay for it.",
  thinkingTime: "Sunday evening",
  days: [0, 2, 4],
  sessionMinutes: 25,
  consequence: "Push me. Hard.",
  stage: "just an idea",
  audience: "freelancers in two online communities",
  experience: "first company",
  whoFor: "freelance designers and writers",
  goal: "Get one freelancer to pay for a manual invoice follow-up service",
  commitment: "I want to know if this can become a real business",
  timezone: "Europe/Stockholm",
  planSource: "fallback",
};

const CONNECTIONS: Connection[] = [
  { kind: "twitter", label: "X / Twitter", sub: "DMs, replies, post drafts", connected: true },
  { kind: "linkedin", label: "LinkedIn", sub: "DMs, connection requests", connected: false },
  { kind: "gmail", label: "Gmail", sub: "Cold email + warm follow-ups", connected: true },
  { kind: "call", label: "Phone (call log)", sub: "Bo briefs, you dial. Outcomes logged", connected: false },
  { kind: "stripe", label: "Stripe", sub: "So we know when a real customer pays", connected: true },
];

const JOURNEY: Array<Omit<TaskLog, "day" | "loggedAt">> = [
  { did: "Sent three messages to freelance designers.", learned: "All three chase late invoices manually and hate sounding confrontational.", next: "Ask when it last happened.", proof: "3 message screenshots saved" },
  { did: "Wrote the idea in one sentence.", learned: "The value is not reminders. It is removing an awkward conversation.", next: "Keep the wording simple." },
  { did: "Named the three reasons I kept delaying.", learned: "I was hiding behind research because asking people felt exposed.", next: "Talk to people before changing the idea." },
  { did: "Reviewed three invoice tools and their customer comments.", learned: "The tools send reminders, but freelancers still decide what to say and when.", next: "Test a human follow-up service.", proof: "Competitor notes · 3 gaps highlighted" },
  { did: "Followed up with the first three people and added two more.", learned: "Short, personal messages got replies. A polished pitch did not matter.", next: "Book real conversations.", proof: "5 outreach messages saved" },
  { did: "Asked five people about the last late invoice.", learned: "Four waited more than a week before following up because it felt uncomfortable.", next: "Use their exact words in the offer.", proof: "Customer quotes · 4 strong signals" },
  { did: "Completed my first weekly check-in with Bo.", learned: "The problem is emotional as well as practical: people want to be paid without damaging the relationship.", next: "Book three deeper conversations." },
  { did: "Booked three customer conversations with real names and times.", learned: "People were willing to talk when I asked about their process, not my idea.", next: "Run conversation one.", proof: "Calendar · Nora, Elias and Sam booked" },
  { did: "Spoke with Nora about her last overdue invoice.", learned: "She lost two hours and delayed the message for nine days.", next: "Ask what a resolved outcome is worth.", proof: "Call notes · 18 minutes" },
  { did: "Wrote a clear description of the first customer.", learned: "Independent creatives with repeat clients care most about preserving the relationship.", next: "Test this with a second person." },
  { did: "Spoke with Elias using the same four questions.", learned: "He already pays an assistant for follow-ups during busy months.", next: "Compare the manual alternatives.", proof: "Call notes · Elias already pays for help" },
  { did: "Mapped what people use now.", learned: "Templates are cheap but still require courage and attention at the worst moment.", next: "Finish conversation three." },
  { did: "Finished conversation three and counted the evidence.", learned: "Five of six people confirmed the problem; two asked if I could do it for them.", next: "Commit at the Day 14 gate.", proof: "Evidence tally · 5/6 confirmed · 2 asked to try" },
  { did: "Committed to the idea for two more weeks.", learned: "The signal is strong enough to test payment, not strong enough to build software.", next: "Write the one core promise." },
  { did: "Wrote the one thing the service must do.", learned: "Get the invoice followed up quickly while protecting the client relationship.", next: "Make the manual version." },
  { did: "Created a one-page intake form and three follow-up templates.", learned: "A useful first version can be a service, not an app.", next: "Put it in front of people.", proof: "Live intake form + service checklist" },
  { did: "Shared the manual service with ten freelancers.", learned: "Four replied, two wanted to see the price and one asked to start this week.", next: "Make a direct payment ask.", proof: "10 sent · 4 replies · 2 price requests" },
  { did: "Asked three people if the service was worth paying for.", learned: "A clear small price felt easier to answer than a vague beta invitation.", next: "Create the payment link.", proof: "Answers saved · yes, yes, not now" },
  { did: "Created a real payment link for the first week of service.", learned: "Making payment possible changed the conversation from feedback to a decision.", next: "Send it to Nora.", proof: "Stripe payment link · $19 starter service" },
  { did: "Sent Nora the price and payment link.", learned: "The clean ask took one minute. Waiting and rewriting took two days.", next: "Follow up once, then accept the answer.", proof: "Payment ask screenshot" },
  { did: "Nora paid and completed the intake form.", learned: "The first customer bought the outcome and relief, not the technology.", next: "Deliver the service well.", proof: "Stripe receipt · $19 paid by Nora" },
  { did: "Delivered Nora's first invoice follow-up.", learned: "She valued the tone check more than the reminder itself.", next: "Ask what would make this repeatable.", proof: "Customer delivery completed" },
  { did: "Asked Nora for honest feedback after delivery.", learned: "She would pay monthly if the service handled the full follow-up sequence.", next: "Test that offer with two more people.", proof: "Customer feedback screenshot" },
  { did: "Showed the service to three freelancers outside my circle.", learned: "Two understood it immediately when I led with getting paid without awkward chasing.", next: "Follow up with every warm lead.", proof: "3 reactions logged" },
  { did: "Followed up with everyone who said yes or maybe.", learned: "Specific timing and a payment link created clearer replies.", next: "Ask the warmest person on a call.", proof: "6 follow-ups sent" },
  { did: "Made a direct payment ask on a call.", learned: "Silence after the price was uncomfortable, but it gave the customer space to decide.", next: "Close every open conversation.", proof: "Call outcome · wants to start next week" },
  { did: "Closed the open conversations and prepared the next customer intake.", learned: "One payment is proof of a start. Repeating it is the next challenge.", next: "Record the Day 28 outcome.", proof: "Pipeline · 1 paid · 2 warm leads" },
];

const BADGE_DAYS: Record<string, number> = {
  "idea-written": 2,
  "first-conversation": 6,
  "first-signal": 6,
  "7-day-streak": 7,
  "survived-kill-day": 14,
  "something-built": 16,
  "shared-strangers": 17,
  "first-ask": 18,
  "14-day-streak": 14,
  "first-paying-user": 21,
  shipped: 28,
};

function isoForDay(day: number): string {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - Math.max(0, 28 - day));
  return date.toISOString();
}

function logsBefore(day: number): Record<number, TaskLog> {
  const logs: Record<number, TaskLog> = {};
  JOURNEY.slice(0, Math.max(0, day - 1)).forEach((log, index) => {
    const logDay = index + 1;
    logs[logDay] = { ...log, day: logDay, loggedAt: isoForDay(logDay) };
  });
  return logs;
}

function badgesBefore(day: number, includeShipDay = false): Record<string, string> {
  return Object.fromEntries(
    Object.entries(BADGE_DAYS)
      .filter(([, earnedDay]) => earnedDay < day || (includeShipDay && earnedDay === 28))
      .map(([id, earnedDay]) => [id, isoForDay(earnedDay)])
  );
}

function chatFor(day: number): ChatMessage[] {
  if (day >= 18) {
    return [
      { from: "bo", body: "Maya, the evidence is clear: people have the problem, and two asked for the price. Today we turn interest into a real decision.", time: "9:04 AM" },
      { from: "me", body: "Two people said yes, but I feel awkward sending the payment link.", time: "9:06 AM" },
      { from: "bo", body: "You do not need another feature. You need one clean ask. I drafted it below. Approve it, then let Nora decide.", time: "9:06 AM", actions: [{
        id: "ugc-payment-ask",
        type: "send_email",
        title: "Send the payment ask",
        summary: "A direct, simple message for Nora",
        risk: "external",
        status: "pending",
        approvalRequired: true,
        details: {
          to: "Nora",
          body: "Hey Nora — you said late invoices cost you hours. I'm opening five early-access spots at $19. Want the first one? Stripe checkout: buy.stripe.com/test_4gw7uO3Nx",
        },
      }] },
    ];
  }
  if (day >= 7) {
    return [
      { from: "bo", body: "Your launch page is ready. Three people asked when they can try it. What's stopping you from sending the link?", time: "8:42 AM" },
      { from: "me", body: "I keep rewriting the launch message. If I send it, people can ignore it — or say no.", time: "8:44 AM" },
      { from: "bo", body: "Rewriting feels like progress. Sometimes it's fear of being seen. Send the version you have to three people. Let reality edit the next one.", time: "8:44 AM" },
    ];
  }
  return [
    { from: "bo", body: "Maya. Day 1 starts now. I turned your idea into one clear step that takes 25 minutes. Do the work, save what happened, and I will use it to shape tomorrow.", time: "9:00 AM" },
  ];
}

export function buildUgcPreviewState(stage: string | null) {
  const parsed = Number(stage?.match(/\d+/)?.[0] ?? 1);
  const day = Math.max(1, Math.min(28, Number.isFinite(parsed) ? parsed : 1));
  const shipped = stage?.toLowerCase().includes("shipped") ?? false;
  const today = new Date();
  today.setHours(12, 0, 0, 0);

  return {
    onboarded: true,
    paid: true,
    profile: MAYA_PROFILE,
    planStart: today.toISOString(),
    demoDayOffset: day - 1,
    tasks: buildFallbackPlan(MAYA_PROFILE),
    logs: logsBefore(day),
    badges: badgesBefore(day, shipped),
    outcome: shipped ? "shipped" as const : null,
    outcomeNote: "",
    day14Decision: day > 14 ? "committed" as const : null,
    gateDismissedDay: 0,
    intentions: { [day]: day >= 18 ? "After work" : "Lunch" },
    posts: [],
    comments: {},
    chat: chatFor(day),
    connections: CONNECTIONS,
    notify: true,
    soundEnabled: false,
    hapticsEnabled: false,
    planPartial: false,
    lastCheckinDay: day,
    cloudHydratedUserId: null,
  };
}
