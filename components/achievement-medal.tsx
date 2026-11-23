"use client";

import { BoFace } from "./bo";

const PALETTES = [
  ["#EEF0FF", "#5B5BF5"],
  ["#FFF0E4", "#FF8A5B"],
  ["#EDFAF3", "#3A8E68"],
  ["#FFF9D8", "#C4A814"],
] as const;

export function AchievementMedal({
  name,
  unlocked,
  index = 0,
  size = 78,
}: {
  name: string;
  unlocked: boolean;
  index?: number;
  size?: number;
}) {
  const [bg, accent] = PALETTES[index % PALETTES.length];
  return (
    <div
      className={`achievement-medal ${unlocked ? "is-unlocked anim-pop" : "is-locked"}`}
      style={{ width: size, height: size, background: unlocked ? bg : "#ECEBE8", color: unlocked ? accent : "#A9A7A2" }}
      aria-label={`${name}, ${unlocked ? "unlocked" : "locked"}`}
    >
      <span className="achievement-medal-ring" style={{ borderColor: "currentColor" }} />
      <BoFace state={unlocked ? "celebrating" : "sleeping"} size={size * 0.56} />
      {unlocked && <span className="achievement-medal-check">✓</span>}
      {!unlocked && <span className="achievement-medal-lock">•</span>}
    </div>
  );
}
