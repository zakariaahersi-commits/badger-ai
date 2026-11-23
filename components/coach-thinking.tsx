"use client";

import { BoFace, BoMascot } from "./bo";

const DEFAULT_STEPS = ["Reading the context", "Finding the useful signal", "Writing your next move"];

export function ThinkingDots({ label = "Bo is thinking" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2" role="status" aria-live="polite">
      <span>{label}</span>
      <span className="thinking-dots" aria-hidden="true"><i /><i /><i /></span>
    </span>
  );
}

export function CoachThinking({
  title = "Bo is working on it",
  activeStep = 0,
  steps = DEFAULT_STEPS,
  compact = false,
}: {
  title?: string;
  activeStep?: number;
  steps?: string[];
  compact?: boolean;
}) {
  const safeStep = Math.max(0, Math.min(activeStep, steps.length - 1));

  if (compact) {
    return (
      <div className="coach-thinking-compact" role="status" aria-live="polite">
        <BoFace state="thinking" size={34} />
        <div>
          <ThinkingDots label={title} />
          <div className="mt-0.5 text-[10.5px] text-ink-40">{steps[safeStep]}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="coach-thinking-card" role="status" aria-live="polite">
      <div className="coach-thinking-orbit">
        <BoMascot state="thinking" size={94} className="bo-float" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-extrabold tracking-[1.1px] text-indigo">BO · WORKING WITH YOUR ANSWERS</div>
        <div className="mt-1 text-[17px] font-extrabold tracking-[-0.35px]"><ThinkingDots label={title} /></div>
        <div className="mt-3 flex flex-col gap-2">
          {steps.map((step, index) => {
            const done = index < safeStep;
            const active = index === safeStep;
            return (
              <div key={step} className="flex items-center gap-2.5" style={{ opacity: done || active ? 1 : 0.38 }}>
                <span className={`thinking-step ${done ? "is-done" : ""} ${active ? "is-active" : ""}`}>
                  {done ? "✓" : ""}
                </span>
                <span className="text-[12px] font-semibold leading-[1.25]">{step}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
