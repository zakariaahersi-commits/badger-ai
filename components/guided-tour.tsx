"use client";

import { useEffect, useState } from "react";
import { BoMascot } from "./bo";

const TOUR_KEY = "byqqa-guided-tour-v1";
const TOUR_EVENT = "byqqa:show-tour";

const STEPS = [
  {
    target: "",
    title: "I’m Bo. We build this together.",
    body: "I am your coach, accountability partner and practical co-founder. I give you one clear move and help with the work around it.",
    state: "idle" as const,
  },
  {
    target: "today-task",
    title: "One useful task. Not a long list.",
    body: "This is the most useful thing you can do today. Choose a time, press Start and I will guide you through it.",
    state: "fired-up" as const,
  },
  {
    target: "launch-path",
    title: "Your launch is always visible.",
    body: "Every completed step moves you towards Day 28. Progress and achievements are based on work you actually log.",
    state: "celebrating" as const,
  },
  {
    target: "bo-tab",
    title: "Talk to me whenever you are stuck.",
    body: "Ask for a smaller step, a customer message, research or a draft. I remember your plan and keep the advice tied to your goal.",
    state: "glasses-on" as const,
  },
] as const;

export function openGuidedTour() {
  window.dispatchEvent(new Event(TOUR_EVENT));
}

export function GuidedTour() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const show = () => {
      setStep(0);
      setOpen(true);
    };
    window.addEventListener(TOUR_EVENT, show);
    // Do not interrupt a new founder before they can see today's task. The tour
    // remains available from Profile & Settings whenever they want it.
    return () => window.removeEventListener(TOUR_EVENT, show);
  }, []);

  useEffect(() => {
    document.querySelectorAll(".tour-focus").forEach((node) => node.classList.remove("tour-focus"));
    if (!open) return;
    const target = STEPS[step].target;
    if (!target) return;
    const node = document.querySelector(`[data-tour="${target}"]`);
    node?.classList.add("tour-focus");
    node?.scrollIntoView({ behavior: "smooth", block: "center" });
    return () => node?.classList.remove("tour-focus");
  }, [open, step]);

  if (!open) return null;
  const current = STEPS[step];
  const finish = () => {
    window.localStorage.setItem(TOUR_KEY, "seen");
    setOpen(false);
  };

  return (
    <>
      <button type="button" aria-label="Close tour" className="fixed inset-0 z-[60] border-0 bg-ink/55 cursor-default" onClick={finish} />
      <div className="pointer-events-none fixed inset-0 z-[80] flex items-end justify-center" aria-modal="true" role="dialog" aria-label="Badger AI guided tour">
      <div className="pointer-events-auto w-full max-w-[480px] rounded-t-[28px] bg-paper px-6 pt-5 pb-7 shadow-card anim-rise">
        <div className="flex items-center justify-between">
          <div className="flex gap-1.5" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
            {STEPS.map((item, index) => (
              <span key={item.title} className="h-1.5 rounded-full transition-all" style={{ width: index === step ? 28 : 8, background: index <= step ? "var(--bygga-indigo)" : "var(--bygga-ink10)" }} />
            ))}
          </div>
          <button type="button" onClick={finish} className="border-0 bg-transparent text-[12px] font-bold text-ink-40 cursor-pointer">Skip</button>
        </div>
        <div className="mt-3 flex items-end gap-4">
          <BoMascot key={current.state} state={current.state} size={104} className={current.state === "celebrating" ? "bo-celebrate anim-pop" : "bo-float anim-pop"} />
          <div className="pb-2">
            <div className="text-[10px] font-extrabold tracking-[1.2px] text-indigo">BO · {step + 1} OF {STEPS.length}</div>
            <h2 className="mt-1.5 text-[23px] font-extrabold leading-[1.08] tracking-[-0.7px]">{current.title}</h2>
          </div>
        </div>
        <p className="mt-3 text-[14px] leading-[1.5] text-ink-60">{current.body}</p>
        <div className="mt-5 flex gap-2.5">
          {step > 0 && (
            <button type="button" onClick={() => setStep((value) => value - 1)} className="rounded-[14px] border border-ink-20 bg-transparent px-5 py-3.5 text-[13px] font-bold cursor-pointer">Back</button>
          )}
          <button
            type="button"
            onClick={() => step === STEPS.length - 1 ? finish() : setStep((value) => value + 1)}
            className="spring flex-1 rounded-[14px] border-0 bg-ink py-3.5 text-[14px] font-bold text-cream cursor-pointer"
          >
            {step === STEPS.length - 1 ? "Start building" : "Next"} →
          </button>
        </div>
      </div>
      </div>
    </>
  );
}
