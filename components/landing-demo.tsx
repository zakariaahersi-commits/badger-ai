"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { BoFace } from "./bo";
import { track } from "@/lib/telemetry";

type DemoReply = {
  summary: string;
  focus: string;
  draft: string;
  action: string;
  proof: string;
  minutes: number;
  source: "ai" | "guided";
};

const FALLBACK: DemoReply = {
  summary: "Your idea is still broad, so the fastest progress will come from one real conversation, not more planning.",
  focus: "Do not improve the solution yet. Learn how the problem appears in someone’s real day.",
  draft: "I am exploring a better way to solve this problem. When did it last happen to you, and what did you do?",
  action: "Send this message to one person who may have the problem.",
  proof: "Bring back one reply in their own words.",
  minutes: 15,
  source: "guided",
};

export function LandingDemo() {
  const [input, setInput] = useState("");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<DemoReply | null>(null);
  const [status, setStatus] = useState<"idle" | "thinking" | "answered">("idle");
  const [copied, setCopied] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const nextMessage = input.trim();
    if (nextMessage.length < 12 || status === "thinking") return;
    setMessage(nextMessage);
    setResult(null);
    setCopied(false);
    setStatus("thinking");
    void track("demo_started", { characters: nextMessage.length });

    try {
      const response = await fetch("/api/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: nextMessage }),
      });
      const data = await response.json();
      if (!response.ok || !data?.summary || !data?.focus || !data?.draft || !data?.action || !data?.proof) {
        throw new Error("demo unavailable");
      }
      const nextResult: DemoReply = {
        summary: data.summary,
        focus: data.focus,
        draft: data.draft,
        action: data.action,
        proof: data.proof,
        minutes: Number(data.minutes) || 15,
        source: data.source === "ai" ? "ai" : "guided",
      };
      setResult(nextResult);
      void track("demo_completed", { source: nextResult.source, minutes: nextResult.minutes });
    } catch {
      setResult(FALLBACK);
      void track("demo_completed", { source: "guided", minutes: FALLBACK.minutes });
    } finally {
      setStatus("answered");
    }
  };

  const continueWithBo = () => {
    try {
      sessionStorage.setItem("badger-demo-seed-v1", message);
    } catch {
      /* storage is a convenience, never a blocker */
    }
    void track("demo_cta_clicked", { source: result?.source ?? "unknown" });
  };

  const copyDraft = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.draft);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const edit = () => {
    setInput(message);
    setMessage("");
    setResult(null);
    setCopied(false);
    setStatus("idle");
  };

  return (
    <div className="bo-demo flex min-h-[520px] flex-col rounded-[26px] border border-ink-10 bg-paper p-4 shadow-card sm:p-5">
      <div className="flex items-center justify-between gap-3 border-b border-ink-10 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="bo-avatar-orbit"><BoFace state={status === "thinking" ? "thinking" : "idle"} size={42} /></div>
          <div>
            <div className="text-[14px] font-bold">Bo</div>
            <div className="text-[11px] text-ink-60">coach + co-founder</div>
          </div>
        </div>
        <span className="flex items-center gap-1.5 text-[9px] font-bold tracking-[1px] text-teal-deep">
          <i className="h-1.5 w-1.5 rounded-full bg-teal-deep anim-pulse-soft" />
          {status === "answered" ? "MADE FROM YOUR WORDS" : "ONE LIVE TRY"}
        </span>
      </div>

      <div className="bo-demo-thread flex flex-1 flex-col pt-4" aria-live="polite">
        {status === "idle" && (
          <div className="flex flex-1 flex-col anim-rise">
            <div className="flex items-end gap-2.5">
              <BoFace state="idle" size={34} className="shrink-0" />
              <div className="max-w-[88%] rounded-[16px] rounded-bl-[4px] bg-cream-warm px-3.5 py-3 text-[13px] leading-[1.48]">
                Tell me the idea exactly as it lives in your head. Rough is better.
              </div>
            </div>
            <form onSubmit={submit} className="mt-5 flex flex-1 flex-col">
              <label htmlFor="bo-demo-message" className="text-[10px] font-bold tracking-[1px] text-ink-40">YOUR MESSY VERSION</label>
              <div className="bo-demo-input mt-2 flex-1">
                <textarea
                  id="bo-demo-message"
                  autoComplete="off"
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  maxLength={420}
                  placeholder="I want to build… The people I want to help are… I am stuck because…"
                />
              </div>
              <div className="mt-2 flex items-center justify-between text-[10px] text-ink-40">
                <span>No polished pitch needed</span><span>{input.length}/420</span>
              </div>
              <button type="submit" disabled={input.trim().length < 12} className="spring mt-4 rounded-[15px] border-none bg-yellow px-5 py-4 text-[14px] font-bold text-ink shadow-btn-yellow disabled:cursor-default disabled:opacity-40">
                Show me Bo’s first move →
              </button>
            </form>
          </div>
        )}

        {status === "thinking" && (
          <div className="flex flex-1 flex-col anim-rise">
            <div className="ml-auto max-w-[88%] rounded-[16px] rounded-br-[4px] bg-ink px-3.5 py-3 text-[12px] leading-[1.45] text-cream">
              {message}
            </div>
            <div className="mt-5 flex items-center gap-3">
              <BoFace state="thinking" size={42} className="shrink-0" />
              <div>
                <div className="text-[14px] font-bold">Bo is turning this into action.</div>
                <div className="mt-1 text-[11px] text-ink-40">Not another list of ideas.</div>
              </div>
            </div>
            <div className="mt-5 grid gap-2">
              {["Finding the real risk", "Drafting the first customer message", "Choosing proof for today"].map((step, index) => (
                <div key={step} className="bo-demo-thinking-step" style={{ animationDelay: `${index * 420}ms` }}>
                  <span>{index + 1}</span>{step}
                </div>
              ))}
            </div>
          </div>
        )}

        {status === "answered" && result && (
          <div className="anim-rise">
            <div className="rounded-[18px] bg-cream-warm p-4">
              <div className="text-[9px] font-extrabold tracking-[1.1px] text-indigo">CO-FOUNDER · WHAT BO SEES</div>
              <p className="mt-2 text-[14px] font-bold leading-[1.42]">{result.summary}</p>
              <p className="mt-2 border-t border-ink-10 pt-2 text-[12px] leading-[1.45] text-ink-60">{result.focus}</p>
            </div>

            <div className="mt-2.5 rounded-[18px] border border-ink-10 bg-white p-4 anim-rise d2">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[9px] font-extrabold tracking-[1.1px] text-teal-deep">CO-FOUNDER · MESSAGE READY</div>
                <button type="button" onClick={() => void copyDraft()} className="border-none bg-transparent text-[10px] font-bold text-indigo">{copied ? "Copied ✓" : "Copy"}</button>
              </div>
              <p className="mt-2 text-[12.5px] leading-[1.5] text-ink-60">“{result.draft}”</p>
            </div>

            <div className="mt-2.5 rounded-[18px] bg-yellow p-4 anim-rise d3">
              <div className="text-[9px] font-extrabold tracking-[1.1px] text-ink-60">COACH · TODAY · {result.minutes} MIN</div>
              <div className="mt-1.5 text-[14px] font-bold leading-[1.35]">{result.action}</div>
              <div className="mt-2 rounded-[10px] bg-white/55 px-3 py-2 text-[11px] font-semibold leading-[1.4]"><span className="text-ink-60">PROOF BO EXPECTS:</span> {result.proof}</div>
            </div>

            <Link href="/start" onClick={continueWithBo} className="spring mt-4 block rounded-[15px] bg-ink px-5 py-4 text-center text-[14px] font-bold text-cream no-underline">
              Make this my Day 1 →
            </Link>
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="text-[9.5px] text-ink-40">Bo builds the full 28 days with you.</span>
              <button type="button" onClick={edit} className="shrink-0 border-none bg-transparent text-[10px] font-bold text-indigo underline underline-offset-2">Edit my idea</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
