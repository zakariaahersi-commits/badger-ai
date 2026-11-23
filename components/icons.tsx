// Byqqa icon system — hand-drawn-feel stroke icons replacing emoji.
// Rules (Alan-style): 1.8px rounded strokes matching Bo's line weight,
// 24px grid, always shown inside a soft tint chip (two-tone).

type IconProps = { size?: number; color?: string; strokeWidth?: number };

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none" as const,
});

const stroke = (color: string, strokeWidth: number) => ({
  stroke: color,
  strokeWidth,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

export function IconFlame({ size = 20, color = "#1A1A1A", strokeWidth = 1.8 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path
        d="M12 3.5c.4 2.6 2.2 3.9 3.6 5.6 1.2 1.5 1.9 3 1.9 4.7a5.5 5.5 0 0 1-11 0c0-2.3 1.3-3.7 2.5-5.2C10.2 7.1 11.6 5.8 12 3.5Z"
        {...stroke(color, strokeWidth)}
      />
      <path d="M12 13.2c-1 .9-1.6 1.7-1.6 2.8a1.8 1.8 0 0 0 3.6 0c0-1.1-1-1.9-2-2.8Z" {...stroke(color, strokeWidth * 0.8)} />
    </svg>
  );
}

export function IconShield({ size = 20, color = "#1A1A1A", strokeWidth = 1.8 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M12 3.2 18.8 5.6v5.2c0 4.6-2.8 7.8-6.8 9.4-4-1.6-6.8-4.8-6.8-9.4V5.6L12 3.2Z" {...stroke(color, strokeWidth)} />
      <path d="M9 11.6l2.1 2.2 3.9-4.2" {...stroke(color, strokeWidth)} />
    </svg>
  );
}

export function IconHeart({ size = 20, color = "#1A1A1A", strokeWidth = 1.8 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path
        d="M12 19.5c-4.6-3.1-8-5.9-8-9.5a4.3 4.3 0 0 1 8-2.2A4.3 4.3 0 0 1 20 10c0 3.6-3.4 6.4-8 9.5Z"
        {...stroke(color, strokeWidth)}
      />
    </svg>
  );
}

export function IconTarget({ size = 20, color = "#1A1A1A", strokeWidth = 1.8 }: IconProps) {
  return (
    <svg {...base(size)}>
      <circle cx="12" cy="12" r="8.2" {...stroke(color, strokeWidth)} />
      <circle cx="12" cy="12" r="4.4" {...stroke(color, strokeWidth)} />
      <circle cx="12" cy="12" r="1.1" fill={color} />
    </svg>
  );
}

export function IconPhone({ size = 20, color = "#1A1A1A", strokeWidth = 1.8 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path
        d="M6.2 4.5c.9-.9 2.3-.8 3 .2l1.1 1.6c.6.9.5 2-.3 2.7l-.8.8c.5 1.4 2 2.9 3.4 3.4l.8-.8c.7-.8 1.8-.9 2.7-.3l1.6 1.1c1 .7 1.1 2.1.2 3-1.3 1.3-3.4 1.7-5.1.9-3-1.4-5.9-4.3-7.3-7.3-.8-1.7-.4-3.8.7-5.3Z"
        {...stroke(color, strokeWidth)}
      />
    </svg>
  );
}

export function IconWarning({ size = 20, color = "#1A1A1A", strokeWidth = 1.8 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M12 4.2 20.2 18.4a1.4 1.4 0 0 1-1.2 2.1H5a1.4 1.4 0 0 1-1.2-2.1L12 4.2Z" {...stroke(color, strokeWidth)} />
      <path d="M12 9.5v4.4" {...stroke(color, strokeWidth)} />
      <circle cx="12" cy="16.9" r="0.9" fill={color} />
    </svg>
  );
}

export function IconVote({ size = 20, color = "#1A1A1A", strokeWidth = 1.8 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M4.5 13h15v6.2a1.3 1.3 0 0 1-1.3 1.3H5.8a1.3 1.3 0 0 1-1.3-1.3V13Z" {...stroke(color, strokeWidth)} />
      <path d="M9.5 13h5" {...stroke(color, strokeWidth)} />
      <path d="M9.8 8.6 12.7 3.8l4.1 5.7-3.5 3.2-3.5-4.1Z" {...stroke(color, strokeWidth)} transform="rotate(8 12 8)" />
    </svg>
  );
}

export function IconLock({ size = 20, color = "#1A1A1A", strokeWidth = 1.8 }: IconProps) {
  return (
    <svg {...base(size)}>
      <rect x="5.5" y="10.5" width="13" height="9" rx="2.4" {...stroke(color, strokeWidth)} />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" {...stroke(color, strokeWidth)} />
      <circle cx="12" cy="15" r="1.1" fill={color} />
    </svg>
  );
}

export function IconFlag({ size = 20, color = "#1A1A1A", strokeWidth = 1.8 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M6 21V3.8" {...stroke(color, strokeWidth)} />
      <path d="M6 4.5c2.2-1.2 4.3-1.2 6.2 0 1.9 1.2 3.8 1.2 6 0v8c-2.2 1.2-4.1 1.2-6 0-1.9-1.2-4-1.2-6.2 0Z" {...stroke(color, strokeWidth)} />
      <circle cx="10" cy="8.2" r="0.85" fill={color} />
      <circle cx="14.5" cy="9" r="0.85" fill={color} />
    </svg>
  );
}

export function IconCheck({ size = 20, color = "#1A1A1A", strokeWidth = 2 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M5 12.5l4.4 4.7L19 6.8" {...stroke(color, strokeWidth)} />
    </svg>
  );
}

export function IconSkull({ size = 20, color = "#1A1A1A", strokeWidth = 1.8 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M12 3.5a7.3 7.3 0 0 0-7.3 7.3c0 2.5 1.2 4.4 3 5.6v2.4a1.2 1.2 0 0 0 1.2 1.2h6.2a1.2 1.2 0 0 0 1.2-1.2v-2.4c1.8-1.2 3-3.1 3-5.6A7.3 7.3 0 0 0 12 3.5Z" {...stroke(color, strokeWidth)} />
      <circle cx="9.2" cy="11" r="1.4" fill={color} />
      <circle cx="14.8" cy="11" r="1.4" fill={color} />
      <path d="M10.5 19.8v-1.6M13.5 19.8v-1.6" {...stroke(color, strokeWidth * 0.8)} />
    </svg>
  );
}

export function IconRocket({ size = 20, color = "#1A1A1A", strokeWidth = 1.8 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path
        d="M14.5 4.5c2.6-1 4.6-1 5 0 .4 1-.1 3-2 5.2l-5.7 6.6-3.6-3.6 6.3-8.2Z"
        {...stroke(color, strokeWidth)}
        transform="rotate(-4 14 10)"
      />
      <circle cx="14.6" cy="8.9" r="1.3" {...stroke(color, strokeWidth * 0.85)} />
      <path d="M8 13l-3.2 1.2 2.2 1M11 16.2l1.2 3.2 1-2.2M5.2 19.2l2-2" {...stroke(color, strokeWidth)} />
    </svg>
  );
}

export function IconCalendar({ size = 20, color = "#1A1A1A", strokeWidth = 1.8 }: IconProps) {
  return (
    <svg {...base(size)}>
      <rect x="4" y="5.5" width="16" height="14.5" rx="2.4" {...stroke(color, strokeWidth)} />
      <path d="M4 10h16M8.4 3.5v3.4M15.6 3.5v3.4" {...stroke(color, strokeWidth)} />
      <circle cx="12" cy="14.8" r="1.6" fill={color} />
    </svg>
  );
}

export function IconSparkle({ size = 20, color = "#1A1A1A", strokeWidth = 1.8 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M12 3.8c.6 3.7 2.4 5.5 6.2 6.2-3.8.7-5.6 2.5-6.2 6.2-.6-3.7-2.4-5.5-6.2-6.2 3.8-.7 5.6-2.5 6.2-6.2Z" {...stroke(color, strokeWidth)} />
      <path d="M18.5 15.5c.3 1.8 1.2 2.7 3 3-1.8.3-2.7 1.2-3 3-.3-1.8-1.2-2.7-3-3 1.8-.3 2.7-1.2 3-3Z" {...stroke(color, strokeWidth * 0.85)} />
    </svg>
  );
}

export function IconCoin({ size = 20, color = "#1A1A1A", strokeWidth = 1.8 }: IconProps) {
  return (
    <svg {...base(size)}>
      <circle cx="12" cy="12" r="8.2" {...stroke(color, strokeWidth)} />
      <path d="M12 7.2v9.6M14.6 9.2c-.5-.9-1.5-1.4-2.6-1.4-1.4 0-2.5.9-2.5 2.1 0 2.9 5 1.5 5 4.3 0 1.2-1.1 2.1-2.5 2.1-1.1 0-2.1-.5-2.6-1.4" {...stroke(color, strokeWidth * 0.9)} />
    </svg>
  );
}

// Two-tone chip — the Alan pattern: soft tint circle + deep-colored stroke icon.
export const TINTS = {
  yellow: { bg: "#F8EBB8", fg: "#8A7A13" },
  sage: { bg: "#DEEDE3", fg: "#3A8E68" },
  coral: { bg: "#F8DDD3", fg: "#C2410C" },
  red: { bg: "#F6D7D7", fg: "#B91C1C" },
  ink: { bg: "rgba(26,26,26,0.07)", fg: "#1A1A1A" },
  lilac: { bg: "#E8E2F4", fg: "#6D5BA8" },
} as const;

export function IconChip({
  icon: Icon,
  tint = "yellow",
  size = 38,
  iconSize,
}: {
  icon: (p: IconProps) => React.ReactNode;
  tint?: keyof typeof TINTS;
  size?: number;
  iconSize?: number;
}) {
  const t = TINTS[tint];
  return (
    <span
      className="rounded-full flex items-center justify-center shrink-0"
      style={{ width: size, height: size, background: t.bg }}
    >
      <Icon size={iconSize ?? Math.round(size * 0.55)} color={t.fg} />
    </span>
  );
}
