import { NextRequest, NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { recordAiUsage } from "@/lib/ai-usage";
import { serverAuth } from "@/lib/server-auth";
import { normalizeTranscript } from "@/lib/transcript";

// Speech-to-text for the "Talk instead" mic. Takes a recorded audio blob
// and returns text. Uses Groq Whisper (free tier, fast) when GROQ_API_KEY
// is set, or OpenAI Whisper with OPENAI_API_KEY. Reports not-configured so
// the client can fall back to typing gracefully.

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  if (!rateLimit(`transcribe:${clientIp(req)}`, 12, 60_000)) {
    return NextResponse.json({ error: "rate limited" }, { status: 429 });
  }
  const groq = process.env.GROQ_API_KEY;
  const openai = process.env.OPENAI_API_KEY;
  if (!groq && !openai) {
    return NextResponse.json({ configured: false }, { status: 200 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("audio");
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "audio required" }, { status: 400 });
  }

  const endpoint = groq
    ? "https://api.groq.com/openai/v1/audio/transcriptions"
    : "https://api.openai.com/v1/audio/transcriptions";
  const model = groq ? "whisper-large-v3-turbo" : "whisper-1";
  const provider = groq ? "groq" : "openai";
  const key = groq || openai;
  const audioSeconds = Math.min(1_800, Math.max(0, Number(form?.get("duration_seconds")) || 0));
  const auth = await serverAuth(req);

  const upstream = new FormData();
  const filename = file instanceof File && file.name ? file.name : "speech.webm";
  upstream.append("file", file, filename);
  upstream.append("model", model);
  upstream.append("language", "en");
  upstream.append("response_format", "json");

  const aiStarted = Date.now();
  let aiSuccess = false;
  let errorCode: string | null = null;
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: upstream,
    });
    if (!res.ok) {
      errorCode = `provider_${res.status}`;
      return NextResponse.json({ error: "transcription failed" }, { status: 502 });
    }
    const data = await res.json();
    aiSuccess = true;
    return NextResponse.json({ configured: true, text: normalizeTranscript(data.text) });
  } catch (error) {
    errorCode = error instanceof Error && error.name === "AbortError" ? "timeout" : "request_failed";
    return NextResponse.json({ error: "transcription failed" }, { status: 502 });
  } finally {
    await recordAiUsage({
      feature: "voice_transcription",
      provider,
      model,
      userId: auth.userId,
      audioSeconds,
      latencyMs: Date.now() - aiStarted,
      success: aiSuccess,
      errorCode,
      service: auth.service,
    });
  }
}
