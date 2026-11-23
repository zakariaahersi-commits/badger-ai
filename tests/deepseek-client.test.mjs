import test from "node:test";
import assert from "node:assert/strict";
import { deepSeekCompletion, DeepSeekCompletionError } from "../lib/deepseek-client.ts";

function reply(content, usage = { prompt_tokens: 10, completion_tokens: 5 }) {
  return new Response(JSON.stringify({
    choices: [{ message: { content }, finish_reason: "stop" }],
    usage,
  }), { status: 200, headers: { "content-type": "application/json" } });
}

test("disables thinking and uses the feature token allowance", async () => {
  let requestBody;
  const result = await deepSeekCompletion({
    apiKey: "test-key",
    model: "deepseek-v4-flash",
    messages: [{ role: "user", content: "Return JSON." }],
    maxTokens: 2_048,
    timeoutMs: 1_000,
    attempts: 1,
    json: true,
    retryDelayMs: 0,
    fetchImpl: async (_url, init) => {
      requestBody = JSON.parse(init.body);
      return reply('{"say":"Ready."}');
    },
  });

  assert.deepEqual(requestBody.thinking, { type: "disabled" });
  assert.equal(requestBody.max_tokens, 2_048);
  assert.deepEqual(requestBody.response_format, { type: "json_object" });
  assert.equal(result.text, '{"say":"Ready."}');
  assert.equal(result.attempts, 1);
});

test("uses Vercel AI Gateway with its deployment identity when available", async () => {
  let requestedUrl;
  let authorization;
  let requestBody;
  const result = await deepSeekCompletion({
    apiKey: "invalid-direct-key",
    gatewayKey: "oidc-test-token",
    model: "deepseek-v4-flash",
    messages: [{ role: "user", content: "Return JSON." }],
    maxTokens: 2_048,
    timeoutMs: 1_000,
    attempts: 1,
    fetchImpl: async (url, init) => {
      requestedUrl = String(url);
      authorization = init.headers.Authorization;
      requestBody = JSON.parse(init.body);
      return reply('{"say":"Ready."}');
    },
  });

  assert.equal(requestedUrl, "https://ai-gateway.vercel.sh/v1/chat/completions");
  assert.equal(authorization, "Bearer oidc-test-token");
  assert.equal(requestBody.model, "deepseek/deepseek-v4-flash");
  assert.equal(result.model, "deepseek/deepseek-v4-flash");
});

test("retries an empty JSON-mode response without the fragile response_format constraint", async () => {
  const bodies = [];
  let calls = 0;
  const result = await deepSeekCompletion({
    apiKey: "test-key",
    messages: [{ role: "user", content: "Return JSON." }],
    maxTokens: 1_024,
    timeoutMs: 1_000,
    attempts: 2,
    json: true,
    retryDelayMs: 0,
    fetchImpl: async (_url, init) => {
      calls += 1;
      bodies.push(JSON.parse(init.body));
      return calls === 1
        ? reply("", { prompt_tokens: 10, completion_tokens: 500 })
        : reply('{"done":true}', { prompt_tokens: 10, completion_tokens: 4 });
    },
  });

  assert.equal(result.attempts, 2);
  assert.equal(result.completionTokens, 504);
  assert.deepEqual(result.priorErrorCodes, ["empty_response"]);
  assert.deepEqual(bodies[0].response_format, { type: "json_object" });
  assert.equal("response_format" in bodies[1], false);
});

test("retries a response that fails feature validation", async () => {
  let calls = 0;
  const result = await deepSeekCompletion({
    apiKey: "test-key",
    messages: [{ role: "user", content: "Return JSON." }],
    maxTokens: 768,
    timeoutMs: 1_000,
    attempts: 2,
    retryDelayMs: 0,
    validate: (text) => text.includes("question"),
    fetchImpl: async () => {
      calls += 1;
      return reply(calls === 1 ? '{"wrong":true}' : '{"question":"Who is it for?"}');
    },
  });

  assert.equal(result.attempts, 2);
  assert.equal(calls, 2);
});

test("surfaces a stable error code after retryable provider failures", async () => {
  await assert.rejects(
    deepSeekCompletion({
      apiKey: "test-key",
      messages: [{ role: "user", content: "Hello" }],
      maxTokens: 768,
      timeoutMs: 1_000,
      attempts: 2,
      retryDelayMs: 0,
      fetchImpl: async () => new Response("unavailable", { status: 503 }),
    }),
    (error) => {
      assert.ok(error instanceof DeepSeekCompletionError);
      assert.equal(error.code, "provider_503");
      assert.equal(error.attempts, 2);
      assert.deepEqual(error.attemptCodes, ["provider_503", "provider_503"]);
      return true;
    },
  );
});
