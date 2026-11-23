"use client";

// Today — the daily home. One task, the streak, Bo's note, the log sheet.

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BrandBo } from "@/components/brand-bo";
import { CountUp } from "@/components/countup";
import { GuidedTour } from "@/components/guided-tour";
import { IconChip, IconFlame, IconVote } from "@/components/icons";
import { Avatar, Pill, PrimaryButton } from "@/components/ui";
import { TaskFlow } from "@/components/taskflow";
import { authJsonHeaders, demoMode } from "@/lib/cloud";
import { shareCard } from "@/lib/sharecard";
import { BADGES } from "@/lib/badges";
import { todayCoachNote } from "@/lib/coach";
import { TASK_TYPE_META } from "@/lib/plan";
import { computeStreak, currentDayOf, missedInARow, useBygga, weekStats } from "@/lib/store";
import { track } from "@/lib/telemetry";
import { playMoment } from "@/lib/feedback";
import { sprintDaysAfterToday, sprintEndDate } from "@/lib/sprint-calendar";
import { IMessageConnect } from "@/components/imessage-connect";

export default function TodayPage() {
  const router = useRouter();
  const s = useBygga();
  const [celebrate, setCelebrate] = useState<{ badges: string[]; did?: string } | null>(null);
  const [flowOpen, setFlowOpen] = useState(false);
  const firstTaskHandoff = useRef(false);

  // After onboarding, only week 1 is AI-made. Generate the full plan in the
  // background and swap in days 8-28 (never overwriting a day already logged).
  useEffect(() => {
    if (!s.planPartial || !s.profile) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profile: s.profile }),
        });
        const data = await res.json();
        if (!cancelled && Array.isArray(data.plan) && data.plan.length === 28) {
          s.upgradePlan(data.plan);
        }
      } catch {
        /* keep the partial plan; it still works */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.planPartial]);

  // Bo initiates: once per day (from day 2), Bo opens the chat with a
  // check-in that holds them to yesterday, before they say anything.
  useEffect(() => {
    if (!s.onboarded || !s.profile) return;
    const d = currentDayOf(s);
    if (d <= 1 || d > 28 || s.lastCheckinDay >= d) return;
    const y = s.logs[d - 1];
    const missedNow = missedInARow(s.logs, d);
    if (!y && missedNow < 1) return;
    s.markCheckin(d); // mark first so a double mount can't send twice
    const todayTask = s.tasks.find((t) => t.day === d);
    const prompt = y
      ? `(Proactive morning check-in, day ${d}. Yesterday I logged: "${y.did}"${y.learned ? ` and learned: "${y.learned}"` : ""}. Today's task: "${todayTask?.title ?? "my next task"}". Open the conversation: hold me to yesterday, connect it to today, one sharp line, max 2 sentences.)`
      : `(Proactive morning check-in, day ${d}. I haven't logged anything for ${missedNow} day${missedNow === 1 ? "" : "s"}. Today's task: "${todayTask?.title ?? "my next task"}". Open the conversation: name the quiet honestly without shaming me, make today feel small and doable, max 2 sentences.)`;
    (async () => {
      try {
        const res = await fetch("/api/coach", {
          method: "POST",
          headers: await authJsonHeaders(),
          body: JSON.stringify({
            clientRequestId: crypto.randomUUID(),
            message: prompt,
            profile: s.profile,
            day: d,
            streak: computeStreak(s.logs, d),
            missedDays: missedNow,
            completedThisWeek: 0,
            currentTask: todayTask
              ? {
                  title: todayTask.title,
                  type: todayTask.type,
                  minutes: todayTask.minutes,
                  proofRequirement: todayTask.verify,
                }
              : undefined,
            commitment: s.intentions[d]
              ? {
                  plannedTime: s.intentions[d],
                  ifThen: `When it is ${s.intentions[d]}, I will start “${todayTask?.title ?? "today's task"}.”`,
                }
              : undefined,
          }),
        });
        const data = await res.json();
        if (typeof data.reply === "string" && data.reply) {
          s.pushChat({
            from: "bo",
            body: data.reply,
            time: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
            actions: Array.isArray(data.actions) ? data.actions : undefined,
          });
        }
      } catch {
        /* no check-in today; tomorrow's another chance */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.onboarded]);

  const day = currentDayOf(s);
  const week = Math.min(4, Math.ceil(day / 7));
  const task = s.tasks.find((t) => t.day === day);
  const log = s.logs[day];
  const streak = computeStreak(s.logs, day);
  const missed = missedInARow(s.logs, day);
  const stats = weekStats(s.tasks, s.logs, week);
  const daysAfterToday = sprintDaysAfterToday(day);
  const endDate = sprintEndDate(s.planStart)?.toLocaleDateString([], { month: "short", day: "numeric" }) ?? "";
  const displayDate = new Date();
  displayDate.setDate(displayDate.getDate() + s.demoDayOffset);

  useEffect(() => {
    if (!task) return;
    void track("today_task_viewed", { day, task_type: task.type, minutes: task.minutes });
  }, [day, task]);

  // Checkout returns directly into the first useful action. Removing the
  // query keeps refresh/back from repeatedly reopening the task.
  useEffect(() => {
    if (!task || log || firstTaskHandoff.current || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("first_task") !== "1") return;
    firstTaskHandoff.current = true;
    window.history.replaceState({}, "", "/app");
    void track("task_started", { day, task_type: task.type, minutes: task.minutes, source: "checkout_handoff" });
    const timer = window.setTimeout(() => setFlowOpen(true), 0);
    return () => window.clearTimeout(timer);
  }, [day, log, task]);

  const note = useMemo(
    () =>
      s.profile
        ? todayCoachNote({
            profile: s.profile,
            day,
            week,
            streak,
            missedDays: missed,
            taskType: task?.type ?? "build",
          })
        : "",
    [s.profile, day, week, streak, missed, task?.type]
  );

  if (!s.profile || !task) return null;
  const meta = TASK_TYPE_META[task.type];
  const isCheckpoint = task.type === "kill";

  return (
    <div className="px-4 pt-4 flex flex-col gap-3 min-[360px]:px-5">
      {/* Header */}
      <div className="flex items-end justify-between gap-3 px-0 pt-1 pb-1">
        {/* GO Club move: the day count is the emotional anchor of a 28-day
            sprint, so it gets the giant-numeral treatment; the mood line
            whispers underneath. */}
        <div>
          <div className="text-[11px] font-bold tracking-[1.4px] uppercase text-ink-60">
            {displayDate.toLocaleDateString([], { weekday: "short" })} · {log ? "done for today" : isCheckpoint ? "decision day" : "one thing today"}
          </div>
          <div className="font-serif text-[44px] font-semibold tracking-[-1.5px] leading-[1.02]">
            Day {day}<span className="text-[20px] text-ink-40 font-sans font-bold tracking-[-0.3px]"> / 28</span>
          </div>
          <div className="mt-1 text-[11px] font-semibold text-ink-40">
            {day === 28 ? "Final day" : `${daysAfterToday} calendar days after today`} · ends {endDate}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <DemoControls />
          <Link href="/app/profile" className="border-none bg-transparent p-0 cursor-pointer" aria-label="Profile and settings">
            <Avatar initial={s.profile.name[0]?.toUpperCase()} src={s.profile.avatarUrl} />
          </Link>
        </div>
      </div>

      {/* Hero task */}
      {isCheckpoint && !log ? (
        <div data-tour="today-task" className="rounded-2xl p-[18px] text-cream anim-rise d1" style={{ background: "#1A1A1A", border: "1.5px solid #EF4444" }}>
          <Pill bg="#EF4444" color="white">
            ⚠ {day === 14 ? "DECISION DAY" : "LAUNCH DAY"}
          </Pill>
          <div className="mt-2.5 text-[22px] font-bold leading-[1.2] tracking-[-0.5px]">{task.title}</div>
          <div className="mt-2.5 text-[13px] leading-[1.45]" style={{ color: "rgba(250,247,240,0.7)" }}>
            {task.detail}
          </div>
          <Receipts />
          <button
            type="button"
            onClick={() => router.push(`/app/outcome?day=${day}`)}
            className="mt-3.5 w-full py-3.5 rounded-[10px] border-none bg-yellow text-ink text-[15px] font-bold cursor-pointer"
          >
            Open the checkpoint →
          </button>
        </div>
      ) : (
        <div data-tour="today-task" className="bg-ink text-cream rounded-2xl p-[18px] relative overflow-hidden anim-rise d1">
          <div className="flex items-center gap-2 mb-2.5 flex-wrap">
            <Pill bg="var(--bygga-yellow)" color="#1A1A1A">
              Today · {task.minutes} min
            </Pill>
            <Pill bg={meta.bg} color={meta.color}>
              {meta.label}
            </Pill>
            {log && (
              <Pill bg="rgba(76,175,130,0.25)" color="#7BD4A8">
                ✓ Logged
              </Pill>
            )}
          </div>
          <div className="text-[21px] font-bold leading-[1.22] tracking-[-0.5px] [text-wrap:balance]">{task.title}</div>
          <div className="mt-2.5 text-[12.5px] leading-[1.45]" style={{ color: "rgba(250,247,240,0.65)" }}>
            {task.detail}
          </div>
          <div className="mt-3 rounded-[10px] px-3 py-2.5 text-[12px] leading-[1.4]" style={{ background: "rgba(255,255,255,0.07)", color: "rgba(250,247,240,0.82)" }}>
            <span className="font-bold text-yellow">WHAT COUNTS</span> {task.verify}
          </div>
          {!log ? (
            <>
              <WhenChips planned={s.intentions[day]} onPick={(t) => s.setIntention(day, t)} />
              <button
                type="button"
                onClick={() => {
                  void track("task_started", { day, task_type: task.type, minutes: task.minutes });
                  playMoment("start", { haptics: s.hapticsEnabled, sound: s.soundEnabled });
                  setFlowOpen(true);
                }}
                className="mt-3 w-full py-3.5 px-3.5 rounded-[12px] border-none bg-yellow text-ink text-[15px] font-bold cursor-pointer"
              >
                Start today&apos;s step →
              </button>
            </>
          ) : (
            <>
              <div className="mt-3.5 px-3 py-2.5 rounded-[10px] text-[12.5px] leading-[1.4]" style={{ background: "rgba(76,175,130,0.12)", border: "1px solid rgba(76,175,130,0.3)" }}>
                <span className="font-bold text-teal">Done {new Date(log.loggedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.</span>{" "}
                <span style={{ color: "rgba(250,247,240,0.8)" }}>&quot;{log.did}&quot;</span>
              </div>
              {(() => {
                const tomorrow = s.tasks.find((t) => t.day === day + 1);
                return tomorrow ? (
                  <div className="mt-2 px-3 py-2.5 rounded-[10px] text-[12px] leading-[1.4]" style={{ background: "rgba(255,255,255,0.06)" }}>
                    <span className="font-bold text-yellow">TOMORROW</span>{" "}
                    <span style={{ color: "rgba(250,247,240,0.75)" }}>{tomorrow.title}</span>
                  </div>
                ) : null;
              })()}
            </>
          )}
        </div>
      )}

      <IMessageConnect />

      {/* One contextual Bo presence. Help stays close without competing with the task. */}
      <Link href="/app/bo" onClick={() => void track("bo_help_opened", { day, surface: "today" })} className="spring flex min-h-16 items-center gap-3 rounded-[18px] border border-ink-10 bg-paper px-3.5 py-3 text-ink no-underline shadow-card anim-rise d2">
        <BrandBo pose="peek" size={58} alt="Bo" className="-my-2" />
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] font-semibold leading-[1.35]">{note || "Need help with today’s step?"}</div>
          <div className="mt-0.5 text-[11.5px] text-ink-60">Ask Bo to explain, research or draft with you.</div>
        </div>
        <span className="shrink-0 text-[12px] font-bold">Ask Bo →</span>
      </Link>

      {flowOpen && task && (
        <TaskFlow
          task={task}
          coachBody={{
            profile: s.profile,
            day,
            week,
            streak,
            missedDays: missed,
            completedThisWeek: stats.done,
            currentTask: {
              title: task.title,
              type: task.type,
              minutes: task.minutes,
              proofRequirement: task.verify,
            },
            commitment: s.intentions[day]
              ? {
                  plannedTime: s.intentions[day],
                  ifThen: `When it is ${s.intentions[day]}, I will start “${task.title}.”`,
                }
              : undefined,
            recentLogs: Object.values(s.logs)
              .sort((a, b) => a.day - b.day)
              .slice(-28)
              .map((entry) => ({
                day: entry.day,
                did: entry.did,
                learned: entry.learned,
                proof: entry.proof,
              })),
            recentEvidence: Object.values(s.logs)
              .filter((entry) => Boolean(entry.proof?.trim()))
              .slice(-10)
              .map((entry) => ({
                day: entry.day,
                summary: entry.proof!,
                source: "task log",
                status: "self_attested",
              })),
          }}
          onClose={() => setFlowOpen(false)}
          onComplete={async (msg, proof, learned) => {
            const earned = s.logTask(day, { did: msg, learned: learned ?? "", next: "", proof });
            const feedbackMoment = earned.includes("first-paying-user")
              ? "payment"
              : earned.length > 0 || day % 7 === 0
                ? "milestone"
                : "finish";
            playMoment(feedbackMoment, { haptics: s.hapticsEnabled, sound: s.soundEnabled });
            void track("task_completed", { day, task_type: task.type, has_proof: Boolean(proof) });
            for (const badge of earned) void track("achievement_unlocked", { badge, day });
            // Anonymized cross-user learning signal (no PII): a task got done.
            void fetch("/api/learn", {
              method: "POST",
              headers: await authJsonHeaders(),
              body: JSON.stringify({ track: s.profile?.track, taskType: task.type, day, outcome: "progress" }),
            }).catch(() => {});
            setFlowOpen(false);
            setCelebrate({ badges: earned, did: msg });
          }}
        />
      )}

      {celebrate && (
        <CelebrationOverlay
          name={s.profile.name}
          day={day}
          streak={computeStreak(s.logs, day)}
          votes={Object.keys(s.logs).length}
          badgeIds={celebrate.badges}
          tomorrow={s.tasks.find((t) => t.day === day + 1) ?? null}
          did={celebrate.did}
          onClose={() => setCelebrate(null)}
        />
      )}
      <GuidedTour />
    </div>
  );
}

// Full-screen reward moment — the loop must close with a celebration,
// not a form submission (Duolingo/Runna pattern).
function CelebrationOverlay({
  name,
  day,
  streak,
  votes,
  badgeIds,
  tomorrow,
  did,
  onClose,
}: {
  name: string;
  day: number;
  streak: number;
  votes: number;
  badgeIds: string[];
  tomorrow: { title: string; minutes: number } | null;
  did?: string;
  onClose: () => void;
}) {
  const badge = badgeIds.length ? BADGES.find((b) => b.id === badgeIds[0]) : null;
  const milestone = streak === 7 || streak === 14 || streak === 28;
  const [shareState, setShareState] = useState<"idle" | "busy" | "done">("idle");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-peach">
      <div className="w-full max-w-[480px] min-h-dvh flex flex-col items-center justify-center px-8 py-10 text-center relative overflow-hidden">
        {/* confetti dots */}
        {Array.from({ length: 18 }).map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full anim-pop"
            style={{
              width: 8 + (i % 3) * 4,
              height: 8 + (i % 3) * 4,
              left: `${(i * 53) % 100}%`,
              top: `${(i * 37) % 60}%`,
              background: ["var(--bygga-yellow)", "var(--bygga-teal)", "var(--bygga-red)", "var(--bygga-ink20)"][i % 4],
              animationDelay: `${(i % 6) * 0.08}s`,
              opacity: 0.85,
            }}
          />
        ))}

        <div className="relative grid h-[230px] w-full place-items-center overflow-hidden rounded-[28px] bg-cobalt-grad shadow-glass anim-pop">
          <span className="absolute h-[190px] w-[190px] rounded-full border border-white/20" aria-hidden="true" />
          <BrandBo pose="celebrate" size={220} alt="Bo celebrating with you" className="relative z-10 translate-y-3" />
        </div>

        <h1 className="font-serif text-[34px] font-semibold tracking-[-0.8px] leading-[1.05] mt-6 anim-rise">
          {badge?.id === "first-paying-user" ? "A customer paid." : day === 1 ? `You started, ${name}.` : "Done. Logged. Real."}
        </h1>
        <p className="mt-2.5 text-[15px] text-ink-60 leading-[1.45] max-w-[290px] anim-rise d1">
          {badge?.id === "first-paying-user"
            ? "This is a real market signal. Save the proof and learn why they chose you."
            : day === 1
            ? "Most people never send the first message. You just did."
            : "Another vote for the person who builds."}
        </p>

        {/* streak + votes */}
        <div className="mt-7 flex gap-3 w-full anim-rise d2">
          <div
            className={`flex-1 rounded-2xl px-4 py-4 ${milestone ? "bg-yellow shadow-btn-yellow" : "bg-paper border border-ink-10"}`}
          >
            <div className="flex justify-center"><IconChip icon={IconFlame} tint="yellow" size={46} /></div>
            <div className="badger-number mt-1.5 text-[28px] font-bold tracking-[-1px]"><CountUp value={streak} /></div>
            <div className="text-[10px] font-bold tracking-[0.8px] text-ink-60 mt-0.5">
              {milestone ? "MILESTONE STREAK!" : "DAY STREAK"}
            </div>
          </div>
          <div className="flex-1 rounded-2xl px-4 py-4 bg-paper border border-ink-10">
            <div className="flex justify-center"><IconChip icon={IconVote} tint="lilac" size={46} /></div>
            <div className="badger-number mt-1.5 text-[28px] font-bold tracking-[-1px]"><CountUp value={votes} duration={1200} /></div>
            <div className="text-[10px] font-bold tracking-[0.8px] text-ink-60 mt-0.5">BUILDER VOTES</div>
          </div>
        </div>

        {/* progress to day 28 */}
        <div className="mt-4 w-full anim-rise d3">
          <div className="flex justify-between text-[10px] font-bold tracking-[0.6px] text-ink-40 mb-1.5">
            <span>DAY {day}</span>
            <span>LAUNCH DAY · 28</span>
          </div>
          <div className="h-2.5 bg-ink-10 rounded-full overflow-hidden">
            <div className="h-full bg-yellow rounded-full anim-grow" style={{ width: `${(day / 28) * 100}%`, animationDelay: "0.4s" }} />
          </div>
        </div>

        {badge && (
          <div className="mt-4 w-full px-4 py-3.5 bg-ink text-cream rounded-2xl flex items-center gap-3 anim-pop d4">
            <span className="text-[28px]">{badge.emoji}</span>
            <div className="text-left">
              <div className="text-[10px] font-bold tracking-[1px] text-yellow">PERSONAL RECORD UNLOCKED</div>
              <div className="text-[15px] font-bold">{badge.name}</div>
            </div>
          </div>
        )}

        {tomorrow && (
          <div className="mt-4 w-full px-4 py-3 bg-cream-warm rounded-xl text-left anim-rise d5">
            <div className="text-[10px] font-bold tracking-[0.8px] text-ink-60">TOMORROW · {tomorrow.minutes} MIN</div>
            <div className="text-[13px] font-semibold mt-0.5 leading-[1.3]">{tomorrow.title}</div>
          </div>
        )}

        <div className="mt-7 w-full anim-rise d6 flex flex-col gap-2.5">
          <PrimaryButton onClick={onClose}>
            {tomorrow ? "See you tomorrow →" : "Done"}
          </PrimaryButton>
          {did && (
            <button
              type="button"
              onClick={async () => {
                setShareState("busy");
                const r = await shareCard({ kind: "day", day, streak, did });
                if (r !== "failed") void track("launch_receipt_shared", { kind: "day", day, method: r });
                setShareState(r === "failed" ? "idle" : "done");
              }}
              className="w-full py-3 rounded-[14px] border-[1.5px] border-ink-20 bg-transparent text-ink text-[14px] font-bold cursor-pointer"
            >
              {shareState === "busy" ? "Making your receipt…" : shareState === "done" ? "Launch receipt ready ✓" : "Share my launch receipt"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Implementation-intention prompt (Gollwitzer if-then). A one-tap "when
// today?" before the timer roughly triples follow-through — the mechanic
// /method sells, kept light so it never blocks starting.
function WhenChips({
  planned,
  onPick,
}: {
  planned: string | undefined;
  onPick: (time: string) => void;
}) {
  const OPTS = ["Morning", "Lunch", "After work", "Tonight"];
  return (
    <div className="mt-3.5">
      <div className="text-[10.5px] font-bold tracking-[0.5px]" style={{ color: "rgba(250,247,240,0.55)" }}>
        WHEN TODAY?
      </div>
      <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
        {OPTS.map((t) => {
          const on = planned === t;
          return (
            <button
              key={t}
              type="button"
              onClick={() => onPick(t)}
              className="min-h-11 px-3 py-2 rounded-full text-[11px] font-bold cursor-pointer transition-colors"
              style={{
                background: on ? "var(--bygga-yellow)" : "rgba(255,255,255,0.08)",
                color: on ? "var(--bygga-ink)" : "rgba(250,247,240,0.75)",
                border: "none",
              }}
            >
              {on ? `✓ ${t}` : t}
            </button>
          );
        })}
      </div>
      {planned && (
        <div className="mt-2 text-[11.5px] italic leading-[1.4]" style={{ color: "rgba(250,247,240,0.6)" }}>
          If I hesitate {planned.toLowerCase() === "tonight" ? "tonight" : `at ${planned.toLowerCase()}`}, I start the timer anyway.
        </div>
      )}
    </div>
  );
}

// Receipts mini-table shown inside checkpoint cards.
function Receipts() {
  const s = useBygga();
  const day = currentDayOf(s);
  const logged = Object.values(s.logs).filter((l) => l.day <= day);
  const withProof = logged.filter((l) => l.proof?.trim());
  const rows: [string, string][] = [
    ["Days showed up", `${logged.length} / ${day}`],
    ["Evidence added", `${withProof.length}`],
    ["Outreach logged", `${logged.filter((l) => /dm|message|sent|email|call|ask/i.test(l.did)).length}`],
    ["Asks for money", `${logged.filter((l) => /pay|price|\$|charge/i.test(l.did + l.learned)).length}`],
  ];
  return (
    <div className="mt-3.5 flex flex-col gap-1 text-[12.5px] font-mono">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-3">
          <span style={{ color: "rgba(250,247,240,0.6)" }}>{k}</span>
          <span className="font-bold">{v}</span>
        </div>
      ))}
    </div>
  );
}

// Demo time-travel — lets you preview Day 14 / Day 28 without waiting.
// Hidden for real users via the shared demoMode flag.
function DemoControls() {
  const { advanceDay, demoDayOffset } = useBygga();
  const isUgcPreview = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("preview") === "ugc";
  if (!demoMode || isUgcPreview) return null;
  return (
    <button
      type="button"
      onClick={() => advanceDay(1)}
      title="Demo: advance one day"
      className="h-8 px-2.5 rounded-full border border-ink-20 bg-paper text-[11px] font-bold text-ink-60 cursor-pointer flex items-center gap-1"
    >
      ⏩{demoDayOffset > 0 ? ` +${demoDayOffset}d` : ""}
    </button>
  );
}
