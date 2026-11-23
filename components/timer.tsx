"use client";

// The 10-minute starter — procrastination is emotion regulation, not laziness
// (Sirois & Pychyl). The intervention that works is shrinking the start:
// commit to 10 minutes, not to finishing. This timer is that commitment.

import { useEffect, useRef, useState } from "react";
import { BoMascot } from "./bo";

export function FocusTimer({
  taskTitle,
  onLog,
  onClose,
}: {
  taskTitle: string;
  onLog: () => void;
  onClose: () => void;
}) {
  const TOTAL = 10 * 60;
  const [left, setLeft] = useState(TOTAL);
  const [running, setRunning] = useState(true);
  const iv = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!running) return;
    iv.current = setInterval(() => setLeft((l) => Math.max(0, l - 1)), 1000);
    return () => {
      if (iv.current) clearInterval(iv.current);
    };
  }, [running]);

  const done = left === 0;
  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");
  const progress = 1 - left / TOTAL;
  const started = left < TOTAL - 5;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-peach">
      <div className="w-full max-w-[480px] min-h-dvh flex flex-col items-center justify-center px-8 text-center relative">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 w-8 h-8 rounded-full bg-ink-10 border-none text-[16px] cursor-pointer"
          aria-label="Close timer"
        >
          ×
        </button>

        <BoMascot state={done ? "celebrating" : "fired-up"} size={120} className={done ? "anim-bounce-soft" : ""} />

        <div className="mt-5 text-[11px] font-bold tracking-[1.4px] text-ink-60 uppercase">
          {done ? "Ten minutes. Done." : "Just ten minutes"}
        </div>
        <div className="mt-1.5 text-[15px] font-semibold max-w-[300px] leading-[1.35]">{taskTitle}</div>

        {/* the clock */}
        <div className="badger-number mt-7 text-[72px] font-bold tracking-[-3px] leading-none">
          {done ? "00:00" : `${mm}:${ss}`}
        </div>
        <div className="mt-5 w-full max-w-[280px] h-2.5 bg-ink-10 rounded-full overflow-hidden">
          <div className="h-full bg-yellow rounded-full transition-all duration-1000" style={{ width: `${progress * 100}%` }} />
        </div>

        <p className="mt-5 text-[13.5px] text-ink-60 leading-[1.5] max-w-[290px]">
          {done
            ? "Starting was the whole battle. Whatever you got done, log it. It counts."
            : started
              ? "You already started. That was the hard part. Keep going until the badger says stop."
              : "You're not committing to finishing. You're committing to ten minutes. Anyone can do ten minutes."}
        </p>

        <div className="mt-8 w-full max-w-[320px] flex flex-col gap-2.5">
          {done ? (
            <button type="button" onClick={onLog} className="spring w-full py-[18px] rounded-[14px] border-none bg-yellow text-ink text-[16px] font-bold cursor-pointer shadow-btn-yellow">
              Log what I did →
            </button>
          ) : (
            <>
              <button type="button" onClick={onLog} className="spring w-full py-[18px] rounded-[14px] border-none bg-yellow text-ink text-[16px] font-bold cursor-pointer shadow-btn-yellow">
                Done early · log it →
              </button>
              <button
                type="button"
                onClick={() => setRunning(!running)}
                className="spring w-full py-3 rounded-[14px] border-[1.5px] border-ink-20 bg-transparent text-[14px] font-semibold cursor-pointer"
              >
                {running ? "Pause" : "Resume"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
