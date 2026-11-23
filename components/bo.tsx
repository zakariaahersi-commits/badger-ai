// Bo — the Byqqa mascot. A cream-white badger with the signature raised
// eyebrow and two dark face stripes. Slightly anxious, always honest.
// Variants: idle | celebrating | disappointed | thinking | fired-up | glasses-on | sleeping
// Pure SVG so a Lottie/Rive swap can drop in later.

export type BoState =
  | "idle"
  | "celebrating"
  | "disappointed"
  | "thinking"
  | "fired-up"
  | "glasses-on"
  | "sleeping";

type Cfg = {
  browL: number;
  browR: number;
  eyeOpen: number;
  mouthY: number;
  lean: number;
  armL: number;
  armR: number;
  blush: number;
  lookUp?: boolean;
  glasses?: boolean;
  sleep?: boolean;
};

const STATES: Record<BoState, Cfg> = {
  idle: { browL: -2, browR: -8, eyeOpen: 1, mouthY: 0, lean: 0, armL: 0, armR: 0, blush: 0 },
  celebrating: { browL: -10, browR: -10, eyeOpen: 0.6, mouthY: 4, lean: -2, armL: -55, armR: 55, blush: 1 },
  disappointed: { browL: 4, browR: -2, eyeOpen: 0.85, mouthY: -3, lean: 4, armL: 0, armR: 0, blush: 0 },
  thinking: { browL: -4, browR: -10, eyeOpen: 1, mouthY: 0, lean: -1, armL: 0, armR: 0, blush: 0, lookUp: true },
  "fired-up": { browL: -8, browR: -12, eyeOpen: 1, mouthY: 2, lean: -3, armL: -20, armR: 20, blush: 1 },
  "glasses-on": { browL: -2, browR: -8, eyeOpen: 1, mouthY: 0, lean: 0, armL: 0, armR: 0, blush: 0, glasses: true },
  sleeping: { browL: 0, browR: -6, eyeOpen: 0.05, mouthY: -1, lean: 2, armL: 0, armR: 0, blush: 0, sleep: true },
};

export function BoMascot({
  state = "idle",
  size = 120,
  style = {},
  className,
}: {
  state?: BoState;
  size?: number;
  style?: React.CSSProperties;
  className?: string;
}) {
  const cfg = STATES[state] ?? STATES.idle;
  const eyeRy = 3.4 * cfg.eyeOpen;
  const lookX = cfg.lookUp ? -1.5 : 0;
  const lookY = cfg.lookUp ? -2 : 0;
  const uid = `bo-${state}`;

  return (
    <svg
      viewBox="0 0 100 105"
      width={size}
      height={size * 1.05}
      style={{ display: "block", ...style }}
      className={className}
      aria-label={`Bo the badger, ${state}`}
      role="img"
    >
      <defs>
        <radialGradient id={`${uid}-body`} cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#FBF7EB" />
          <stop offset="100%" stopColor="#EFE8D2" />
        </radialGradient>
        <linearGradient id={`${uid}-back`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4A453C" />
          <stop offset="100%" stopColor="#332F28" />
        </linearGradient>
      </defs>

      {/* ground shadow */}
      <ellipse cx="50" cy="100" rx="22" ry="2.5" fill="#1A1A1A" opacity="0.08" />

      <g transform={`translate(50 ${52 + cfg.lean}) rotate(${cfg.lean * 0.5})`}>
        {/* arms (little paws; raised when celebrating / fired up) */}
        <g
          transform={`translate(-22 2) rotate(${cfg.armL})`}
          style={{ transition: "transform .25s" }}
        >
          <path
            d="M 0 0 Q -9 6 -8 14 Q -3 12 0 6 Z"
            fill={`url(#${uid}-body)`}
            stroke="#1A1A1A"
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
        </g>
        <g
          transform={`translate(22 2) rotate(${cfg.armR})`}
          style={{ transition: "transform .25s" }}
        >
          <path
            d="M 0 0 Q 9 6 8 14 Q 3 12 0 6 Z"
            fill={`url(#${uid}-body)`}
            stroke="#1A1A1A"
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
        </g>

        {/* body — round badger, dark back / cream belly */}
        <ellipse cx="0" cy="2" rx="24" ry="26" fill={`url(#${uid}-back)`} stroke="#1A1A1A" strokeWidth="1.6" />
        <path
          d="M -16 -8 Q 0 4 16 -8 Q 18 14 0 27 Q -18 14 -16 -8 Z"
          fill={`url(#${uid}-body)`}
          stroke="#1A1A1A"
          strokeWidth="1.2"
        />

        {/* ears — small, low, behind the head (badger, not panda) */}
        <g>
          <circle cx="-17" cy="-21" r="4" fill={`url(#${uid}-back)`} stroke="#1A1A1A" strokeWidth="1.3" />
          <circle cx="-17" cy="-21" r="1.7" fill="#FBF7EB" opacity="0.85" />
          <circle cx="17" cy="-21" r="4" fill={`url(#${uid}-back)`} stroke="#1A1A1A" strokeWidth="1.3" />
          <circle cx="17" cy="-21" r="1.7" fill="#FBF7EB" opacity="0.85" />
        </g>

        {/* head — cream face, slightly tapered toward the snout */}
        <path
          d="M -20 -14 C -20 -24 -11 -28 0 -28 C 11 -28 20 -24 20 -14 C 20 -6 13 2.5 0 2.5 C -13 2.5 -20 -6 -20 -14 Z"
          fill={`url(#${uid}-body)`}
          stroke="#1A1A1A"
          strokeWidth="1.6"
        />

        {/* signature badger stripes — crown, THROUGH the eyes, to the snout */}
        <path
          d="M -13.5 -25.5 C -14.5 -17 -12.5 -8 -9.5 -1 C -7 0.2 -4.5 -0.2 -3.5 -2 C -5.2 -10 -5.5 -18 -5.5 -26.8 C -8.5 -27.8 -11.5 -27 -13.5 -25.5 Z"
          fill={`url(#${uid}-back)`}
        />
        <path
          d="M 13.5 -25.5 C 14.5 -17 12.5 -8 9.5 -1 C 7 0.2 4.5 -0.2 3.5 -2 C 5.2 -10 5.5 -18 5.5 -26.8 C 8.5 -27.8 11.5 -27 13.5 -25.5 Z"
          fill={`url(#${uid}-back)`}
        />

        {/* eyes — white rings popping out of the dark stripes (the badger look) */}
        <g transform={`translate(${lookX} ${lookY})`}>
          <circle cx="-9" cy="-12" r="4.8" fill="#FFFFFF" stroke="#1A1A1A" strokeWidth="1.2" />
          <ellipse cx="-9" cy="-12" rx="2.4" ry={eyeRy} fill="#1A1A1A" />
          {!cfg.sleep && <circle cx="-8.2" cy="-13" r="0.9" fill="#FFFFFF" />}

          <circle cx="9" cy="-12" r="4.8" fill="#FFFFFF" stroke="#1A1A1A" strokeWidth="1.2" />
          <ellipse cx="9" cy="-12" rx="2.4" ry={eyeRy} fill="#1A1A1A" />
          {!cfg.sleep && <circle cx="9.8" cy="-13" r="0.9" fill="#FFFFFF" />}
        </g>

        {/* eyebrows — cream on the dark stripes; left flat, right RAISED (signature) */}
        <path
          d={`M -12.5 ${-19.5 + cfg.browL} L -5.5 ${-19 + cfg.browL}`}
          stroke="#FBF7EB"
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d={`M 5.5 ${-20 + cfg.browR} Q 9.5 ${-23 + cfg.browR} 12.5 ${-19.5 + cfg.browR}`}
          stroke="#FBF7EB"
          strokeWidth="2.2"
          strokeLinecap="round"
          fill="none"
        />

        {/* snout — dark badger nose + mouth */}
        <ellipse cx="0" cy="-3.5" rx="3.4" ry="2.6" fill="#1A1A1A" />
        <path
          d={`M -3 ${1.5 + cfg.mouthY * 0.5} Q 0 ${3.5 + cfg.mouthY} 3 ${1.5 + cfg.mouthY * 0.5}`}
          stroke="#1A1A1A"
          strokeWidth="1.3"
          strokeLinecap="round"
          fill="none"
        />

        {/* blush */}
        {cfg.blush > 0 && (
          <>
            <ellipse cx="-14" cy="-5" rx="3.5" ry="2" fill="#F4A8A8" opacity={cfg.blush * 0.6} />
            <ellipse cx="14" cy="-5" rx="3.5" ry="2" fill="#F4A8A8" opacity={cfg.blush * 0.6} />
          </>
        )}

        {/* sleep Z's */}
        {cfg.sleep && (
          <g transform="translate(16 -28)" fill="#1A1A1A" fontFamily="serif" fontWeight="700">
            <text x="0" y="0" fontSize="6">
              z
            </text>
            <text x="4" y="-5" fontSize="8">
              z
            </text>
          </g>
        )}

        {/* glasses */}
        {cfg.glasses && (
          <g stroke="#1A1A1A" strokeWidth="1.4" fill="none">
            <circle cx="-9" cy="-12" r="6.5" />
            <circle cx="9" cy="-12" r="6.5" />
            <line x1="-2.5" y1="-12" x2="2.5" y2="-12" />
            <line x1="-15.5" y1="-12" x2="-18.5" y2="-14" />
            <line x1="15.5" y1="-12" x2="18.5" y2="-14" />
          </g>
        )}

        {/* feet — stubby badger paws with claws */}
        <g fill={`url(#${uid}-back)`} stroke="#1A1A1A" strokeWidth="1.3">
          <ellipse cx="-9" cy="28" rx="6" ry="3.6" />
          <ellipse cx="9" cy="28" rx="6" ry="3.6" />
        </g>
        <g stroke="#1A1A1A" strokeWidth="0.9" strokeLinecap="round">
          <path d="M -12 30.5 L -12 32 M -9 31 L -9 32.5 M -6 30.5 L -6 32" />
          <path d="M 6 30.5 L 6 32 M 9 31 L 9 32.5 M 12 30.5 L 12 32" />
        </g>
      </g>
    </svg>
  );
}

// Head-only Bo for small sizes (avatars, chat, notes) — the full body
// loses all detail under ~48px; the face doesn't.
export function BoFace({
  state = "idle",
  size = 36,
  className,
  style = {},
}: {
  state?: BoState;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const cfg = STATES[state] ?? STATES.idle;
  const eyeRy = 3.4 * cfg.eyeOpen;
  const uid = `boface-${state}`;
  return (
    <svg
      viewBox="0 0 52 46"
      width={size}
      height={size * 0.885}
      className={className}
      style={{ display: "block", ...style }}
      aria-label={`Bo, ${state}`}
      role="img"
    >
      <defs>
        <radialGradient id={`${uid}-body`} cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#FBF7EB" />
          <stop offset="100%" stopColor="#EFE8D2" />
        </radialGradient>
        <linearGradient id={`${uid}-back`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4A453C" />
          <stop offset="100%" stopColor="#332F28" />
        </linearGradient>
      </defs>
      <g transform="translate(26 32)">
        <circle cx="-17" cy="-21" r="4" fill={`url(#${uid}-back)`} stroke="#1A1A1A" strokeWidth="1.3" />
        <circle cx="17" cy="-21" r="4" fill={`url(#${uid}-back)`} stroke="#1A1A1A" strokeWidth="1.3" />
        <path
          d="M -20 -14 C -20 -24 -11 -28 0 -28 C 11 -28 20 -24 20 -14 C 20 -6 13 2.5 0 2.5 C -13 2.5 -20 -6 -20 -14 Z"
          fill={`url(#${uid}-body)`}
          stroke="#1A1A1A"
          strokeWidth="1.6"
        />
        <path d="M -13.5 -25.5 C -14.5 -17 -12.5 -8 -9.5 -1 C -7 0.2 -4.5 -0.2 -3.5 -2 C -5.2 -10 -5.5 -18 -5.5 -26.8 C -8.5 -27.8 -11.5 -27 -13.5 -25.5 Z" fill={`url(#${uid}-back)`} />
        <path d="M 13.5 -25.5 C 14.5 -17 12.5 -8 9.5 -1 C 7 0.2 4.5 -0.2 3.5 -2 C 5.2 -10 5.5 -18 5.5 -26.8 C 8.5 -27.8 11.5 -27 13.5 -25.5 Z" fill={`url(#${uid}-back)`} />
        <circle cx="-9" cy="-12" r="4.8" fill="#FFFFFF" stroke="#1A1A1A" strokeWidth="1.2" />
        <ellipse cx="-9" cy="-12" rx="2.4" ry={eyeRy} fill="#1A1A1A" />
        <circle cx="9" cy="-12" r="4.8" fill="#FFFFFF" stroke="#1A1A1A" strokeWidth="1.2" />
        <ellipse cx="9" cy="-12" rx="2.4" ry={eyeRy} fill="#1A1A1A" />
        <path d={`M -12.5 ${-19.5 + cfg.browL} L -5.5 ${-19 + cfg.browL}`} stroke="#FBF7EB" strokeWidth="2" strokeLinecap="round" fill="none" />
        <path d={`M 5.5 ${-20 + cfg.browR} Q 9.5 ${-23 + cfg.browR} 12.5 ${-19.5 + cfg.browR}`} stroke="#FBF7EB" strokeWidth="2.2" strokeLinecap="round" fill="none" />
        <ellipse cx="0" cy="-3.5" rx="3.4" ry="2.6" fill="#1A1A1A" />
        <path d={`M -3 ${1.5 + cfg.mouthY * 0.5} Q 0 ${3.5 + cfg.mouthY} 3 ${1.5 + cfg.mouthY * 0.5}`} stroke="#1A1A1A" strokeWidth="1.3" strokeLinecap="round" fill="none" />
        {cfg.blush > 0 && (
          <>
            <ellipse cx="-14" cy="-5" rx="3.5" ry="2" fill="#F4A8A8" opacity={cfg.blush * 0.6} />
            <ellipse cx="14" cy="-5" rx="3.5" ry="2" fill="#F4A8A8" opacity={cfg.blush * 0.6} />
          </>
        )}
      </g>
    </svg>
  );
}

// Bo + speech bubble — his hallmark delivery.
export function BoSays({
  children,
  state = "idle",
  size = 96,
  align = "left",
  tight = false,
}: {
  children: React.ReactNode;
  state?: BoState;
  size?: number;
  align?: "left" | "right";
  tight?: boolean;
}) {
  return (
    <div
      className="flex items-end gap-3.5"
      style={{ flexDirection: align === "right" ? "row-reverse" : "row" }}
    >
      <div className="shrink-0">
        <BoMascot state={state} size={size} />
      </div>
      <div
        className="bg-paper border-[1.5px] border-ink rounded-[18px] shadow-comic text-[16px] leading-[1.4] tracking-[-0.2px] max-w-[260px] relative"
        style={{ padding: tight ? "12px 16px" : "16px 18px" }}
      >
        {children}
      </div>
    </div>
  );
}
