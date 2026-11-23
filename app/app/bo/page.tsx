"use client";

// Bo — the coach chat. Backed by /api/coach (DeepSeek when configured,
// deterministic Bo otherwise). Context-rich: idea, fear, day, streak, logs,
// current task and recent learnings. Bo has one identity throughout: coach,
// accountability partner and practical co-founder.

import { useEffect, useRef, useState } from "react";
import { BoBrief } from "@/components/bo-brief";
import { BrandBo } from "@/components/brand-bo";
import { CoachThinking } from "@/components/coach-thinking";
import { authJsonHeaders } from "@/lib/cloud";
import { computeStreak, currentDayOf, missedInARow, useBygga, weekStats } from "@/lib/store";
import { track } from "@/lib/telemetry";
import { playMoment } from "@/lib/feedback";

const SUGGESTIONS_SPRINT = [
  "I'm stuck. What's the smallest next step?",
  "Nobody replied to my messages.",
  "How do I ask for money without being weird?",
  "I want to start a different idea.",
  "I'm scared to send this message.",
  "What should I learn from today's log?",
];

const SUGGESTIONS_CXO = [
  "What should I work on today?",
  "Draft an email to my waitlist.",
  "Check my support inbox.",
  "How are my ads performing?",
  "What's the most important thing to fix?",
  "I need help with pricing.",
];

function formatActionTime(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "the time you chose";
  return new Date(timestamp).toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function BoPage() {
  const s = useBygga();
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const day = currentDayOf(s);
  const week = Math.min(4, Math.ceil(day / 7));
  const streak = computeStreak(s.logs, day);
  const missed = missedInARow(s.logs, day);
  const stats = weekStats(s.tasks, s.logs, week);
  const currentTask = s.tasks.find((t) => t.day === day);
  const isCxo = s.outcome === "shipped";
  const modeLabel = isCxo
    ? "CO-FOUNDER"
    : currentTask?.type === "kill" || day === 14 || day === 28
      ? "CHECKPOINT"
      : "COACH + CO-FOUNDER";
  // Bo's memory: the whole journey in order, so he can refer back to specific
  // days, not just the last few. Capped at the sprint length, so it stays small.
  const recentLogs = Object.values(s.logs)
    .sort((a, b) => a.day - b.day)
    .slice(-28)
    .map((l) => ({ day: l.day, did: l.did, learned: l.learned, proof: l.proof }));
  const recentEvidence = recentLogs
    .filter((log) => Boolean(log.proof?.trim()))
    .slice(-10)
    .map((log) => ({
      day: log.day,
      summary: log.proof!,
      source: "task log",
      status: "self_attested" as const,
    }));

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [s.chat.length, thinking]);

  useEffect(() => {
    void track("coach_viewed", { day, mode: isCxo ? "cxO" : "sprint" });
  }, [day, isCxo]);

  useEffect(() => {
    if (!s.cloudHydratedUserId) return;
    let active = true;
    void (async () => {
      try {
        const res = await fetch("/api/action-requests", { headers: await authJsonHeaders() });
        if (!res.ok || !active) return;
        const data = await res.json();
        for (const action of Array.isArray(data.actions) ? data.actions : []) {
          if (typeof action?.id !== "string" || !["approved", "rejected", "completed", "failed"].includes(action.status)) continue;
          useBygga.getState().updateChatAction(action.id, action.status);
        }
      } catch {
        // The chat remains usable if status reconciliation is temporarily unavailable.
      }
    })();
    return () => { active = false; };
  }, [s.cloudHydratedUserId]);

  if (!s.profile) return null;

  const send = async (text: string) => {
    const msg = text.trim();
    if (!msg || thinking) return;
    setInput("");
    const time = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    s.pushChat({ from: "me", body: msg, time });
    void track("coach_message_sent", { day, mode: day > 28 ? "cxO" : "sprint" });
    setThinking(true);
    try {
      const lastLog = Object.values(s.logs).sort((a, b) => b.day - a.day)[0];
      const res = await fetch("/api/coach", {
        method: "POST",
        headers: await authJsonHeaders(),
        body: JSON.stringify({
          clientRequestId: crypto.randomUUID(),
          message: msg,
          history: s.chat.slice(-10),
          profile: s.profile,
          day,
          week,
          streak,
          missedDays: missed,
          completedThisWeek: stats.done,
          outcome: s.outcome,
          currentTask: currentTask
            ? {
                title: currentTask.title,
                type: currentTask.type,
                minutes: currentTask.minutes,
                proofRequirement: currentTask.verify,
              }
            : undefined,
          currentTaskLog: s.logs[day]
            ? {
                day,
                did: s.logs[day].did,
                learned: s.logs[day].learned,
                proof: s.logs[day].proof,
                proofStatus: "self_attested",
              }
            : undefined,
          commitment: s.intentions[day]
            ? {
                plannedTime: s.intentions[day],
                ifThen: `When it is ${s.intentions[day]}, I will start “${currentTask?.title ?? "today's task"}.”`,
              }
            : undefined,
          recentEvidence,
          recentLogs,
          lastLog: lastLog ? `${lastLog.did} | learned: ${lastLog.learned}` : undefined,
        }),
      });
      const data = await res.json();
      s.pushChat({
        from: "bo",
        body: data.reply ?? "Hm. Say that again?",
        time: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
        actions: Array.isArray(data.actions) ? data.actions : undefined,
      });
      playMoment("reply", { haptics: s.hapticsEnabled, sound: s.soundEnabled });
    } catch {
      s.pushChat({
        from: "bo",
        body: "Connection hiccup. The task doesn't need me though. Go do the thing, log it, and tell me what you learned.",
        time: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
      });
    } finally {
      setThinking(false);
    }
  };

  const decideAction = async (id: string, decision: "approve" | "reject") => {
    if (actionBusy) return;
    setActionBusy(id);
    try {
      const res = await fetch(`/api/action-requests/${encodeURIComponent(id)}/${decision}`, {
        method: "POST",
        headers: await authJsonHeaders(),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.status === "failed" || data.status === "expired" || data.status === "cancelled") s.updateChatAction(id, "failed");
        if (data.status === "completed" || data.status === "approved" || data.status === "rejected") s.updateChatAction(id, data.status);
        s.pushChat({
          from: "bo",
          body: data.error ?? "I couldn't complete that action. Nothing was changed.",
          time: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
        });
        return;
      }
      s.updateChatAction(id, data.status === "completed" ? "completed" : decision === "approve" ? "approved" : "rejected");
    } catch {
      s.pushChat({
        from: "bo",
        body: "I couldn't update that action because the connection dropped. Nothing was changed, so you can try again.",
        time: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
      });
    } finally {
      setActionBusy(null);
    }
  };

  return (
    <div className="flex flex-col" style={{ minHeight: "calc(100dvh - 90px)" }}>
      {/* Header */}
      <div className="px-5 pt-4 pb-3 flex items-center gap-2.5" style={{ borderBottom: "1px solid var(--bygga-ink10)" }}>
        <span className="bo-avatar-orbit shrink-0">
          <BrandBo pose={thinking ? "thinking" : "peek"} size={48} alt="Bo" />
        </span>
        <div className="flex-1">
          <div className="text-[14px] font-bold">Bo</div>
          <div className="text-[11px] font-semibold text-teal-deep">● online · responds in seconds</div>
        </div>
        <div className="text-[10px] font-bold tracking-[0.8px] text-ink-40">{modeLabel} · DAY {day} / 28</div>
      </div>

      {/* Thread */}
      <div className="flex-1 overflow-auto px-5 pt-3.5 pb-24">
        <BoBrief />
        {s.chat.map((m, i) =>
          m.from === "bo" ? (
            <div key={i} className="flex items-end gap-2 mb-2.5">
              <BrandBo pose="peek" size={36} alt="Bo" className="-mb-1 shrink-0" />
              <div className="max-w-[300px] bg-paper border border-ink-10 px-3 py-2.5 text-[13px] leading-[1.45]" style={{ borderRadius: "14px 14px 14px 4px" }}>
                {m.body}
                {m.actions?.map((action) => (
                  <div key={action.id} className="mt-2.5 rounded-xl border border-ink-10 bg-cream p-2.5">
                    <div className="text-[10px] font-bold uppercase tracking-[0.8px] text-ink-40">
                      {action.type === "create_commitment" ? "Commitment" : action.type === "remember_lesson" ? "Memory" : `${action.risk} action`}
                    </div>
                    <div className="mt-0.5 font-bold">{action.title}</div>
                    {action.summary && <div className="mt-1 text-[11px] text-ink-60">{action.summary}</div>}
                    {action.details?.to && <div className="mt-2 text-[11px]"><span className="font-bold">To:</span> {action.details.to}</div>}
                    {action.details?.subject && <div className="text-[11px]"><span className="font-bold">Subject:</span> {action.details.subject}</div>}
                    {action.details?.body && <div className="mt-1 whitespace-pre-wrap rounded-lg bg-paper p-2 text-[11px] text-ink-60">{action.details.body}</div>}
                    {action.details?.scheduledAt && <div className="mt-1 text-[11px]"><span className="font-bold">When:</span> {formatActionTime(action.details.scheduledAt)}</div>}
                    {action.details?.commitmentTitle && <div className="mt-2 text-[11px]"><span className="font-bold">Promise:</span> {action.details.commitmentTitle}</div>}
                    {action.details?.outcome && <div className="mt-1 text-[11px]"><span className="font-bold">Done means:</span> {action.details.outcome}</div>}
                    {action.details?.evidenceRequired && <div className="mt-1 text-[11px]"><span className="font-bold">Proof:</span> {action.details.evidenceRequired}</div>}
                    {action.details?.followUpPolicy && <div className="mt-1 text-[11px]"><span className="font-bold">Bo will:</span> {action.details.followUpPolicy}</div>}
                    {action.status === "pending" ? (
                      <div className="mt-2 flex gap-2">
                        <button type="button" disabled={actionBusy === action.id} onClick={() => decideAction(action.id, "approve")} className="rounded-full bg-ink px-3 py-1.5 text-[11px] font-bold text-cream disabled:opacity-40">
                          {action.type === "create_commitment" ? "Accept commitment" : action.type === "remember_lesson" ? "Remember" : "Approve"}
                        </button>
                        <button type="button" disabled={actionBusy === action.id} onClick={() => decideAction(action.id, "reject")} className="rounded-full border border-ink-20 px-3 py-1.5 text-[11px] font-bold disabled:opacity-40">Reject</button>
                      </div>
                    ) : (
                      <div className="mt-2 text-[10px] font-bold uppercase text-ink-40">{action.status === "preview" ? "Sign in to approve" : action.status}</div>
                    )}
                  </div>
                ))}
                <div className="text-[9px] text-ink-40 mt-1 font-mono">{m.time}</div>
              </div>
            </div>
          ) : (
            <div key={i} className="flex justify-end mb-2.5">
              <div className="max-w-[270px] bg-ink text-cream px-3 py-2.5 text-[13px] leading-[1.45]" style={{ borderRadius: "14px 14px 4px 14px" }}>
                {m.body}
                <div className="text-[9px] mt-1 font-mono" style={{ color: "rgba(250,247,240,0.5)" }}>
                  {m.time}
                </div>
              </div>
            </div>
          )
        )}
        {thinking && (
          <div className="flex items-end gap-2 mb-2.5">
            <CoachThinking compact title="Bo is working on your answer" activeStep={(s.chat.length + day) % 3} steps={["Reading your journey", "Checking today's evidence", "Writing the next move"]} />
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Suggestions */}
      {s.chat.length <= 2 && (
        <div className="px-5 pb-2 flex gap-2 overflow-auto no-scrollbar">
          {(isCxo ? SUGGESTIONS_CXO : SUGGESTIONS_SPRINT).map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => send(q)}
              className="px-3 py-2 rounded-full bg-paper border border-ink-20 text-[12px] font-medium whitespace-nowrap cursor-pointer"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="px-4 pb-3 pt-1">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex items-center gap-2 bg-paper border border-ink-20 rounded-[22px] pl-3.5 pr-2 py-2"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask Bo anything…"
            className="flex-1 bg-transparent border-none outline-none text-[14px] placeholder:text-ink-40"
          />
          <button
            type="submit"
            disabled={!input.trim() || thinking}
            className="w-8 h-8 rounded-full bg-ink text-cream text-[14px] border-none cursor-pointer disabled:opacity-30 flex items-center justify-center"
            aria-label="Send"
          >
            ↑
          </button>
        </form>
      </div>
    </div>
  );
}
