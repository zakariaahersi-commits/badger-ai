"use client";

import { useEffect, useRef, useState } from "react";
import { BrandBo } from "./brand-bo";
import type { FeedbackMoment } from "@/lib/feedback";

const MOMENTS: Record<FeedbackMoment, { title: string; line: string; pose: "front" | "peek" | "thinking" | "celebrate" | "recover"; tone: string }> = {
  start: { title: "You started.", line: "Bo is with you. Focus on this one step.", pose: "front", tone: "is-cobalt" },
  finish: { title: "Done and logged.", line: "That is real progress. Tomorrow builds on it.", pose: "celebrate", tone: "is-yellow" },
  proof: { title: "Evidence added.", line: "Bo will check what this proves and what it does not.", pose: "thinking", tone: "is-teal" },
  reply: { title: "Bo replied.", line: "Your co-founder has the next question ready.", pose: "peek", tone: "is-cobalt" },
  payment: { title: "A customer paid.", line: "This is the signal the whole journey was built to reach.", pose: "celebrate", tone: "is-yellow" },
  milestone: { title: "Milestone reached.", line: "Pause for a second. You earned this one.", pose: "celebrate", tone: "is-yellow" },
  missed: { title: "We continue today.", line: "No shame and no reset. One small move from here.", pose: "recover", tone: "is-peach" },
  day28: { title: "Day 28.", line: "Launch, choose, and leave with a real answer.", pose: "celebrate", tone: "is-cobalt" },
};

export function MomentOverlay() {
  const [moment, setMoment] = useState<FeedbackMoment | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const show = (event: Event) => {
      const next = (event as CustomEvent<{ moment?: FeedbackMoment }>).detail?.moment;
      if (!next || !MOMENTS[next]) return;
      // Today already owns a full-screen reward for these three moments.
      if (next === "finish" || next === "payment" || next === "milestone") return;
      if (timer.current) clearTimeout(timer.current);
      setMoment(next);
      timer.current = setTimeout(() => setMoment(null), next === "day28" ? 2600 : 1700);
    };
    window.addEventListener("badger:moment", show);
    return () => {
      window.removeEventListener("badger:moment", show);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  if (!moment) return null;
  const item = MOMENTS[moment];
  return (
    <div className={`moment-card ${item.tone}`} role="status" aria-live="polite">
      <BrandBo pose={item.pose} size={82} alt="Bo" />
      <div>
        <strong>{item.title}</strong>
        <span>{item.line}</span>
      </div>
    </div>
  );
}
