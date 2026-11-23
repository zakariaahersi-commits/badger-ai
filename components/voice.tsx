"use client";

// Voice-or-text input. The mic is ALWAYS shown. Two ways it works:
//   1. If the browser has live speech recognition (Chrome, Android), it
//      dictates straight into the field, free and instant.
//   2. Otherwise (most iPhones), it records audio and sends it to
//      /api/transcribe (Groq/OpenAI Whisper) and drops the text in.
// If transcription isn't configured, it says so kindly and you just type.

import { useRef, useState } from "react";
import { mergeTranscript, normalizeTranscript } from "@/lib/transcript";
import { supabase } from "@/lib/cloud";

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

function getWebSpeech(): SpeechRecognitionLike | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
  if (!Ctor) return null;
  const r = new Ctor();
  r.lang = "en-US";
  r.continuous = true;
  r.interimResults = true;
  return r;
}

type Mode = "idle" | "listening" | "recording" | "transcribing" | "unavailable";

export function VoiceTextArea({
  value,
  onChange,
  placeholder,
  maxLength = 240,
  autoFocus,
  showCount = false,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  maxLength?: number;
  autoFocus?: boolean;
  showCount?: boolean;
}) {
  const [mode, setMode] = useState<Mode>("idle");
  const [hint, setHint] = useState("");
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const baseRef = useRef("");
  const segmentsRef = useRef<Map<number, string>>(new Map());

  const append = (text: string) => onChange(mergeTranscript(baseRef.current, text, maxLength));

  const stopAll = () => {
    recRef.current?.stop();
    if (mediaRef.current && mediaRef.current.state !== "inactive") mediaRef.current.stop();
  };

  const start = async () => {
    if (mode === "listening" || mode === "recording") {
      stopAll();
      return;
    }
    setHint("");
    baseRef.current = value.trim();

    // Path 1: live on-device speech (Chrome / Android)
    const web = getWebSpeech();
    if (web) {
      recRef.current = web;
      segmentsRef.current.clear();
      // Rebuild the whole speech session by result index. Chrome may revise or
      // replay a result, so appending each callback can duplicate words.
      web.onresult = (e) => {
        for (let i = 0; i < e.results.length; i++) {
          segmentsRef.current.set(i, e.results[i][0].transcript);
        }
        for (const index of [...segmentsRef.current.keys()]) {
          if (index >= e.results.length) segmentsRef.current.delete(index);
        }
        const speech = [...segmentsRef.current.entries()]
          .sort(([left], [right]) => left - right)
          .map(([, transcript]) => transcript)
          .join(" ");
        append(normalizeTranscript(speech));
      };
      web.onend = () => {
        recRef.current = null;
        setMode("idle");
      };
      web.onerror = () => {
        setMode("idle");
        setHint("Didn't catch that. Try again, or just type.");
      };
      try {
        web.start();
        setMode("listening");
        return;
      } catch {
        /* fall through to recorder */
      }
    }

    // Path 2: record audio, transcribe on the server (iPhone et al.)
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setMode("unavailable");
      setHint("Voice isn't supported on this browser. Please type instead.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      const recordingStartedAt = Date.now();
      mediaRef.current = mr;
      chunksRef.current = [];
      mr.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        mediaRef.current = null;
        setMode("transcribing");
        try {
          const mimeType = mr.mimeType || chunksRef.current[0]?.type || "audio/webm";
          const blob = new Blob(chunksRef.current, { type: mimeType });
          const extension = mimeType.includes("mp4") ? "m4a" : mimeType.includes("ogg") ? "ogg" : "webm";
          const fd = new FormData();
          fd.append("audio", blob, `speech.${extension}`);
          fd.append("duration_seconds", String(Math.max(0.1, (Date.now() - recordingStartedAt) / 1_000)));
          const session = await supabase()?.auth.getSession();
          const token = session?.data.session?.access_token;
          const res = await fetch("/api/transcribe", {
            method: "POST",
            body: fd,
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          });
          const data = await res.json();
          if (data.configured === false) {
            setHint("Voice typing isn't switched on yet. Type for now.");
          } else if (data.text) {
            append(normalizeTranscript(data.text));
          } else {
            setHint("Didn't catch that. Try again, or just type.");
          }
        } catch {
          setHint("Couldn't reach the transcriber. Just type for now.");
        } finally {
          setMode("idle");
        }
      };
      mr.start();
      setMode("recording");
    } catch {
      setMode("idle");
      setHint("Mic permission was blocked. You can type instead.");
    }
  };

  const active = mode === "listening" || mode === "recording";
  const label =
    mode === "transcribing" ? "Writing it down…" : active ? "Tap to stop" : "Talk instead";

  return (
    <div>
      <div className="relative">
        <textarea
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => onChange(e.target.value.slice(0, maxLength))}
          placeholder={placeholder}
          className="w-full min-h-[140px] px-[18px] py-4 text-[18px] leading-[1.4] border-[1.5px] border-ink rounded-[14px] bg-paper text-ink font-medium resize-none outline-none placeholder:text-ink-20"
        />
        <button
          type="button"
          onClick={start}
          disabled={mode === "transcribing"}
          aria-label={label}
          className="absolute bottom-3 right-3 flex items-center gap-1.5 px-3 py-2 rounded-full text-[12px] font-bold cursor-pointer border-none transition-colors disabled:opacity-70"
          style={{ background: active ? "var(--bygga-red)" : "var(--bygga-ink)", color: "var(--bygga-bg)" }}
        >
          <span className={active ? "anim-pulse-soft" : ""}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <rect x="9" y="3" width="6" height="12" rx="3" stroke="currentColor" strokeWidth="2" />
              <path d="M5 11a7 7 0 0 0 14 0M12 18v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </span>
          {label}
        </button>
      </div>
      {(hint || showCount) && (
        <div className="mt-1.5 flex items-start justify-between gap-3 px-1 text-[12px] text-ink-40">
          <span>{hint}</span>
          {showCount && <span className="shrink-0 tabular-nums">{value.length.toLocaleString()} / {maxLength.toLocaleString()}</span>}
        </div>
      )}
    </div>
  );
}
