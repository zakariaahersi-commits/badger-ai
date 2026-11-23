import { BrandBo } from "./brand-bo";

const MILESTONES = [
  { day: 1, label: "Start", detail: "Choose one problem" },
  { day: 7, label: "Listen", detail: "Real conversations" },
  { day: 14, label: "Decide", detail: "Keep, change or close" },
  { day: 21, label: "Sell", detail: "Ask for payment" },
  { day: 28, label: "Launch", detail: "A customer or a clear answer" },
] as const;

export function LaunchPath({ day = 1, compact = false }: { day?: number; compact?: boolean }) {
  const safeDay = Math.max(1, Math.min(28, day));
  const progress = ((safeDay - 1) / 27) * 100;
  const currentMilestone = [...MILESTONES].reverse().find((milestone) => safeDay >= milestone.day)?.day ?? 1;

  return (
    <div className={compact ? "launch-path launch-path-compact" : "launch-path"}>
      <div className="launch-path-line" aria-hidden="true">
        <span className="launch-path-fill" style={{ width: `${progress}%` }} />
      </div>
      <div className="launch-path-bo" style={{ left: `${progress}%` }} aria-hidden="true">
        <BrandBo size={compact ? 50 : 66} facing={safeDay >= 21 ? "left" : "right"} />
      </div>
      <div className="launch-path-stops">
        {MILESTONES.map((milestone) => {
          const reached = safeDay >= milestone.day;
          const current = milestone.day === currentMilestone;
          return (
            <div key={milestone.day} className="launch-path-stop">
              <span className={`launch-path-dot ${reached ? "is-reached" : ""} ${current ? "is-current" : ""}`}>
                {reached ? "✓" : milestone.day}
              </span>
              {!compact && (
                <div className="mt-2">
                  <div className="text-[12px] font-bold">{milestone.label}</div>
                  <div className="mt-0.5 text-[10.5px] leading-[1.3] text-ink-60">{milestone.detail}</div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
