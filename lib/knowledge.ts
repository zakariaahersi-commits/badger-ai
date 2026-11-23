// Bo's deep doctrine — distilled from knowledge shared by top startup builders
// and coaches, rewritten in Bo's plain language (no jargon,
// no verbatim quotes). One static block would bloat every request, so topics
// are routed: relevantKnowledge() picks the 1-2 that fit this moment and only
// those are injected into the prompt.

export interface Topic {
  key: string;
  triggers: string[]; // lowercase substrings matched against the user's words
  body: string;
}

export const TOPICS: Topic[] = [
  {
    key: "finding-ideas",
    triggers: ["idea", "no idea", "which problem", "what to build", "can't decide", "brainstorm"],
    body: `FINDING THE IDEA (when they're hunting or doubting the idea):
- The best ideas are problems you've personally felt. Not "what would be cool", but "what annoyed me last Tuesday".
- Boring, unglamorous problems are gold. Everyone avoids them, so nobody's solving them. The chore nobody wants is a business.
- Narrow and deep beats broad and shallow. A thing 10 people desperately want beats a thing 10,000 people shrug at. You can widen later.
- If they say "but someone's already doing it": competitors prove the problem is real. Execution and a specific niche win, not originality.
- Don't let them wait for the perfect idea. Commit to a good-enough real problem and let the customer conversations shape it. The idea at Day 28 never matches Day 1, and that's the process working.`,
  },
  {
    key: "talking-to-users",
    triggers: ["interview", "talk to", "ask them", "conversation", "call with", "questions", "feedback", "validate", "survey"],
    body: `TALKING TO PEOPLE (interviews, validation conversations):
- Ask about their life, not your idea. "When did this last happen? What did you do? What did it cost you?" Past behavior is data. Opinions are noise.
- Never pitch in a learning conversation. The moment you pitch, they start being polite, and polite kills truth.
- Compliments are a bad sign. "Sounds cool, I'd use that" costs them nothing. Look for pain: specifics, frustration, money already spent on workarounds.
- The only real validation is commitment: their time (a booked call), their reputation (an intro), or their money (a payment). Everything else is theater.
- Five real conversations beat a 100-person survey. Depth over volume, always.`,
  },
  {
    key: "dont-scale",
    triggers: ["automate", "scale", "too manual", "one by one", "efficient", "faster way", "mass", "bulk"],
    body: `DO THINGS THAT DON'T SCALE (when they want to automate or go mass too early):
- Recruit the first customers by hand, one at a time. It feels slow and inefficient. It's the fastest path that actually works.
- The mass blast is fear wearing a productivity costume. Ten personal messages that mention the person's actual situation beat 1,000 copy-pastes.
- Over-serve the first few absurdly. Do the setup for them. Deliver it by hand. What you learn watching one real customer up close is the whole education.
- Manual first, automate later. You can't automate a thing you don't understand yet.`,
  },
  {
    key: "pricing-and-asking",
    triggers: ["price", "charge", "pay", "how much", "free", "discount", "pricing", "money"],
    body: `PRICING AND THE ASK (when money enters the room):
- Charge from the first customer. Free users tell you nothing; a payment is the only compliment that can't be faked.
- Price on what it's worth to them, not what it cost you. If it saves someone hours a week, it's not a $5 thing.
- Say the number, then stop talking. The silence after the price is where the deal happens. Filling it with discounts is fear.
- If nobody pushes back on your price, it's too low. A little wince is the right price.
- "I'd pay for that" is not a yes. Send the payment link in the same conversation. The gap between "I'd pay" and paying is where ideas go to die.`,
  },
  {
    key: "first-sales",
    triggers: ["outreach", "cold", "dm", "message people", "reach out", "email them", "sell", "customer", "lead", "follow up", "no reply", "ignored"],
    body: `GETTING THE FIRST SALES (outreach, asks, silence):
- Start with people you can already reach: contacts, communities you're in, friends-of-friends. Warm beats cold ten to one, and you have more warmth than you think.
- Make every message about THEM: their situation, their problem, one specific observation. Then one small ask: "worth a 10-minute chat?"
- No reply is not a no. Most sales happen in the follow-up, and almost nobody follows up. One polite bump after 2-3 days doubles replies.
- Rejection is data, not verdict. Ten nos with reasons are worth more than silence. Ask "what would make this a yes?" and write the answer down.
- The goal of the first sale isn't revenue, it's proof. One stranger paying changes what you know about the idea more than a month of building.`,
  },
  {
    key: "launch",
    triggers: ["launch", "ship", "release", "publish", "not ready", "perfect", "polish", "one more feature", "waiting until"],
    body: `LAUNCHING (when they stall on "not ready yet"):
- If you're not a little embarrassed by version one, you launched too late. The gap between your standard and good-enough is procrastination in disguise.
- Launching is not an event, it's a habit. You'll launch twenty times: to one person, to five, to a community, again after changes. The first one just breaks the seal.
- Nobody is watching. The fear of a public flop assumes an audience that doesn't exist yet. Obscurity is a feature: you can fix things before anyone notices.
- Ship the smallest thing that lets a stranger get the value and pay. Every feature beyond that is delay.
- "One more feature first" is the most expensive sentence in startups. Build after they ask, not before.`,
  },
  {
    key: "kill-or-commit",
    triggers: ["quit", "give up", "kill", "stop", "not working", "hopeless", "waste", "pointless", "another idea", "new idea", "switch"],
    body: `KILL OR COMMIT (doubt, quitting, the shiny new idea):
- There are two honest reasons to stop: the evidence says no (people heard it, understood it, and didn't want it), or you genuinely don't want it anymore. "It's hard" is neither.
- The new-idea itch mid-sprint is almost always avoidance. It shows up right before the scary task, every time. Name that out loud.
- Sunk cost runs both ways: don't keep a dead idea because you spent on it, don't kill a live one because you're tired today. Only the receipts decide, and the decision days are Day 14 and Day 28, not a bad Tuesday.
- Killing clean is a skill most people never learn. They let ideas rot for years instead. A written verdict with lessons is a win you keep forever.
- Before killing, check the angle: same problem, different customer or different promise, is a change of angle, not a new idea. That's allowed. A brand-new problem is not.`,
  },
  {
    key: "fear-and-stalling",
    triggers: ["scared", "afraid", "nervous", "anxious", "procrastinat", "stuck", "can't start", "overwhelmed", "embarrass", "imposter", "avoiding", "keep putting"],
    body: `FEAR AND STALLING (when they freeze):
- Procrastination is not laziness, it's emotion. You're not avoiding the task, you're avoiding a feeling: judgment, rejection, "who am I to do this". Name the feeling and it shrinks.
- Shrink the step until it's not scary: can't send 10 messages? Send one. Can't send one? Write it without sending. Motion kills fear; planning feeds it.
- Courage isn't the absence of fear, it's a 10-minute timer. Anyone can do the scary thing for 10 minutes.
- The fear says the stakes are huge. The truth: one message, one no, one flop changes nothing about your life. The idea dying in your head for another year does.
- Done is a decision, not a feeling. You'll rarely feel ready. Builders act before they feel ready, and the feeling follows the action, not the other way around.`,
  },
  {
    key: "after-first-customers",
    triggers: ["grow", "more customers", "marketing", "retention", "churn", "next step after", "scale up", "second customer", "third customer"],
    body: `AFTER THE FIRST CUSTOMERS (turning proof into income):
- Go back to the people who paid and watch them use it. Their friction list is your roadmap. The ones who paid teach you more than any prospect.
- Before finding new customers, make sure the first ones would be upset to lose it. Growth on top of leaky value is a treadmill.
- Do more of the exact thing that got customer #1. It's tempting to try a new channel; first squeeze the one that already worked.
- Ask every paying customer: "who else do you know with this problem?" A warm intro from a happy customer closes at rates cold outreach never will.
- Raise the price for the next customers. Early-supporter pricing was a favor, not the business model.`,
  },
];

// Task-type and phase hints so the right doctrine shows up even when the
// user's words don't trigger it.
const TYPE_HINTS: Record<string, string[]> = {
  revenue: ["pricing-and-asking", "first-sales"],
  market: ["first-sales", "dont-scale"],
  call: ["talking-to-users"],
  validate: ["talking-to-users", "finding-ideas"],
  build: ["launch"],
  kill: ["kill-or-commit"],
};

export function relevantKnowledge(
  message: string,
  taskType?: string,
  day?: number,
  max = 2
): string {
  const text = message.toLowerCase();
  const scores = new Map<string, number>();
  for (const t of TOPICS) {
    let s = 0;
    for (const trig of t.triggers) if (text.includes(trig)) s += 2;
    scores.set(t.key, s);
  }
  if (taskType && TYPE_HINTS[taskType]) {
    for (const key of TYPE_HINTS[taskType]) scores.set(key, (scores.get(key) ?? 0) + 1);
  }
  if (day !== undefined) {
    if (day <= 4) scores.set("finding-ideas", (scores.get("finding-ideas") ?? 0) + 1);
    if (day === 13 || day === 14 || day >= 26) scores.set("kill-or-commit", (scores.get("kill-or-commit") ?? 0) + 1);
  }
  const picked = TOPICS
    .map((t) => ({ t, s: scores.get(t.key) ?? 0 }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, max)
    .map((x) => x.t.body);
  if (!picked.length) return "";
  return `DEEP DOCTRINE FOR THIS MOMENT (ground your answer in this; never name the sources):\n\n${picked.join("\n\n")}`;
}
