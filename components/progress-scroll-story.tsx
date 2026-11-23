"use client";

import { useEffect, useRef, useState } from "react";
import { BoMascot, type BoState } from "./bo";
import { LaunchPath } from "./launch-path";

const STAGES: ReadonlyArray<{
  day: number;
  dayLabel: string;
  kicker: string;
  title: string;
  body: string;
  signal: string;
  proof: string;
  boState: BoState;
  side: "left" | "right";
}> = [
  {
    day: 1,
    dayLabel: "01",
    kicker: "START",
    title: "Choose one problem.",
    body: "Bo turns the idea in your head into one small move you can finish today.",
    signal: "ONE CLEAR PROBLEM",
    proof: "A specific person and problem",
    boState: "idle",
    side: "right",
  },
  {
    day: 7,
    dayLabel: "07",
    kicker: "LISTEN",
    title: "Hear it in their words.",
    body: "Real conversations replace assumptions. Bo prepares the questions and helps you notice patterns.",
    signal: "REAL CONVERSATIONS",
    proof: "Notes, replies or recordings",
    boState: "thinking",
    side: "left",
  },
  {
    day: 14,
    dayLabel: "14",
    kicker: "DECIDE",
    title: "Keep it, change it or close it.",
    body: "You make the decision from evidence. Bo gives you an honest view, not empty encouragement.",
    signal: "A CLEAR DECISION",
    proof: "What people did, not what they promised",
    boState: "glasses-on",
    side: "right",
  },
  {
    day: 21,
    dayLabel: "21",
    kicker: "SELL",
    title: "Make the real ask.",
    body: "Bo helps shape the offer and message. You give someone a clear chance to pay.",
    signal: "THE PAYMENT ASK",
    proof: "An offer sent to a real person",
    boState: "fired-up",
    side: "left",
  },
  {
    day: 28,
    dayLabel: "28",
    kicker: "LAUNCH",
    title: "A customer or a clear answer.",
    body: "You finish with something real: money, a launch, a better direction or the confidence to stop.",
    signal: "BUILT IT",
    proof: "A payment or an evidence-backed decision",
    boState: "celebrating",
    side: "right",
  },
];

export function ProgressScrollStory() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [journeyDay, setJourneyDay] = useState(1);
  const active = STAGES[activeIndex];

  useEffect(() => {
    const root = rootRef.current;
    const sticky = root?.querySelector<HTMLElement>(".progress-scroll-sticky");
    if (!root || !sticky) return;

    let frame = 0;
    const update = () => {
      frame = 0;
      const rect = root.getBoundingClientRect();
      const stickyHeight = sticky.getBoundingClientRect().height;
      const topOffset = window.innerWidth >= 768 ? 24 : 8;
      const travel = Math.max(1, rect.height - stickyHeight);
      const progress = Math.max(0, Math.min(1, (topOffset - rect.top) / travel));
      const nextIndex = Math.min(STAGES.length - 1, Math.round(progress * (STAGES.length - 1)));
      const nextDay = Math.max(1, Math.min(28, Math.round(1 + progress * 27)));
      root.style.setProperty("--progress-story-scroll", progress.toFixed(4));
      setActiveIndex((current) => (current === nextIndex ? current : nextIndex));
      setJourneyDay((current) => (current === nextDay ? current : nextDay));
    };

    const requestUpdate = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate);
    return () => {
      window.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", requestUpdate);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  const goToStage = (index: number) => {
    const root = rootRef.current;
    const sticky = root?.querySelector<HTMLElement>(".progress-scroll-sticky");
    if (!root || !sticky) return;
    const rootTop = window.scrollY + root.getBoundingClientRect().top;
    const topOffset = window.innerWidth >= 768 ? 24 : 8;
    const travel = Math.max(1, root.offsetHeight - sticky.getBoundingClientRect().height);
    const target = rootTop - topOffset + (index / (STAGES.length - 1)) * travel;
    window.scrollTo({ top: target, behavior: "smooth" });
  };

  return (
    <section className="mx-auto w-full max-w-[1240px] px-3 pb-16 sm:px-8 lg:px-10 lg:pb-24">
      <div ref={rootRef} className="progress-scroll-story">
        <div className="progress-scroll-sticky">
          <div className="progress-story-intro">
            <div className="text-[10px] font-extrabold tracking-[1.8px] text-ink-40">YOUR 28-DAY PATH</div>
            <h2 className="mt-2 text-[31px] font-extrabold leading-[.98] tracking-[-1.35px] sm:text-[38px]">
              Progress you can feel.
            </h2>
            <p className="mt-3 max-w-[460px] text-[13px] leading-[1.45] text-ink-60 sm:text-[15px]">
              Scroll through the work. Bo moves when you do.
            </p>
          </div>

          <div className={`progress-story-stage stage-${activeIndex}`} aria-live="polite">
            <div className="progress-story-grid" aria-hidden="true" />
            <div className="progress-story-day" aria-hidden="true">{active.dayLabel}</div>
            <div className="progress-story-signal">{active.signal}</div>

            <div
              key={`bo-${active.day}`}
              className="progress-story-bo anim-pop"
              data-side={active.side}
              aria-hidden="true"
            >
              <span className="progress-story-bo-ring" />
              <BoMascot state={active.boState} size={94} />
            </div>

            <div className="progress-story-path">
              <LaunchPath day={journeyDay} compact />
            </div>

            <div key={active.day} className="progress-story-copy anim-rise">
              <div className="text-[10px] font-extrabold tracking-[1.4px] text-indigo">
                DAY {active.dayLabel} · {active.kicker}
              </div>
              <h3 className="mt-2 max-w-[390px] text-[27px] font-extrabold leading-[1] tracking-[-1.1px] sm:text-[34px]">
                {active.title}
              </h3>
              <p className="mt-3 max-w-[430px] text-[13.5px] leading-[1.48] text-ink-60 sm:text-[15px]">
                {active.body}
              </p>
              <div className="progress-story-proof">
                <span>PROOF</span>
                <strong>{active.proof}</strong>
              </div>
            </div>

            <div className="progress-story-controls" aria-label="28-day launch stages">
              {STAGES.map((stage, index) => (
                <button
                  key={stage.day}
                  type="button"
                  className={index === activeIndex ? "is-active" : index < activeIndex ? "is-past" : ""}
                  onClick={() => goToStage(index)}
                  aria-label={`Go to Day ${stage.day}: ${stage.kicker}`}
                  aria-current={index === activeIndex ? "step" : undefined}
                >
                  <span />
                  {stage.dayLabel}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
