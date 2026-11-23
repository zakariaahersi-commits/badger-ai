import test from "node:test";
import assert from "node:assert/strict";
import { companyUgcAssetPath, createHeyGenVideo, downloadRenderedVideo, heyGenConnector, normalizeUgcRenderJob, retrieveHeyGenVideo } from "../lib/company-os/ugc-renderer.ts";

const prepared = {
  posts: {
    x: "Bo gives one daily task, follows up and adjusts the plan from real proof.",
    tiktok: "Bo gives one daily task, follows up and adjusts the plan from real proof.",
  },
  ugc: {
    platform: "tiktok",
    format: "ai_founder_avatar",
    disclosure: "AI-generated presenter",
    hook: "Bo does not disappear after giving you a task.",
    durationSeconds: 24,
    script: "Bo gives you one task for today. When you reply with what happened, Bo follows up and adjusts tomorrow's plan from the proof.",
    scenes: [
      { visual: "Founder sees today's task", onScreenText: "One move", voiceover: "Bo gives you one task for today." },
      { visual: "Founder replies with proof", onScreenText: "Tell Bo what happened", voiceover: "You reply with what happened." },
      { visual: "Plan updates", onScreenText: "Tomorrow changes", voiceover: "Bo adjusts tomorrow's plan from the proof." },
    ],
    cta: "Start with Bo and see your Day 1 task.",
  },
};

test("HeyGen configuration is complete or fails closed", () => {
  assert.equal(heyGenConnector({}), null);
  assert.throws(() => heyGenConnector({ HEYGEN_API_KEY: "key" }), /configuration_incomplete/);
  assert.deepEqual(heyGenConnector({ HEYGEN_API_KEY: "key", HEYGEN_AVATAR_ID: "avatar", HEYGEN_VOICE_ID: "voice" }), { apiKey: "key", avatarId: "avatar", voiceId: "voice" });
});

test("AI-avatar rendering is bound to one completed prepared action", () => {
  const job = normalizeUgcRenderJob({ preparedActionId: "866a0a84-6daa-4fca-b74b-3b8f8f6032b9", title: "Show Bo following up", prepared });
  assert.equal(job.prepared.ugc.disclosure, "AI-generated presenter");
  assert.throws(() => normalizeUgcRenderJob({ preparedActionId: "not-an-action", title: "Bad", prepared }), /invalid_prepared_action_id/);
  assert.throws(() => normalizeUgcRenderJob({ preparedActionId: "866a0a84-6daa-4fca-b74b-3b8f8f6032b9", title: "Bad", prepared: { ...prepared, ugc: { ...prepared.ugc, format: "founder_to_camera", disclosure: null } } }), /invalid_ugc_render_format/);
});

test("HeyGen receives one vertical captioned render with the exact approved script", async () => {
  let request;
  const job = normalizeUgcRenderJob({ preparedActionId: "866a0a84-6daa-4fca-b74b-3b8f8f6032b9", title: "Show Bo following up", prepared });
  const result = await createHeyGenVideo({
    connector: { apiKey: "secret", avatarId: "avatar", voiceId: "voice" },
    job,
    fetchImpl: async (url, init) => {
      request = { url, init, body: JSON.parse(init.body) };
      return new Response(JSON.stringify({ code: 100, data: { video_id: "video-123" } }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });
  assert.equal(result.videoId, "video-123");
  assert.equal(request.url, "https://api.heygen.com/v2/video/generate");
  assert.equal(request.init.headers["X-Api-Key"], "secret");
  assert.deepEqual(request.body.dimension, { width: 720, height: 1280 });
  assert.equal(request.body.caption, true);
  assert.equal(request.body.video_inputs[0].voice.input_text, prepared.ugc.script);
});

test("HeyGen completion requires a public HTTPS video receipt", async () => {
  const connector = { apiKey: "secret", avatarId: "avatar", voiceId: "voice" };
  const status = await retrieveHeyGenVideo({
    connector,
    videoId: "video-123",
    fetchImpl: async () => new Response(JSON.stringify({ data: { status: "completed", video_url: "https://files.heygen.example/video.mp4", thumbnail_url: "https://files.heygen.example/thumb.jpg" } }), { status: 200 }),
  });
  assert.equal(status.state, "completed");
  assert.equal(status.videoUrl, "https://files.heygen.example/video.mp4");
  await assert.rejects(() => retrieveHeyGenVideo({
    connector,
    videoId: "video-123",
    fetchImpl: async () => new Response(JSON.stringify({ data: { status: "completed", video_url: "http://127.0.0.1/video.mp4" } }), { status: 200 }),
  }), /heygen_invalid_response/);
});

test("render downloads enforce type and size before private storage", async () => {
  let redirectMode;
  const bytes = await downloadRenderedVideo({
    videoUrl: "https://files.heygen.example/video.mp4",
    fetchImpl: async (_url, init) => {
      redirectMode = init.redirect;
      return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "video/mp4", "content-length": "3" } });
    },
  });
  assert.equal(bytes.byteLength, 3);
  assert.equal(redirectMode, "error");
  await assert.rejects(() => downloadRenderedVideo({
    videoUrl: "https://files.heygen.example/not-video",
    fetchImpl: async () => new Response("not video", { status: 200, headers: { "content-type": "text/plain" } }),
  }), /invalid_ugc_video_type/);
});

test("private video downloads stay bound to the completed action directory", () => {
  const actionId = "866a0a84-6daa-4fca-b74b-3b8f8f6032b9";
  assert.equal(companyUgcAssetPath({ state: "completed", storageBucket: "company-content", storagePath: `ugc/${actionId}/video-123.mp4` }, actionId), `ugc/${actionId}/video-123.mp4`);
  assert.equal(companyUgcAssetPath({ state: "completed", storageBucket: "company-content", storagePath: "ugc/another-action/video-123.mp4" }, actionId), null);
  assert.equal(companyUgcAssetPath({ state: "processing", storageBucket: "company-content", storagePath: `ugc/${actionId}/video-123.mp4` }, actionId), null);
});
