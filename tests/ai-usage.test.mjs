import test from "node:test";
import assert from "node:assert/strict";
import { estimatedAiCostUsd } from "../lib/ai-usage.ts";

test("estimates DeepSeek V4 Flash text cost from returned tokens", () => {
  const cost = estimatedAiCostUsd({
    provider: "deepseek",
    model: "deepseek-v4-flash",
    promptTokens: 1_000_000,
    completionTokens: 1_000_000,
  });
  assert.equal(cost, 0.42);
});

test("estimates Groq transcription cost with the ten-second minimum", () => {
  const cost = estimatedAiCostUsd({
    provider: "groq",
    model: "whisper-large-v3-turbo",
    audioSeconds: 5,
  });
  assert.ok(Math.abs(cost - (10 / 3600 * 0.04)) < 1e-12);
});

test("unknown providers are tracked without inventing a cost", () => {
  assert.equal(estimatedAiCostUsd({ provider: "unknown", model: "x", promptTokens: 100 }), 0);
});
