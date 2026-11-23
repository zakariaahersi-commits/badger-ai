"use client";

import { useEffect, useRef, useState } from "react";
import { BrandBo } from "@/components/brand-bo";

const SCREENS = [
  {
    id: "today",
    label: "Today",
    eyebrow: "ONE CLEAR MOVE",
    promise: "Know exactly what to do today.",
    detail: "Bo keeps the work small, useful and moving.",
  },
  {
    id: "plan",
    label: "Plan",
    eyebrow: "YOUR 28-DAY ROUTE",
    promise: "See where today is taking you.",
    detail: "Four weeks, built around your idea and your level.",
  },
  {
    id: "bo",
    label: "Bo",
    eyebrow: "COACH + CO-FOUNDER",
    promise: "Help that remembers your journey.",
    detail: "Bo uses your plan and evidence to help with the next move.",
  },
] as const;

const AUTO_ADVANCE_MS = 6200;

function TodayScreen() {
  return (
    <div className="hero-app-screen hero-today-screen">
      <div className="hero-app-heading">
        <div><span>DAY 24 OF 28</span><h3>Your move today.</h3></div>
        <div className="hero-avatar">M</div>
      </div>
      <div className="hero-day-card">
        <div className="flex items-center justify-between gap-2">
          <span className="hero-pill hero-pill-yellow">GET PAID</span>
          <span className="text-[9px] font-extrabold tracking-[.8px] text-white/55">20 MIN</span>
        </div>
        <div className="mt-5 max-w-[270px] text-[25px] font-extrabold leading-[1.03] tracking-[-.8px] text-white sm:text-[28px]">Ask one warm lead to pay.</div>
        <p className="mt-2 max-w-[285px] text-[11.5px] leading-[1.45] text-white/62">Send the offer you shaped yesterday. Do not add another feature first.</p>
        <div className="mt-5 rounded-[13px] bg-white/10 p-3 text-[11px] leading-[1.4] text-white/75"><strong className="text-white">What counts:</strong> the message and their reply—even if it is no.</div>
      </div>
      <div className="hero-today-actions">
        <div><strong>23</strong><span>steps done</span></div>
        <div><strong>11</strong><span>day streak</span></div>
        <button type="button">Ask Bo to draft it →</button>
      </div>
      <BrandBo pose="thinking" size={116} alt="Bo helping with today's task" className="hero-tour-bo hero-tour-bo-today" />
    </div>
  );
}

const WEEKS = [
  ["01", "LISTEN", "Enter their world", "7 / 7", "done"],
  ["02", "DECIDE", "Choose from evidence", "7 / 7", "done"],
  ["03", "SELL", "Make the real ask", "7 / 7", "done"],
  ["04", "LAUNCH", "Finish with an answer", "3 / 7", "active"],
] as const;

function PlanScreen() {
  return (
    <div className="hero-app-screen hero-plan-screen">
      <div className="hero-app-heading">
        <div><span>YOUR PERSONALISED PLAN</span><h3>Four weeks. One answer.</h3></div>
        <span className="hero-pill hero-pill-ink">DAY 24</span>
      </div>
      <div className="hero-week-stack">
        {WEEKS.map(([number, phase, title, count, state], index) => (
          <div key={number} className={`hero-week-row hero-week-${index + 1} is-${state}`}>
            <span className="hero-week-number">{number}</span>
            <div className="min-w-0 flex-1"><small>{phase}</small><strong>{title}</strong></div>
            <span className="hero-week-count">{state === "done" ? "✓" : "NOW"} · {count}</span>
          </div>
        ))}
      </div>
      <div className="hero-plan-path"><span style={{ width: "84%" }} /><i /><BrandBo pose="walk" size={88} alt="Bo moving through the four-week plan" className="hero-plan-path-bo" /></div>
      <p className="hero-plan-note"><strong>Next:</strong> turn three warm replies into one simple launch.</p>
    </div>
  );
}

function BoScreen() {
  return (
    <div className="hero-app-screen hero-bo-screen">
      <div className="hero-bo-header">
        <BrandBo pose="front" size={72} alt="Bo, your coach and co-founder" className="bo-float" />
        <div><h3>Bo</h3><span><i /> COACH + CO-FOUNDER · DAY 24</span></div>
      </div>
      <div className="hero-bo-brief"><span>TODAY&apos;S BRIEF</span><strong>Your replies show the price is not the problem. Asking clearly is.</strong><p>I have used your 12 interview notes and yesterday&apos;s offer—not a generic playbook.</p></div>
      <div className="hero-chat">
        <div className="hero-chat-bo"><BrandBo pose="peek" size={42} alt="Bo" /><p>Send Nora the £39 pilot offer today. Want me to make it sound like you?</p></div>
        <div className="hero-chat-user">Yes—but direct, not salesy.</div>
        <div className="hero-chat-bo"><BrandBo pose="peek" size={42} alt="Bo" /><p>Done. I kept your wording and removed the apology before the price.</p></div>
      </div>
      <div className="hero-bo-suggestions"><span>Draft the message</span><span>Challenge my plan</span><span>What if she says no?</span></div>
      <div className="hero-chat-input"><span>Ask Bo anything about your journey…</span><strong>↑</strong></div>
    </div>
  );
}

function ActiveScreen({ id }: { id: (typeof SCREENS)[number]["id"] }) {
  if (id === "today") return <TodayScreen />;
  if (id === "plan") return <PlanScreen />;
  return <BoScreen />;
}

export function BoHeroStage() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const swipeStart = useRef<number | null>(null);
  const active = SCREENS[activeIndex];

  useEffect(() => {
    if (paused) return;
    const timer = window.setTimeout(() => setActiveIndex((current) => (current + 1) % SCREENS.length), AUTO_ADVANCE_MS);
    return () => window.clearTimeout(timer);
  }, [activeIndex, paused]);

  const selectScreen = (index: number) => setActiveIndex((index + SCREENS.length) % SCREENS.length);

  return (
    <div
      className="hero-product-tour"
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      onPointerDown={(event) => { swipeStart.current = event.clientX; }}
      onPointerUp={(event) => {
        if (swipeStart.current === null) return;
        const distance = event.clientX - swipeStart.current;
        swipeStart.current = null;
        if (Math.abs(distance) > 44) selectScreen(activeIndex + (distance < 0 ? 1 : -1));
      }}
      onPointerCancel={() => { swipeStart.current = null; }}
    >
      <div className="hero-tour-topline">
        <span>INSIDE BADGER AI</span>
        <span><i /> ACTUAL APP UI · EXAMPLE JOURNEY</span>
      </div>

      <div className="hero-tour-frame">
        <div key={active.id} className="hero-tour-content" aria-live="polite" aria-label={`${active.label}: ${active.promise}`}>
          <ActiveScreen id={active.id} />
        </div>
        <div className="hero-tour-value">
          <span>{active.eyebrow}</span>
          <strong>{active.promise}</strong>
          <p>{active.detail}</p>
        </div>
      </div>

      <div className="hero-tour-tabs" role="tablist" aria-label="Explore what you get in Badger AI">
        {SCREENS.map((screen, index) => (
          <button
            key={screen.id}
            type="button"
            role="tab"
            aria-selected={index === activeIndex}
            onPointerDown={(event) => { event.stopPropagation(); selectScreen(index); }}
            onFocus={() => selectScreen(index)}
            onClick={() => selectScreen(index)}
            className={index === activeIndex ? "is-active" : ""}
          >
            <i>{index + 1}</i><span>{screen.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
