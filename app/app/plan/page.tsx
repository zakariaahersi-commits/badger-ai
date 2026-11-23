"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";
import { BrandBo } from "@/components/brand-bo";
import { Avatar, Pill } from "@/components/ui";
import { TASK_TYPE_META } from "@/lib/plan";
import { currentDayOf, missedInARow, useBygga } from "@/lib/store";
import { sprintDaysAfterToday, sprintEndDate } from "@/lib/sprint-calendar";
import type { SprintTask } from "@/lib/types";

type World = {
  week: number;
  phase: string;
  title: string;
  goal: string;
  proof: string;
  boLine: string;
  pose: "front" | "thinking" | "celebrate";
};

const WORLDS: World[] = [
  {
    week: 1,
    phase: "LISTEN",
    title: "Enter their world.",
    goal: "Find one problem people already feel.",
    proof: "Real conversations, in their own words.",
    boLine: "I will help you ask better questions, then notice the pattern.",
    pose: "front",
  },
  {
    week: 2,
    phase: "DECIDE",
    title: "Choose from evidence.",
    goal: "Keep, change or close the idea.",
    proof: "A clear decision you can explain simply.",
    boLine: "We will remove guesses and make the Day 14 decision together.",
    pose: "thinking",
  },
  {
    week: 3,
    phase: "SELL",
    title: "Make the real ask.",
    goal: "Put an offer in front of someone.",
    proof: "A reply, an objection or a payment attempt.",
    boLine: "I can shape the offer, draft the message and hold you to sending it.",
    pose: "front",
  },
  {
    week: 4,
    phase: "LAUNCH",
    title: "Finish with an answer.",
    goal: "Reach a paying customer or a clear no.",
    proof: "A customer payment or an honest final decision.",
    boLine: "We use everything you learned, launch, then decide what deserves day 29.",
    pose: "celebrate",
  },
];

export default function PlanPage() {
  const s = useBygga();
  const day = currentDayOf(s);
  const missed = missedInARow(s.logs, day);
  const [selected, setSelected] = useState<SprintTask | null>(null);

  if (!s.profile) return null;

  const endDate = sprintEndDate(s.planStart)?.toLocaleDateString([], { month: "short", day: "numeric" }) ?? "";

  return (
    <div className="px-4 pt-4 min-[360px]:px-5">
      <header className="flex items-end justify-between gap-3 pb-4">
        <div>
          <div className="text-[10px] font-extrabold tracking-[1.4px] text-indigo">YOUR 28-DAY WORLD</div>
          <h1 className="mt-1 text-[32px] font-semibold leading-none tracking-[-1px]">Four weeks. One launch.</h1>
          <div className="mt-2 text-[12px] text-ink-60">Day {day} of 28 · {sprintDaysAfterToday(day)} days after today · ends {endDate}</div>
        </div>
        <Link href="/app/profile" aria-label="Profile and settings">
          <Avatar initial={s.profile.name[0]?.toUpperCase()} src={s.profile.avatarUrl} />
        </Link>
      </header>

      <div className="flex flex-col gap-4" aria-label="Your four-week launch plan">
        {WORLDS.map((world) => {
          const firstDay = (world.week - 1) * 7 + 1;
          const lastDay = world.week * 7;
          const tasks = s.tasks.filter((task) => task.week === world.week);
          const completed = tasks.filter((task) => s.logs[task.day]).length;
          const active = day >= firstDay && day <= lastDay;
          const past = day > lastDay;
          const locked = day < firstDay;
          const localDay = Math.max(firstDay, Math.min(lastDay, day));
          const travel = past ? 100 : locked ? 0 : ((localDay - firstDay) / 6) * 100;
          const boPose = active && missed > 0 ? "recover" : past ? "celebrate" : world.pose;
          const currentTask = tasks.find((task) => task.day === day);
          const worldStyle = { "--bo-progress": `${travel}%` } as CSSProperties;

          return (
            <section
              key={world.week}
              className={`plan-world plan-world-${world.week} ${active ? "is-active" : ""} ${past ? "is-complete" : ""} ${locked ? "is-locked" : ""}`}
              style={worldStyle}
              aria-labelledby={`world-${world.week}-title`}
            >
              <div className="plan-world-light" aria-hidden="true" />
              <div className="plan-world-horizon" aria-hidden="true" />
              <div className="plan-world-number" aria-hidden="true">0{world.week}</div>

              <div className="relative z-[3] flex items-start justify-between gap-3">
                <div>
                  <div className="text-[10px] font-extrabold tracking-[1.5px] opacity-70">WEEK {world.week} · {world.phase}</div>
                  <h2 id={`world-${world.week}-title`} className="mt-1 text-[27px] font-semibold leading-[1.02] tracking-[-0.8px]">{world.title}</h2>
                </div>
                <span className="rounded-full border border-current/20 bg-white/55 px-2.5 py-1 text-[10px] font-extrabold backdrop-blur-md">
                  {past ? "COMPLETE" : active ? `${completed}/7 DONE` : `DAYS ${firstDay}–${lastDay}`}
                </span>
              </div>

              <div className="plan-world-journey" aria-hidden="true">
                {!locked && (
                  <div className={`plan-world-bo ${active ? "is-arriving" : ""} ${past ? "is-celebrating" : ""}`}>
                    <BrandBo pose={boPose} size={active ? 116 : 92} alt={`Bo in week ${world.week}`} />
                  </div>
                )}
              </div>

              <div className="plan-world-days" aria-label={`Week ${world.week} days`}>
                {tasks.map((task) => {
                  const done = Boolean(s.logs[task.day]);
                  const today = task.day === day;
                  const future = task.day > day;
                  return (
                    <button
                      key={task.day}
                      type="button"
                      onClick={() => setSelected(task)}
                      className={`plan-world-day ${done ? "is-done" : ""} ${today ? "is-today" : ""}`}
                      aria-label={`Day ${task.day}: ${task.title}${future ? ", locked" : ""}`}
                      aria-current={today ? "step" : undefined}
                    >
                      <span>{done ? "✓" : task.day}</span>
                      {today && <small>TODAY</small>}
                    </button>
                  );
                })}
              </div>

              <div className="plan-world-copy">
                <div className="text-[10px] font-extrabold tracking-[1.2px] opacity-60">THIS WEEK</div>
                <div className="mt-1 text-[16px] font-extrabold leading-[1.25]">{world.goal}</div>
                <div className="mt-1.5 text-[12px] leading-[1.45] opacity-70"><strong>Evidence:</strong> {world.proof}</div>
              </div>

              {active && currentTask && (
                <button type="button" onClick={() => setSelected(currentTask)} className="plan-world-now">
                  <div>
                    <span>TODAY · {currentTask.minutes} MIN</span>
                    <strong>{currentTask.title}</strong>
                  </div>
                  <b>→</b>
                </button>
              )}

              <div className="plan-world-bo-line">
                <BrandBo pose="peek" size={42} alt="Bo" />
                <p>{active && missed > 0 ? "No reset. We continue from here, one small step today." : world.boLine}</p>
              </div>
            </section>
          );
        })}
      </div>

      <div className="mt-4 rounded-[22px] bg-ink p-5 text-cream shadow-card">
        <div className="text-[10px] font-extrabold tracking-[1.4px] text-yellow">THE FINISH LINE</div>
        <div className="mt-1.5 text-[19px] font-extrabold leading-[1.2]">A paying customer or a clear answer by Day 28.</div>
        <p className="mt-2 text-[12.5px] leading-[1.45] text-white/65">Both outcomes create proof. The only failure is leaving the idea untouched.</p>
      </div>

      {selected && (
        <DaySheet task={selected} today={day} done={Boolean(s.logs[selected.day])} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

function DaySheet({ task, today, done, onClose }: { task: SprintTask; today: number; done: boolean; onClose: () => void }) {
  const future = task.day > today;
  const meta = TASK_TYPE_META[task.type];
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="plan-day-title" className="w-full max-w-[480px] rounded-t-[26px] bg-cream px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-5 anim-rise" onClick={(event) => event.stopPropagation()}>
        <button type="button" onClick={onClose} className="ml-auto grid h-11 w-11 place-items-center rounded-full border-0 bg-ink-10 text-[20px]" aria-label="Close day details">×</button>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Pill bg={meta.bg} color={meta.color}>{meta.label}</Pill>
          <span className="text-[11px] font-mono text-ink-40">Day {task.day} · Week {task.week} · {task.minutes} min</span>
          {done && <Pill bg="rgba(60,142,104,0.15)" color="var(--bygga-teal-deep)">✓ Done</Pill>}
        </div>
        <h2 id="plan-day-title" className="text-[23px] font-semibold leading-[1.15] tracking-[-0.5px]">{future ? "Locked for now." : task.title}</h2>
        {future ? (
          <p className="mt-2.5 text-[13px] leading-[1.5] text-ink-60">This opens on Day {task.day}. Bo keeps your attention on the one step in front of you.</p>
        ) : (
          <>
            <p className="mt-2.5 text-[13px] leading-[1.5] text-ink-60">{task.detail}</p>
            <div className="mt-3 rounded-[12px] bg-paper px-3.5 py-3 text-[12px] shadow-card"><span className="font-extrabold text-teal-deep">WHAT COUNTS</span> {task.verify}</div>
          </>
        )}
        {task.day === today && !done && <Link href="/app" className="mt-4 block rounded-[14px] bg-yellow px-5 py-4 text-center text-[15px] font-bold text-ink no-underline shadow-btn-yellow">Start today’s step →</Link>}
      </div>
    </div>
  );
}
