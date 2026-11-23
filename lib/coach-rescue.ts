export interface CoachHistoryEntry {
  from: "bo" | "me";
  body: string;
}

function normalized(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function boundCoachHistory(
  history: CoachHistoryEntry[],
  maxMessages = 20,
  maxCharacters = 12_000,
): CoachHistoryEntry[] {
  const selected: CoachHistoryEntry[] = [];
  let characters = 0;
  for (const entry of history.slice(-maxMessages).reverse()) {
    if (selected.length && characters + entry.body.length > maxCharacters) break;
    selected.push(entry);
    characters += entry.body.length;
  }
  return selected.reverse();
}

export function isRepeatedCoachReply(reply: string, history: CoachHistoryEntry[]): boolean {
  const candidate = normalized(reply);
  return Boolean(candidate) && history.slice(-20).some((entry) =>
    entry.from === "bo" && normalized(entry.body) === candidate
  );
}

export function isUnpromptedInactivityNudge(reply: string, latestUserMessage: string): boolean {
  const nudge = /\b(?:you(?:'ve| have) been quiet|quiet for (?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve) days?|(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve) quiet days?|missed \d+ days?)\b/i.test(reply);
  const userRaisedAbsence = /\b(?:quiet|away|absent|absence|missed|went missing|came back|return(?:ed|ing)?)\b/i.test(latestUserMessage);
  return nudge && !userRaisedAbsence;
}

export function isShamingCoachReply(reply: string): boolean {
  return /\b(?:dying in your head|changes nothing about your life|won['’]?t decide anything about your life|stop making excuses|no more excuses|you(?:'re| are) wasting (?:your )?time|just do it)\b/i.test(reply);
}

export function isUnsupportedCoachCertainty(reply: string): boolean {
  return /\b(?:you (?:already )?know (?:that )?it works|this proves? (?:that )?(?:the idea|it) works|the idea (?:definitely )?works)\b/i.test(reply);
}

export function isEmotionallyToneDeafCoachReply(reply: string, latestUserMessage: string): boolean {
  const founderNamedFear = /\b(?:afraid|scared|fear|fearful|embarrass(?:ed|ing)?|silly|judg(?:e|ed|ment)|nervous|anxious|worr(?:y|ied))\b/i.test(latestUserMessage);
  if (!founderNamedFear) return false;
  return !/\b(?:afraid|scared|fear|embarrass(?:ed|ing|ment)?|silly|judg(?:e|ed|ing|ment)|nervous|anxious|worr(?:y|ied)|reaction|rejection|opinion|approval|what they think|call|parent)\b/i.test(reply);
}

export function sanitizeCoachReply(reply: string): string {
  const withoutMachineTime = reply.replace(
    /\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:?\d{2})?\b/g,
    "the time you chose",
  );
  const sentences = withoutMachineTime.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [];
  const safe = sentences.filter((sentence) => !isShamingCoachReply(sentence) && !isUnsupportedCoachCertainty(sentence));
  return safe.join(" ").replace(/\s+/g, " ").trim();
}

export function founderNeedsExploration(message: string): boolean {
  const value = normalized(message);
  const vagueStruggle = /\b(?:lost|stuck|overwhelmed|confused|unsure|don['’]?t know|do not know)\b/i.test(value);
  const alreadyExplained = /\b(?:because|since|when|the problem is|what stops me|i(?:'|’)m stuck on|i am stuck on)\b/i.test(value);
  return vagueStruggle && !alreadyExplained && value.split(" ").length <= 24;
}

const GENERIC_GROUNDING_WORDS = new Set([
  "about", "actual", "answer", "because", "build", "business", "clear", "current", "evidence", "founder", "idea",
  "journey", "latest", "might", "people", "right", "something", "start", "starting", "still", "their", "there", "thing",
  "today", "tool", "unclear", "want", "what", "where", "which", "with", "work", "your",
]);

function groundingToken(value: string): string {
  const clean = value.toLocaleLowerCase().replace(/[^a-z0-9]/g, "");
  return clean.length > 4 && clean.endsWith("s") ? clean.slice(0, -1) : clean;
}

export function coachGroundingAnchors(values: Array<string | undefined>, limit = 12): string[] {
  const anchors: string[] = [];
  for (const value of values) {
    for (const word of value?.match(/[a-z0-9]+/gi) ?? []) {
      const token = groundingToken(word);
      if (token.length < 4 || GENERIC_GROUNDING_WORDS.has(token) || anchors.includes(token)) continue;
      anchors.push(token);
      if (anchors.length >= limit) return anchors;
    }
  }
  return anchors;
}

export function isUngroundedExplorationReply(reply: string, latestUserMessage: string, anchors: string[] = []): boolean {
  if (!founderNeedsExploration(latestUserMessage) || !anchors.length) return false;
  const replyTokens = new Set((reply.match(/[a-z0-9]+/gi) ?? []).map(groundingToken));
  return !anchors.some((anchor) => replyTokens.has(groundingToken(anchor)));
}

export function coachTurnFocus(message: string, anchors: string[] = []): string {
  if (founderNeedsExploration(message)) {
    const grounding = anchors.length ? ` Use at least one of these verified journey anchors naturally: ${anchors.join(", ")}.` : "";
    return `This is an exploration turn. The founder has named a struggle but not its cause. Do not prescribe an action, create an approval, mention inactivity, or push today's task yet. Briefly show you understand the uncertainty without parroting their adjective, then ask one specific diagnostic question grounded in their journey.${grounding}`;
  }
  if (/\b(?:that(?:'|’)s not what i|you(?:'|’)re not listening|i said|stop repeating|tone[- ]deaf)\b/i.test(message)) {
    return "This is a repair turn. Acknowledge the specific miss, use the correction, and answer what the founder actually said before reconnecting to the journey.";
  }
  return "Respond to the founder's latest meaning first, then connect it to the journey only when useful.";
}

export function coachReplyNeedsRetry(
  reply: string,
  latestUserMessage: string,
  history: CoachHistoryEntry[],
  groundingAnchors: string[] = [],
): boolean {
  const missingExplorationQuestion = founderNeedsExploration(latestUserMessage) && !reply.includes("?");
  return isRepeatedCoachReply(reply, history)
    || isUnpromptedInactivityNudge(reply, latestUserMessage)
    || isShamingCoachReply(reply)
    || isUnsupportedCoachCertainty(reply)
    || isEmotionallyToneDeafCoachReply(reply, latestUserMessage)
    || isUngroundedExplorationReply(reply, latestUserMessage, groundingAnchors)
    || missingExplorationQuestion;
}

export function unavailableCoachReply(userText: string, name: string): string {
  const heard = userText.trim().replace(/\s+/g, " ").replace(/[“”]/g, "\"").slice(0, 180);
  return `${name}, I heard you say “${heard}.” I don't want to give that a stock answer. I couldn't reach the live coach just now, so please try once more in a moment.`;
}

export function avoidRepeatedCoachReply(
  reply: string,
  history: CoachHistoryEntry[],
): string {
  if (!isRepeatedCoachReply(reply, history)) return reply;
  return "You're right, I repeated myself instead of responding to you. Please send that last thought once more so I can answer it properly.";
}
