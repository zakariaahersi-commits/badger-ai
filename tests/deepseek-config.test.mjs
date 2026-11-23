import test from "node:test";
import assert from "node:assert/strict";

import { deepseekKey } from "../lib/deepseek-config.ts";

const KEY_NAMES = ["AI_GATEWAY_API_KEY", "VERCEL_OIDC_TOKEN", "DEEPSEEK_API_KEY", "Deepseek_API", "DEEPSEEK_API"];

function withCleanKeys(run) {
  const previous = Object.fromEntries(KEY_NAMES.map((name) => [name, process.env[name]]));
  for (const name of KEY_NAMES) delete process.env[name];
  try { run(); } finally {
    for (const name of KEY_NAMES) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
}

test("Company OS accepts Badger's legacy production DeepSeek key", () => {
  withCleanKeys(() => {
    process.env.Deepseek_API = `sk-${"a".repeat(30)}`;
    assert.deepEqual(deepseekKey(), { key: process.env.Deepseek_API, name: "Deepseek_API" });
  });
});

test("Vercel gateway identity takes precedence over direct provider keys", () => {
  withCleanKeys(() => {
    process.env.VERCEL_OIDC_TOKEN = "vercel-oidc-token";
    process.env.Deepseek_API = `sk-${"a".repeat(30)}`;
    assert.deepEqual(deepseekKey(), { key: "vercel-oidc-token", name: "VERCEL_OIDC_TOKEN" });
  });
});
