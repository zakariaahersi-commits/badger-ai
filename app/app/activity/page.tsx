"use client";

// Activity — weekly chart, the receipt log, and Personal Records.

import Link from "next/link";
import { useState } from "react";
import { Avatar, Card, Pill } from "@/components/ui";
import { BrandBo } from "@/components/brand-bo";
import { AchievementMedal } from "@/components/achievement-medal";
import { CommunityKnowledge } from "@/components/community-knowledge";
import { CountUp } from "@/components/countup";
import { BADGES } from "@/lib/badges";
import { TASK_TYPE_META } from "@/lib/plan";
import { computeStreak, currentDayOf, useBygga } from "@/lib/store";
import { sprintDaysAfterToday, sprintEndDate } from "@/lib/sprint-calendar";

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function ActivityPage() {
  const s = useBygga();
  const [tab, setTab] = useState<"performance" | "locker" | "records">(() =>
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("tab") === "records"
      ? "records"
      : "performance"
  );
  const [selectedBadge, setSelectedBadge] = useState<string | null>(null);
  const day = currentDayOf(s);
  const week = Math.min(4, Math.ceil(day / 7));
  const streak = computeStreak(s.logs, day);
  const logs = Object.values(s.logs).sort((a, b) => b.day - a.day);

  if (!s.profile) return null;

  const proofs = logs.filter((l) => l.proof?.trim()).length;
  const evidenceLogs = logs.filter((l) => l.proof?.trim());
  const builderLevel = Math.min(4, Math.floor(logs.length / 7) + 1);
  const levelProgress = ((logs.length % 7) / 7) * 100;
  const weekDayIndex = (day - 1) % 7;
  const endDate = sprintEndDate(s.planStart)?.toLocaleDateString([], { month: "short", day: "numeric" }) ?? "";

  return (
    <div className="px-5 pt-4 flex flex-col gap-3">
      <div className="flex items-end justify-between pt-1 pb-1">
        <div>
          <div className="text-[11px] font-bold tracking-[1.4px] uppercase text-ink-60 mb-0.5">
            Day {day} of 28 · {sprintDaysAfterToday(day)} days after today
          </div>
          <div className="text-[22px] font-bold tracking-[-0.5px]">Your progress.</div>
          <div className="mt-0.5 text-[11px] text-ink-40">The challenge ends {endDate}</div>
        </div>
        <Link href="/app/profile" aria-label="Profile and settings">
          <Avatar initial={s.profile.name[0]?.toUpperCase()} src={s.profile.avatarUrl} />
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5" role="tablist" aria-label="Activity views">
        {(
          [
            ["performance", "Progress"],
            ["locker", "Evidence"],
            ["records", "Achievements"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            role="tab"
            aria-selected={tab === id}
            className="min-h-11 px-3.5 py-2 rounded-full text-[12px] font-bold cursor-pointer"
            style={{
              background: tab === id ? "var(--bygga-ink)" : "transparent",
              color: tab === id ? "var(--bygga-bg)" : "var(--bygga-ink60)",
              border: tab === id ? "none" : "1px solid var(--bygga-ink10)",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "performance" ? (
        <>
          <Link href="/app/activity?tab=records" className="spring flex items-center gap-3 rounded-[22px] border border-white/80 bg-paper/90 p-3.5 text-ink no-underline shadow-card">
            <div className="relative grid h-14 w-14 shrink-0 place-items-center rounded-full bg-indigo/10">
              <span className="text-[24px] font-black text-indigo">{builderLevel}</span>
              <span className="absolute -bottom-1 rounded-full bg-indigo px-2 py-0.5 text-[8px] font-extrabold tracking-[0.6px] text-white">LEVEL</span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-extrabold">Builder level {builderLevel}</span>
                <span className="text-[10px] font-bold text-indigo">{Object.keys(s.badges).length} awards →</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-ink-10"><div className="h-full rounded-full bg-indigo transition-all" style={{ width: `${levelProgress}%` }} /></div>
              <div className="mt-1 text-[10.5px] text-ink-40">{logs.length % 7} of 7 completed steps to the next level</div>
            </div>
          </Link>

          {/* Scoreboard */}
          <div className="bg-ink text-cream rounded-2xl p-[18px]">
            <div className="text-[10px] font-bold tracking-[0.8px] mb-2" style={{ color: "rgba(250,247,240,0.55)" }}>
              WEEK {week} SCOREBOARD
            </div>
            <div className="grid grid-cols-3 gap-2.5">
              {[
                [String(logs.length), "tasks logged"],
                [String(proofs), "evidence added"],
                [String(streak), "day streak"],
              ].map(([v, k]) => (
                <div key={k}>
                  <div className="badger-number text-[28px] font-bold leading-none tracking-[-1px]">{/\d/.test(v) ? <CountUp value={parseInt(v)} suffix={v.replace(/^\d+/, "")} /> : v}</div>
                  <div className="text-[10.5px] mt-1" style={{ color: "rgba(250,247,240,0.6)" }}>
                    {k}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3.5 px-2.5 py-2 rounded-lg text-[11.5px]" style={{ background: "rgba(255,255,255,0.07)", color: "rgba(250,247,240,0.85)" }}>
              <span className="font-bold">The goal:</span> launch and reach a paying customer by Day 28, or finish with a decision supported by evidence.
            </div>
          </div>

          {/* Current week. The detailed 28-day journey stays in Plan. */}
          <Card className="!p-4">
            <div className="flex items-center justify-between text-[11px] font-bold tracking-[0.6px] text-ink-60 mb-3"><span>WEEK {week}</span><span>{streak} day streak</span></div>
            <div className="flex gap-1.5">
              {DAY_NAMES.map((name, index) => {
                const dayNumber = (week - 1) * 7 + index + 1;
                const done = Boolean(s.logs[dayNumber]);
                const today = index === weekDayIndex;
                return (
                  <div key={name} className="flex min-h-12 flex-1 flex-col items-center justify-center rounded-[10px] text-[10px] font-bold" style={{ background: done ? "var(--bygga-ink)" : today ? "var(--bygga-yellow)" : "var(--bygga-ink10)", color: done ? "var(--bygga-bg)" : "var(--bygga-ink60)" }} aria-label={`${name}, ${done ? "completed" : today ? "today" : "not completed"}`}>
                    <span>{name[0]}</span><span className="mt-0.5">{done ? "✓" : today ? "Today" : "·"}</span>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Log history */}
          <div>
            <div className="text-[11px] font-bold tracking-[0.6px] text-ink-60 px-1 pb-2">THE LOG</div>
            {logs.length === 0 ? (
              <Card className="text-[13px] text-ink-60 text-center !py-8 flex flex-col items-center gap-3">
                <BrandBo size={135} alt="Bo ready to help you begin" facing="left" className="anim-bounce-soft" />
                <div className="max-w-[230px]">
                  Your completed work will appear here. Start with the one step waiting today.
                </div>
                <Link href="/app" className="min-h-11 rounded-[13px] bg-yellow px-5 py-3 text-[13px] font-bold text-ink no-underline">Start Day 1 →</Link>
              </Card>
            ) : (
              <div className="flex flex-col gap-2">
                {logs.map((l) => {
                  const t = s.tasks.find((x) => x.day === l.day);
                  const meta = t ? TASK_TYPE_META[t.type] : TASK_TYPE_META.build;
                  return (
                    <Card key={l.day} className="!p-3.5">
                      <div className="flex items-center gap-2 mb-1.5">
                        <Pill bg={meta.bg} color={meta.color}>
                          {meta.label}
                        </Pill>
                        <span className="text-[11px] text-ink-40 font-mono">Day {l.day}</span>
                      </div>
                      <div className="text-[13px] font-semibold leading-[1.3]">{t?.title}</div>
                      {l.did?.trim() && (
                        <div className="mt-1.5 text-[12px] text-ink-60 leading-[1.4]">{l.did}</div>
                      )}
                      {l.learned?.trim() && (
                        <div className="mt-1 text-[12px] text-ink-60 leading-[1.4]">
                          <span className="font-bold text-ink">Learned:</span> {l.learned}
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
          <CommunityKnowledge />
        </>
      ) : tab === "locker" ? (
        /* Evidence is separate from the activity history and never presented
           as provider-verified unless a trusted integration says so. */
        <>
          <div className="bg-ink text-cream rounded-2xl p-[18px]">
            <div className="text-[10px] font-bold tracking-[0.8px]" style={{ color: "rgba(250,247,240,0.55)" }}>
              EVIDENCE ADDED
            </div>
            <div className="mt-1.5 flex items-baseline gap-2">
              <span className="badger-number text-[34px] font-bold leading-none tracking-[-1px]"><CountUp value={proofs} /></span>
              <span className="text-[13px]" style={{ color: "rgba(250,247,240,0.75)" }}>
                {proofs === 1 ? "item" : "items"} saved
              </span>
            </div>
            <div className="mt-2 text-[11.5px]" style={{ color: "rgba(250,247,240,0.6)" }}>
              These are your own notes or links. Bo treats them as self-reported until a trusted provider verifies them.
            </div>
          </div>
          {evidenceLogs.length === 0 ? (
            <Card className="!p-5 text-center">
              <div className="text-[26px] mb-1">🗂</div>
              <div className="text-[14px] font-bold">No evidence added yet.</div>
              <div className="text-[12px] text-ink-60 mt-1 leading-[1.45]">
                When you add a note, screenshot link or payment confirmation to a completed task, it appears here.
              </div>
            </Card>
          ) : (
            <div className="flex flex-col gap-2">
              {evidenceLogs.map((l) => {
                const t = s.tasks.find((x) => x.day === l.day);
                const isUrl = /^https?:\/\//i.test(l.proof?.trim() ?? "");
                return (
                  <Card key={l.day} className="!p-3.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold tracking-[1px] text-ink-40">DAY {l.day}{t ? ` · ${t.type.toUpperCase()}` : ""}</span>
                      <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(14,124,107,0.12)", color: "var(--bygga-teal-deep, #0E7C6B)" }}>SELF-REPORTED</span>
                    </div>
                    <div className="mt-1.5 text-[13.5px] font-semibold leading-[1.35]">&ldquo;{l.did}&rdquo;</div>
                    {l.learned?.trim() && (
                      <div className="mt-1 text-[12px] italic text-ink-60 leading-[1.4]">Learned: {l.learned}</div>
                    )}
                    {l.proof?.trim() && (
                      isUrl ? (
                        <a href={l.proof} target="_blank" rel="noreferrer" className="mt-1.5 inline-block text-[11.5px] font-semibold text-teal-deep underline break-all">
                          {l.proof.length > 44 ? l.proof.slice(0, 44) + "…" : l.proof}
                        </a>
                      ) : (
                        <div className="mt-1.5 text-[11.5px] text-ink-60 break-all">{l.proof}</div>
                      )
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="relative rounded-[26px] bg-cobalt-grad p-5 text-white overflow-hidden shadow-glass">
            <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10" />
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-[10px] font-bold tracking-[1px] text-acid">YOUR AWARD CABINET</div>
                <div className="mt-1 text-[22px] font-bold tracking-[-0.5px]">
                  {Object.keys(s.badges).length} of {BADGES.length} earned
                </div>
                <div className="mt-1 text-[12px] text-white/70">Every award marks real work outside this app.</div>
              </div>
              <BrandBo size={112} alt="Bo celebrating your progress" className="anim-bounce-soft" />
            </div>
            <div className="mt-4 rounded-full bg-white/15 p-1">
              <div className="h-2 rounded-full bg-acid transition-all" style={{ width: `${(Object.keys(s.badges).length / BADGES.length) * 100}%` }} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {BADGES.map((b, index) => {
              const unlocked = s.badges[b.id];
              return (
                <button
                  type="button"
                  onClick={() => setSelectedBadge(b.id)}
                  key={b.id}
                  className="spring flex min-h-[184px] flex-col items-center rounded-[22px] border border-white/80 bg-paper/90 p-4 text-center shadow-card cursor-pointer"
                  style={{ opacity: unlocked ? 1 : 0.7, animationDelay: `${Math.min(index, 7) * 0.04}s` }}
                >
                  <AchievementMedal name={b.name} unlocked={Boolean(unlocked)} index={index} />
                  <div className="mt-3 text-[13px] font-bold leading-[1.2]">{b.name}</div>
                  <div className="mt-1 text-[10.5px] leading-[1.35] text-ink-60">
                    {unlocked
                      ? `Unlocked ${new Date(unlocked).toLocaleDateString([], { month: "short", day: "numeric" })}`
                      : b.condition}
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}
      {selectedBadge && (() => {
        const badge = BADGES.find((item) => item.id === selectedBadge);
        if (!badge) return null;
        const unlocked = s.badges[badge.id];
        const index = BADGES.findIndex((item) => item.id === badge.id);
        return (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/55" onClick={() => setSelectedBadge(null)}>
            <div className="w-full max-w-[480px] rounded-t-[30px] bg-paper px-6 pb-8 pt-6 text-center anim-rise" onClick={(event) => event.stopPropagation()}>
              <button type="button" onClick={() => setSelectedBadge(null)} className="ml-auto grid h-9 w-9 place-items-center rounded-full border-0 bg-ink-10 text-[18px] cursor-pointer" aria-label="Close">×</button>
              <div className="mt-1 flex justify-center"><AchievementMedal name={badge.name} unlocked={Boolean(unlocked)} index={index} size={138} /></div>
              <div className="mt-5 text-[10px] font-extrabold tracking-[1.2px] text-indigo">{unlocked ? "ACHIEVEMENT EARNED" : "ACHIEVEMENT LOCKED"}</div>
              <h2 className="mt-2 text-[28px] font-extrabold tracking-[-0.7px]">{badge.name}</h2>
              <p className="mx-auto mt-3 max-w-[300px] text-[14px] leading-[1.5] text-ink-60">{badge.condition}. {unlocked ? "This stays in your cabinet because the work happened." : "Complete the real-world step and Bo will unlock it."}</p>
              <button type="button" onClick={() => setSelectedBadge(null)} className="spring mt-7 w-full rounded-[15px] border-0 bg-indigo py-4 text-[15px] font-bold text-white cursor-pointer">{unlocked ? "Back to my awards" : "Keep building"}</button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
