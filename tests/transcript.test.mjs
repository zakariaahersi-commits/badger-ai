import test from "node:test";
import assert from "node:assert/strict";

import { mergeTranscript, normalizeTranscript } from "../lib/transcript.ts";

test("removes repeated words and repeated phrases from speech recognition", () => {
  assert.equal(normalizeTranscript("I I I want to help families"), "I want to help families");
  assert.equal(normalizeTranscript("I want to help families I want to help families"), "I want to help families");
});

test("merges a revised speech result without repeating the existing ending", () => {
  assert.equal(
    mergeTranscript("I want to help families", "help families find cultural activities", 240),
    "I want to help families find cultural activities",
  );
});

test("keeps normal dictated text and respects the field length", () => {
  assert.equal(normalizeTranscript("Families need a simpler way to find local events."), "Families need a simpler way to find local events.");
  assert.equal(mergeTranscript("", "one two three", 7), "one two");
});
