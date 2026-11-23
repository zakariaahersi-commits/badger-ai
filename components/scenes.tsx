// Bo scenes — Alan-style spot illustrations. Bo composed with drawn props
// (flag, calendar, megaphone, magnifier) on a soft ground blob, for
// celebrations, empty states, and the gate. Same line language as the icons.

import { BoMascot } from "./bo";

const INK = "#1A1A1A";

function Ground({ w }: { w: number }) {
  return (
    <svg width={w} height={w * 0.22} viewBox="0 0 200 44" className="absolute bottom-0 left-0">
      <ellipse cx="100" cy="30" rx="92" ry="13" fill="#FDE7D6" />
      <path d="M30 33 q6 -4 12 0 M150 36 q6 -4 12 0" stroke="rgba(26,26,26,0.18)" strokeWidth="1.4" strokeLinecap="round" fill="none" />
    </svg>
  );
}

function Flag({ size }: { size: number }) {
  return (
    <svg width={size} height={size * 1.25} viewBox="0 0 40 50">
      <path d="M9 48 V5" stroke={INK} strokeWidth="2.2" strokeLinecap="round" />
      <path d="M9 6 C 17 2.5 24 2.5 32 6 L 32 18 C 24 21.5 17 21.5 9 18 Z" fill="#ECD935" stroke={INK} strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="17" cy="10.5" r="1.5" fill={INK} />
      <circle cx="25" cy="13" r="1.5" fill={INK} />
      <ellipse cx="11" cy="48" rx="7" ry="2" fill="rgba(26,26,26,0.1)" />
    </svg>
  );
}

function Calendar({ size }: { size: number }) {
  return (
    <svg width={size} height={size * 0.92} viewBox="0 0 60 55" style={{ transform: "rotate(-7deg)" }}>
      <rect x="4" y="8" width="52" height="44" rx="7" fill="#FFFFFF" stroke={INK} strokeWidth="2" />
      <path d="M4 20 H56" stroke={INK} strokeWidth="1.6" />
      <path d="M17 3.5 v8 M43 3.5 v8" stroke={INK} strokeWidth="2.4" strokeLinecap="round" />
      {[0, 1, 2].map((r) =>
        [0, 1, 2, 3].map((c) => (
          <circle key={`${r}${c}`} cx={15 + c * 10.5} cy={28 + r * 8.5} r="1.6" fill={r * 4 + c < 5 ? "#ECD935" : "rgba(26,26,26,0.18)"} />
        ))
      )}
    </svg>
  );
}

function Megaphone({ size }: { size: number }) {
  return (
    <svg width={size} height={size * 0.8} viewBox="0 0 60 48" style={{ transform: "rotate(-14deg)" }}>
      <path d="M8 26 L 34 12 C 38 10 41 12 41 16 L 41 30 C 41 34 38 36 34 34 L 8 22 Z" fill="#ECD935" stroke={INK} strokeWidth="1.8" strokeLinejoin="round" />
      <rect x="4" y="20" width="7" height="9" rx="2.5" fill="#FBF7EB" stroke={INK} strokeWidth="1.6" />
      <path d="M47 14 q4 9 0 18 M52 10 q6 13 0 26" stroke={INK} strokeWidth="1.8" strokeLinecap="round" fill="none" />
    </svg>
  );
}

function Magnifier({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" style={{ transform: "rotate(12deg)" }}>
      <circle cx="20" cy="18" r="12.5" fill="rgba(255,255,255,0.75)" stroke={INK} strokeWidth="2.2" />
      <circle cx="20" cy="18" r="8.5" stroke="rgba(26,26,26,0.15)" strokeWidth="1.4" fill="none" />
      <path d="M29.5 28 L 39 40" stroke={INK} strokeWidth="3.6" strokeLinecap="round" />
      <path d="M14.5 13.5 q3 -3 7 -2" stroke="rgba(26,26,26,0.35)" strokeWidth="1.6" strokeLinecap="round" fill="none" />
    </svg>
  );
}

function Sparkles({ w }: { w: number }) {
  return (
    <svg width={w} height={w * 0.5} viewBox="0 0 200 100" className="absolute top-0 left-0">
      {[
        [28, 30, 5, "#ECD935"],
        [170, 22, 4, "#4CAF82"],
        [186, 62, 3, "#EF4444"],
        [12, 66, 3.4, "#ECD935"],
      ].map(([x, y, r, c], i) => (
        <path
          key={i}
          d={`M${x} ${(y as number) - (r as number)} L${(x as number) + (r as number) * 0.35} ${(y as number) - (r as number) * 0.35} L${(x as number) + (r as number)} ${y} L${(x as number) + (r as number) * 0.35} ${(y as number) + (r as number) * 0.35} L${x} ${(y as number) + (r as number)} L${(x as number) - (r as number) * 0.35} ${(y as number) + (r as number) * 0.35} L${(x as number) - (r as number)} ${y} L${(x as number) - (r as number) * 0.35} ${(y as number) - (r as number) * 0.35} Z`}
          fill={c as string}
          opacity="0.9"
        />
      ))}
    </svg>
  );
}

export type SceneName = "summit" | "asleep" | "megaphone" | "research";

export function BoScene({
  scene,
  size = 170,
  className = "",
}: {
  scene: SceneName;
  size?: number;
  className?: string;
}) {
  const h = size * 0.82;
  const common = "absolute";
  return (
    <div className={`relative ${className}`} style={{ width: size, height: h }} aria-label={`Bo scene: ${scene}`} role="img">
      <Ground w={size} />
      {scene === "summit" && (
        <>
          <Sparkles w={size} />
          <div className={common} style={{ right: size * 0.12, bottom: h * 0.1 }}>
            <Flag size={size * 0.26} />
          </div>
          <div className={common} style={{ left: size * 0.16, bottom: h * 0.05 }}>
            <BoMascot state="celebrating" size={size * 0.52} />
          </div>
        </>
      )}
      {scene === "asleep" && (
        <>
          <div className={common} style={{ right: size * 0.1, bottom: h * 0.08 }}>
            <Calendar size={size * 0.42} />
          </div>
          <div className={common} style={{ left: size * 0.14, bottom: h * 0.05 }}>
            <BoMascot state="sleeping" size={size * 0.5} />
          </div>
        </>
      )}
      {scene === "megaphone" && (
        <>
          <div className={common} style={{ left: size * 0.12, bottom: h * 0.05 }}>
            <BoMascot state="fired-up" size={size * 0.52} />
          </div>
          <div className={common} style={{ right: size * 0.06, bottom: h * 0.3 }}>
            <Megaphone size={size * 0.4} />
          </div>
        </>
      )}
      {scene === "research" && (
        <>
          <div className={common} style={{ left: size * 0.14, bottom: h * 0.05 }}>
            <BoMascot state="glasses-on" size={size * 0.52} />
          </div>
          <div className={common} style={{ right: size * 0.1, bottom: h * 0.12 }}>
            <Magnifier size={size * 0.36} />
          </div>
        </>
      )}
    </div>
  );
}
