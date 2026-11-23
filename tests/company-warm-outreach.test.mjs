import assert from "node:assert/strict";
import test from "node:test";
import { mayRecordWarmOutreachStatus, warmOutreachReply, warmOutreachTrackingUrl } from "../lib/company-os/warm-outreach.ts";

test("warm outreach permits only honest forward outcome transitions", () => {
  assert.equal(mayRecordWarmOutreachStatus("ready", "sent"), true);
  assert.equal(mayRecordWarmOutreachStatus("ready", "interested"), false);
  assert.equal(mayRecordWarmOutreachStatus("sent", "replied"), true);
  assert.equal(mayRecordWarmOutreachStatus("sent", "not_interested"), true);
  assert.equal(mayRecordWarmOutreachStatus("replied", "interested"), true);
  assert.equal(mayRecordWarmOutreachStatus("interested", "sent"), false);
});

test("each anonymous contact gets attributable product traffic without PII", () => {
  const url = new URL(warmOutreachTrackingUrl({ sourceCode: "badger-20260824-warm-dm", slot: 3 }));
  assert.equal(url.origin, "https://badger.example.com");
  assert.equal(url.pathname, "/start");
  assert.equal(url.searchParams.get("utm_source"), "warm_founder_message");
  assert.equal(url.searchParams.get("utm_medium"), "warm_dm");
  assert.equal(url.searchParams.get("utm_campaign"), "badger-20260824-warm-dm");
  assert.equal(url.searchParams.get("utm_content"), "contact_3");
  assert.doesNotMatch(url.toString(), /@|name|email|phone/i);
});

test("the link is shared only in the short second message", () => {
  const reply = warmOutreachReply({ sourceCode: "badger-20260824-warm-dm", slot: 1 });
  assert.match(reply, /\$49 once, not a subscription/);
  assert.match(reply, /utm_content=contact_1/);
  assert.doesNotMatch(reply, /unlock|game-changer|funnel|traction/i);
});

