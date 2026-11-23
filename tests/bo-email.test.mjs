import test from "node:test";
import assert from "node:assert/strict";
import { renderBoEmail } from "../lib/bo-email.ts";

test("Bo email reads like a personal note in HTML and plain text", () => {
  const email = renderBoEmail({
    name: "Mina Founder",
    paragraphs: ["I have your plan. We start now."],
    action: { label: "Open Day 1", href: "https://badger.example.com/app" },
  });

  assert.match(email.html, /Hey Mina,/);
  assert.match(email.html, /Your co-founder at Badger AI/);
  assert.doesNotMatch(email.html, /<h1|BADGER AI|display:inline-block/);
  assert.match(email.text, /^Hey Mina,/);
  assert.match(email.text, /Open Day 1\nhttps:\/\/badger\.example\.com\/app/);
});

test("Bo email escapes user supplied content", () => {
  const email = renderBoEmail({
    name: '<img src=x onerror="alert(1)">',
    paragraphs: ["Talk to <three> people & learn"],
  });

  assert.doesNotMatch(email.html, /<img/);
  assert.match(email.html, /&lt;img/);
  assert.match(email.html, /&lt;three&gt; people &amp; learn/);
});
