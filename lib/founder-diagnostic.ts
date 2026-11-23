import type { Profile, Track } from "./types.ts";

export interface FounderDiagnostic {
  pattern: string;
  headline: string;
  summary: string;
  blocker: string;
  coachingStyle: string;
  priorities: [string, string, string];
  path: [string, string, string, string];
}

function clean(value: string | undefined, fallback: string, max = 90): string {
  const text = value?.trim().replace(/\s+/g, " ");
  return text ? text.slice(0, max) : fallback;
}

function blockerFor(fear: string): { blocker: string; coachingStyle: string } {
  if (/embarrass|flop/i.test(fear)) {
    return {
      blocker: "Being judged makes the first conversation feel bigger than it is.",
      coachingStyle: "Bo will turn risky-feeling asks into small learning conversations, then build your confidence from real evidence.",
    };
  }
  if (/charging|gross/i.test(fear)) {
    return {
      blocker: "You can discuss the problem, but asking someone to pay feels uncomfortable.",
      coachingStyle: "Bo will help you make a useful offer and ask for payment plainly, without turning you into a pushy salesperson.",
    };
  }
  if (/who to ask/i.test(fear)) {
    return {
      blocker: "The next step stays vague because the first reachable person is not clear yet.",
      coachingStyle: "Bo will narrow the audience, help you choose real names and give you the words for the first message.",
    };
  }
  if (/later/i.test(fear)) {
    return {
      blocker: "The idea keeps losing to easier, more urgent work.",
      coachingStyle: "Bo will keep each move small, time-boxed and visible, then follow up when the work is not logged.",
    };
  }
  return {
    blocker: "You need evidence that the problem matters enough for someone to pay.",
    coachingStyle: "Bo will replace guessing with conversations, proof and a small paid test before you invest more time.",
  };
}

const TRACK_COPY: Record<Track, Pick<FounderDiagnostic, "pattern" | "headline" | "path">> = {
  A: {
    pattern: "The thoughtful explorer",
    headline: "You do not need the perfect idea. You need one real problem to choose.",
    path: ["Notice", "Choose", "Test", "Commit"],
  },
  B: {
    pattern: "The cautious validator",
    headline: "The idea is not the next risk. A real conversation is.",
    path: ["Listen", "Test", "Offer", "Launch"],
  },
  C: {
    pattern: "The hidden builder",
    headline: "Building is no longer the bottleneck. Asking is.",
    path: ["Find", "Ask", "Sell", "Decide"],
  },
};

export function buildFounderDiagnostic(profile: Profile): FounderDiagnostic {
  const track = profile.track || "B";
  const base = TRACK_COPY[track];
  const { blocker, coachingStyle } = blockerFor(profile.fear);
  const audience = clean(profile.whoFor || profile.audience, "people you can reach");
  const idea = clean(profile.builtWhat || profile.ideaShort || profile.idea, "your idea");

  if (track === "A") {
    const startingPoint = clean(profile.problemsNoticed || profile.interests || profile.skills, "problems you already notice");
    return {
      ...base,
      summary: `Your strongest starting point is ${startingPoint}. Bo will help you turn that into one problem worth testing, instead of asking you to invent a startup from nothing.`,
      blocker,
      coachingStyle,
      priorities: [
        `Choose one problem from ${startingPoint}`,
        `Speak to ${audience}`,
        "Keep only what real conversations support",
      ],
    };
  }

  if (track === "C") {
    return {
      ...base,
      summary: `You have already made ${idea}. The next 28 days should turn it into direct conversations, a clear offer and evidence that ${audience} will act.`,
      blocker,
      coachingStyle,
      priorities: [
        `Put ${idea} in front of ${audience}`,
        "Ask what is missing before building more",
        "Make a small, direct paid offer",
      ],
    };
  }

  return {
    ...base,
    summary: `You are carrying ${idea} for ${audience}. The fastest way forward is to learn what is true before spending more time building.`,
    blocker,
    coachingStyle,
    priorities: [
      `Test ${idea} with ${audience}`,
      "Save their exact words as evidence",
      "Turn the strongest signal into a paid offer",
    ],
  };
}
