import test from "node:test";
import assert from "node:assert/strict";

import { dailyMailCopy } from "../lib/nudge-copy.ts";

test("daily email uses short grammatical paragraphs", () => {
  const mail = dailyMailCopy("morning", {
    day: 3,
    name: "Jimmy",
    taskTitle: "Message three families and ask how they find cultural activities",
    minutes: 20,
    missed: 0,
  });
  assert.equal(mail.subject, "Jimmy, your Day 3 step is ready");
  assert.match(mail.paragraphs.join(" "), /Today’s step is: Message three families/);
  assert.doesNotMatch(mail.paragraphs.join(" "), /\.\./);
});

test("daily email never repeats a broken saved task", () => {
  const mail = dailyMailCopy("evening", {
    day: 2,
    name: "Jimmy",
    taskTitle: 'Write If they had experience in cultural: "I help [what]"',
    minutes: 15,
    missed: 0,
  });
  const text = mail.paragraphs.join(" ");
  assert.doesNotMatch(text, /experience in cultural|\[what\]/i);
  assert.match(text, /Did you complete today’s step/);
});
