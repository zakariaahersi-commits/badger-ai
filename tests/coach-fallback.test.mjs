import test from "node:test";
import assert from "node:assert/strict";
import {
  avoidRepeatedCoachReply,
  boundCoachHistory,
  coachReplyNeedsRetry,
  coachGroundingAnchors,
  coachTurnFocus,
  founderNeedsExploration,
  isEmotionallyToneDeafCoachReply,
  isShamingCoachReply,
  isUnpromptedInactivityNudge,
  isRepeatedCoachReply,
  isUnsupportedCoachCertainty,
  sanitizeCoachReply,
  unavailableCoachReply,
} from "../lib/coach-rescue.ts";

const jimmyContext = {
  profile: { name: "Jimmy", idea: "A service for local cafés" },
  day: 13,
  streak: 0,
  missedDays: 11,
  completedThisWeek: 0,
  currentTask: { title: "Call one café owner", type: "call", minutes: 20 },
  currentTaskLogged: false,
  verifiedPaymentCount: 0,
  recentLogs: [],
};

test("an unavailable coach reflects the founder's words instead of faking a stock answer", () => {
  const reply = unavailableCoachReply("I said I don't know where to start", jimmyContext.profile.name);
  assert.match(reply, /I said I don't know where to start/);
  assert.match(reply, /don't want to give that a stock answer/);
  assert.doesNotMatch(reply, /quiet for 11 days|Call one café owner/);
});

test("never repeats an identical recent Bo reply", () => {
  const repeated = "You've been quiet for 11 days, Jimmy. What's actually blocking you? No judgment. Just name it.";
  const history = [{ from: "bo", body: repeated }];
  assert.equal(isRepeatedCoachReply(repeated, history), true);
  const reply = avoidRepeatedCoachReply(repeated, history);
  assert.notEqual(reply, repeated);
  assert.match(reply, /I repeated myself/);
  assert.match(reply, /responding to you/);
});

test("rejects an inactivity script when the founder is trying to explain something else", () => {
  const reply = "You've been quiet for 11 days, Jimmy. What's actually blocking you?";
  assert.equal(isUnpromptedInactivityNudge(reply, "I feel lost"), true);
  assert.equal(coachReplyNeedsRetry(reply, "I don't know where to start", []), true);
  assert.equal(isUnpromptedInactivityNudge(reply, "I want to talk about why I was away"), false);
  assert.equal(isUnpromptedInactivityNudge("Being lost after four quiet days makes sense.", "I'm lost"), true);
});

test("rejects pressure language that minimises or shames the founder", () => {
  const reply = "One person's opinion changes nothing about your life. The idea dying in your head for another year does.";
  assert.equal(isShamingCoachReply(reply), true);
  assert.equal(coachReplyNeedsRetry(reply, "I'm scared they will think it is silly", []), true);
});

test("requires Bo to acknowledge a founder's named fear", () => {
  const message = "I keep avoiding the call because I'm scared the parent will think my idea is silly.";
  const toneDeaf = "You have two useful conversations already. Write down the strongest evidence and choose the next step.";
  const listening = "The fear is about being judged on the call. Make it a learning question, not a pitch.";
  assert.equal(isEmotionallyToneDeafCoachReply(toneDeaf, message), true);
  assert.equal(coachReplyNeedsRetry(toneDeaf, message, []), true);
  assert.equal(isEmotionallyToneDeafCoachReply(listening, message), false);
});

test("removes unsafe pressure, unsupported certainty and machine timestamps", () => {
  const reply = "Maya, the fear is about judgment. One reaction won't decide anything about your life. You already know it works. Call by 2026-08-17T11:14:27.566Z and save a note.";
  const safe = sanitizeCoachReply(reply);
  assert.doesNotMatch(safe, /decide anything about your life|already know it works|2026-/i);
  assert.match(safe, /fear is about judgment/);
  assert.match(safe, /the time you chose/);
  assert.equal(isUnsupportedCoachCertainty("You already know it works."), true);
});

test("humanises machine timestamps with offsets before they reach the chat", () => {
  const safe = sanitizeCoachReply("Call one parent by 2026-08-17T14:30:00+02:00 and save the note.");
  assert.equal(safe, "Call one parent by the time you chose and save the note.");
});

test("requires exploration before prescribing when the founder only says they are lost", () => {
  const screenshotReply = "Jimmy, you're lost. That's honest. Let's make it tiny. Today's task is one call, 30 minutes.";
  assert.equal(founderNeedsExploration("I'm lost"), true);
  assert.equal(coachReplyNeedsRetry(screenshotReply, "I'm lost", []), true);
  assert.match(coachTurnFocus("I'm lost"), /ask one specific diagnostic question/i);
  assert.equal(
    coachReplyNeedsRetry("It sounds like you cannot see where to re-enter the plan. Is the unclear part who to call, what to ask, or whether this idea still matters to you?", "I'm lost", []),
    false,
  );
});

test("requires a vague-struggle question to use the founder's real journey", () => {
  const anchors = coachGroundingAnchors([
    "A weekly meal-planning tool for busy parents",
    "Call the third parent",
  ]);
  assert.deepEqual(anchors.slice(0, 4), ["weekly", "meal", "planning", "busy"]);
  assert.equal(
    coachReplyNeedsRetry("What part of the journey feels unclear right now?", "I'm lost.", [], anchors),
    true,
  );
  assert.equal(
    coachReplyNeedsRetry("Is the hard part calling another parent, or knowing what to ask about meal planning?", "I'm lost.", [], anchors),
    false,
  );
  assert.match(coachTurnFocus("I'm lost.", anchors), /weekly, meal, planning/);
});

test("uses the explanation when the founder already names the cause", () => {
  assert.equal(founderNeedsExploration("I'm stuck because I don't know which café owner to call"), false);
  assert.doesNotMatch(coachTurnFocus("I'm stuck because I don't know which café owner to call"), /exploration turn/i);
});

test("keeps a useful connected conversation within the prompt budget", () => {
  const history = Array.from({ length: 30 }, (_, index) => ({
    from: index % 2 ? "bo" : "me",
    body: `message-${index}-${"x".repeat(900)}`,
  }));
  const bounded = boundCoachHistory(history, 20, 4_000);
  assert.ok(bounded.length <= 20);
  assert.equal(bounded.at(-1)?.body, history.at(-1)?.body);
  assert.ok(bounded.reduce((total, entry) => total + entry.body.length, 0) <= 4_000);
});
