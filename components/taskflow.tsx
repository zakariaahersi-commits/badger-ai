"use client";

// The daily loop, Bo-led. One task → start a focus timer → tell Bo how it
// went. Bo is the one who receives the proof: instead of filling a rigid
// form, you just say what you did (type or talk) and Bo logs it and replies.
// Replaces the did/learned/next form, the "when?" chips, and the separate
// 10-minute timer. The timer length is the task's own time, so no mismatch.

import { useEffect, useState } from "react";
import { BrandBo } from "./brand-bo";
import { CoachThinking } from "./coach-thinking";
import { VoiceTextArea } from "./voice";
import { PrimaryButton } from "./ui";
import { authJsonHeaders } from "@/lib/cloud";
import { playMoment } from "@/lib/feedback";
import { useBygga } from "@/lib/store";
import { track } from "@/lib/telemetry";
import type { SprintTask } from "@/lib/types";

type Phase = "focus" | "tell" | "reply";

export function TaskFlow({
  task,
  coachBody,
  onComplete,
  onClose,
}: {
  task: SprintTask;
  // everything /api/coach needs except the message, so Bo replies in context
  coachBody: Record<string, unknown>;
  onComplete: (message: string, proof: string, learned?: string) => void;
  onClose: () => void;
}) {
  const preferences = useBygga();
  const [phase, setPhase] = useState<Phase>("focus");
  const [left, setLeft] = useState(task.minutes * 60);
  const [running, setRunning] = useState(true);
  const [message, setMessage] = useState("");
  const [proof, setProof] = useState("");
  const [boReply, setBoReply] = useState("");
  const [learned, setLearned] = useState("");
  const [thinking, setThinking] = useState(false);
  // Outreach / ask / call tasks are the verifiable ones. Proof is required so
  // "done" always means something real happened, not just a claim.
  const needsProof = task.type === "market" || task.type === "revenue" || task.type === "call";

  useEffect(() => {
    if (phase !== "focus" || !running) return;
    if (left <= 0) return;
    const iv = setInterval(() => setLeft((l) => Math.max(0, l - 1)), 1000);
    return () => clearInterval(iv);
  }, [phase, running, left]);

  useEffect(() => {
    if (phase !== "tell") return;
    void track("evidence_prompt_viewed", { day: task.day, task_type: task.type, proof_required: needsProof });
  }, [phase, task.day, task.type, needsProof]);

  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");
  const progress = 1 - left / (task.minutes * 60);
  const timeUp = left === 0;
  const sendToBo = async () => {
    if (!message.trim() || thinking) return;
    if (proof.trim()) {
      void track("evidence_added", { day: task.day, task_type: task.type, source: /^https?:\/\//i.test(proof.trim()) ? "url" : "reference" });
      playMoment("proof", { haptics: preferences.hapticsEnabled, sound: preferences.soundEnabled });
    }
    setPhase("reply");
    setThinking(true);
    try {
      // If the proof is a link, run the URL verifier first. This checks the
      // public page but does not independently prove the user's claimed action.
      let proofLine = proof.trim()
        ? `\n\nProof attached to my report: ${proof.trim()}\n(This is self-attested unless an independent verifier says otherwise. If it's thin or missing the ask, say so honestly.)`
        : `\n\n(I didn't attach any proof to this report.)`;
      let proofStatus: "self_attested" | "pending" | "rejected" = "self_attested";
      if (/^https?:\/\//i.test(proof.trim())) {
        try {
          const v = await fetch("/api/verify-proof", {
            method: "POST",
            headers: await authJsonHeaders(),
            body: JSON.stringify({ url: proof.trim(), taskTitle: task.title, claim: message, day: task.day, claimType: task.type }),
          }).then((r) => r.json());
          if (v.reachable && v.verdict && v.verdict !== "unverified") {
            proofStatus = v.verdict === "mismatch" ? "rejected" : "pending";
            proofLine = `\n\nProof attached to my report: ${proof.trim()}\n(The URL check returned: ${v.verdict}${v.note ? `, ${v.note}` : ""}. Treat this as a URL check, not independent proof that the claimed action happened.)`;
          } else if (!v.reachable) {
            proofLine = `\n\nProof attached to my report: ${proof.trim()}\n(The link isn't publicly viewable. Treat my description as self-attested and ask for a screenshot if it matters.)`;
          }
        } catch {
          /* verification is best-effort; Bo still reacts to the claim */
        }
      }
      const res = await fetch("/api/coach", {
        method: "POST",
        headers: await authJsonHeaders(),
        body: JSON.stringify({
          ...coachBody,
          currentTaskLog: { day: task.day, did: message.trim(), learned: "", proof: proof.trim(), proofStatus },
          clientRequestId: crypto.randomUUID(),
          message: `I just finished today's task: "${task.title}". Here's what happened: ${message}${proofLine}`,
        }),
      });
      const data = await res.json();
      setBoReply(data.reply || "I have your report. Tap Done for today to save it to your progress.");
      playMoment("reply", { haptics: preferences.hapticsEnabled, sound: preferences.soundEnabled });
    } catch {
      setBoReply("The connection hiccuped, but your report is still here. Tap Done for today to save it.");
    } finally {
      setThinking(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-peach">
      <div className="mx-auto flex min-h-[100svh] w-full max-w-[480px] flex-col px-5 pt-[max(20px,env(safe-area-inset-top))] min-[360px]:px-6" style={{ paddingBottom: "max(28px, env(safe-area-inset-bottom))" }}>
        {/* header: task + close */}
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <div className="text-[11px] font-bold tracking-[1px] text-ink-60">TODAY · {task.minutes} MIN</div>
            <div className="text-[18px] font-bold leading-[1.25] mt-0.5">{task.title}</div>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-full bg-ink-10 border-none text-[16px] cursor-pointer shrink-0" aria-label="Close">
            ×
          </button>
        </div>

        {phase === "focus" && (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-6">
            <BrandBo pose={timeUp ? "celebrate" : "front"} size={118} alt={timeUp ? "Bo celebrating" : "Bo focusing with you"} className={timeUp ? "moment-bo-pop" : ""} />
            <div>
              <div className="text-[11px] font-bold tracking-[1.4px] text-ink-60 uppercase">{timeUp ? "Time's up" : "Heads down"}</div>
              <div className="badger-number mt-2 text-[72px] font-bold leading-none tracking-[-3px]">{mm}:{ss}</div>
            </div>
            <div className="w-full max-w-[280px] h-2.5 bg-ink-10 rounded-full overflow-hidden">
              <div className="h-full bg-yellow rounded-full transition-all duration-1000" style={{ width: `${progress * 100}%` }} />
            </div>
            <p className="text-[14px] text-ink-60 leading-[1.5] max-w-[290px]">
              {timeUp
                ? "However far you got, it counts. Tell Bo what happened."
                : "Do the task. The timer is just here to keep you company. Stop whenever you're done."}
            </p>
            <div className="w-full max-w-[320px] flex flex-col gap-2.5">
              <PrimaryButton onClick={() => setPhase("tell")}>
                {timeUp ? "Tell Bo how it went →" : "I'm done · tell Bo →"}
              </PrimaryButton>
              {!timeUp && (
                <button type="button" onClick={() => setRunning((r) => !r)} className="spring w-full py-3 rounded-[14px] border-[1.5px] border-ink-20 bg-transparent text-[14px] font-semibold cursor-pointer">
                  {running ? "Pause" : "Resume"}
                </button>
              )}
            </div>
          </div>
        )}

        {phase === "tell" && (
          <div className="flex min-h-0 flex-1 flex-col pt-6">
            <div className="flex items-end gap-2.5 mb-4">
              <BrandBo pose="thinking" size={56} alt="Bo" />
              <div className="bg-paper border border-ink-10 rounded-[14px] rounded-bl-[4px] px-3.5 py-3 text-[14px] leading-[1.45] shadow-card">
                Nice. How did it go? Tell me what you did, what you found out, anything. Type it or tap the mic.
              </div>
            </div>
            <VoiceTextArea autoFocus value={message} onChange={setMessage} placeholder="Just say what happened. A sentence is plenty." />
            <div className="mt-3">
              <input
                value={proof}
                onChange={(e) => setProof(e.target.value)}
                placeholder={needsProof ? "Proof: paste the link, @handle, or screenshot URL" : "Proof link, @handle, or screenshot URL (optional)"}
                className="w-full px-3.5 py-3 text-[14px] border-[1.5px] rounded-[12px] bg-paper outline-none focus:border-ink placeholder:text-ink-20"
                style={{ borderColor: needsProof && !proof.trim() ? "var(--bygga-yellow-deep)" : "var(--bygga-ink20)" }}
              />
              {task.verify && (
                <div className="mt-1.5 px-0.5 text-[11.5px] text-ink-40 leading-[1.35]">
                  {needsProof && !proof.trim() ? <span className="font-semibold text-ink-60">This one needs proof to count. </span> : null}
                  Counts as proof: {task.verify}
                </div>
              )}
            </div>
            <div className="flex-1 min-h-4" />
            <PrimaryButton onClick={sendToBo} disabled={!message.trim() || (needsProof && !proof.trim())}>Send to Bo →</PrimaryButton>
          </div>
        )}

        {phase === "reply" && (
          <div className="flex min-h-0 flex-1 flex-col pt-6">
            <div className="flex justify-end mb-3">
              <div className="max-w-[78%] bg-ink text-cream rounded-[14px] rounded-br-[4px] px-3.5 py-2.5 text-[13.5px] leading-[1.45]">{message}</div>
            </div>
            <div className="flex items-end gap-2.5">
              <BrandBo pose={thinking ? "thinking" : "celebrate"} size={56} alt="Bo" />
              <div className="bg-paper border border-ink-10 rounded-[14px] rounded-bl-[4px] px-3.5 py-3 text-[14px] leading-[1.45] shadow-card min-w-[80px]">
                {thinking ? "I’m checking this against today’s step." : boReply}
              </div>
            </div>
            {thinking && <div className="mt-3"><CoachThinking compact title="Bo is reading your result" activeStep={1} steps={["Reading your report", "Checking the proof", "Writing your feedback"]} /></div>}
            {/* Bo asked; let them actually answer. Whatever they write here is
                saved as the day's lesson — a coach who asks must listen. */}
            {!thinking && (
              <input
                value={learned}
                onChange={(e) => setLearned(e.target.value)}
                placeholder="Answer Bo — what did you learn? (saved to your log)"
                className="mt-3 w-full px-3.5 py-3 text-[14px] border-[1.5px] border-ink-20 rounded-[12px] bg-paper outline-none focus:border-ink placeholder:text-ink-20"
              />
            )}
            <div className="flex-1 min-h-4" />
            {!thinking && (
              <PrimaryButton onClick={() => onComplete(message, proof, learned.trim())}>Done for today →</PrimaryButton>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
