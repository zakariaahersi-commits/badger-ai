"use client";

// Shared Byqqa primitives — buttons, type, cards, chips, pills.

export function PrimaryButton({
  children,
  onClick,
  dark = false,
  accent = "yellow",
  disabled = false,
  className = "",
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  dark?: boolean;
  // GoClub × Alan refresh: indigo for commit/bridge CTAs, cobalt on bold bgs.
  accent?: "yellow" | "indigo" | "cobalt";
  disabled?: boolean;
  className?: string;
  type?: "button" | "submit";
}) {
  const tone = dark
    ? "bg-ink text-cream shadow-[0_1px_0_rgba(0,0,0,0.2)]"
    : accent === "indigo"
      ? "bg-indigo text-white shadow-btn-indigo"
      : accent === "cobalt"
        ? "bg-cobalt text-white shadow-glass"
        : "bg-yellow text-ink shadow-btn-yellow";
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`spring shrink-0 w-full px-5 py-[18px] rounded-[14px] border-none text-[17px] font-semibold tracking-[-0.2px] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${tone} ${className}`}
    >
      {children}
    </button>
  );
}

export function GhostButton({
  children,
  onClick,
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`spring shrink-0 w-full px-5 py-4 rounded-[14px] border-[1.5px] border-ink-20 bg-transparent text-ink text-[16px] font-medium cursor-pointer ${className}`}
    >
      {children}
    </button>
  );
}

export function ChoiceCard({
  children,
  selected = false,
  onClick,
  className = "",
}: {
  children: React.ReactNode;
  selected?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`spring shrink-0 w-full p-[17px] rounded-[18px] border-[1.5px] text-[15px] font-medium text-left tracking-[-0.1px] cursor-pointer shadow-[0_8px_24px_rgba(68,60,170,0.04)] ${
        selected
          ? "border-indigo bg-indigo text-white shadow-btn-indigo"
          : "border-white/80 bg-paper/90 text-ink hover:border-indigo/30"
      } ${className}`}
    >
      {children}
    </button>
  );
}

export function H1({
  children,
  serif = false,
  className = "",
  style = {},
}: {
  children: React.ReactNode;
  serif?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <h1
      className={`m-0 text-ink [text-wrap:balance] ${
        serif
          ? "font-serif font-semibold leading-[1.05] tracking-[-0.8px]"
          : "font-bold leading-[1.15] tracking-[-0.6px]"
      } ${className}`}
      style={{ fontSize: 32, ...style }}
    >
      {children}
    </h1>
  );
}

export function Eyebrow({
  children,
  className = "",
  style = {},
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`text-[12px] font-semibold tracking-[1.2px] uppercase text-ink-60 ${className}`}
      style={style}
    >
      {children}
    </div>
  );
}

export function Card({
  children,
  className = "",
  style = {},
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`rounded-[22px] border border-white/80 bg-paper/90 p-4 shadow-card backdrop-blur-sm ${className}`}
      style={style}
    >
      {children}
    </div>
  );
}

export function Pill({
  children,
  color = "var(--bygga-ink)",
  bg = "var(--bygga-ink10)",
  className = "",
}: {
  children: React.ReactNode;
  color?: string;
  bg?: string;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-[3px] rounded-full text-[10px] font-bold tracking-[0.4px] uppercase ${className}`}
      style={{ color, background: bg }}
    >
      {children}
    </span>
  );
}

export function Avatar({
  initial = "?",
  size = 32,
  bg = "var(--bygga-yellow)",
  src,
}: {
  initial?: string;
  size?: number;
  bg?: string;
  src?: string;
}) {
  return (
    <div
      className="rounded-full text-ink flex items-center justify-center font-bold shrink-0 overflow-hidden"
      style={{
        width: size,
        height: size,
        background: bg,
        backgroundImage: src ? `url(${src})` : undefined,
        backgroundPosition: "center",
        backgroundSize: "cover",
        fontSize: size * 0.45,
      }}
    >
      {src ? null : initial}
    </div>
  );
}

// Channel chip (X / LinkedIn / Gmail / Call / Stripe) — used everywhere
export function ChannelChip({
  kind,
  size = 18,
  withLabel = false,
}: {
  kind: "twitter" | "linkedin" | "gmail" | "call" | "stripe" | "sms";
  size?: number;
  withLabel?: boolean;
}) {
  const cfg = {
    twitter: { bg: "#1A1A1A", fg: "white", label: "X", glyph: "𝕏" },
    linkedin: { bg: "#0A66C2", fg: "white", label: "LinkedIn", glyph: "in" },
    gmail: { bg: "#FFFFFF", fg: "#D14836", label: "Gmail", glyph: "M", stroked: true },
    call: { bg: "#3A8E68", fg: "white", label: "Call", glyph: "☏" },
    stripe: { bg: "#635BFF", fg: "white", label: "Stripe", glyph: "$" },
    sms: { bg: "#34B7F1", fg: "white", label: "SMS", glyph: "✉" },
  }[kind];
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="rounded-full flex items-center justify-center shrink-0 font-bold leading-none"
        style={{
          width: size,
          height: size,
          background: cfg.bg,
          color: cfg.fg,
          fontSize: size * 0.52,
          border: "stroked" in cfg && cfg.stroked ? "1.5px solid rgba(26,26,26,0.2)" : "none",
        }}
      >
        {cfg.glyph}
      </span>
      {withLabel && (
        <span className="text-[11px] font-semibold text-ink-60">{cfg.label}</span>
      )}
    </span>
  );
}

// Onboarding progress bar
export function TopBar({
  progress,
  total,
  onBack,
  dark = false,
  label,
}: {
  progress: number;
  total: number;
  onBack?: () => void;
  dark?: boolean;
  label?: string;
}) {
  const fill = Math.min(1, progress / total);
  return (
    <div className="flex items-center gap-3 mb-5">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 cursor-pointer border-none"
          style={{ background: dark ? "rgba(255,255,255,0.1)" : "var(--bygga-ink10)" }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M9 2L3 7L9 12"
              stroke={dark ? "#FFF3E9" : "#1A1A1A"}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}
      <div
        className="flex-1 h-1.5 rounded-full overflow-hidden"
        style={{ background: dark ? "rgba(255,255,255,0.15)" : "var(--bygga-ink10)" }}
      >
        <div
          className="h-full rounded-sm transition-all duration-300"
          style={{ width: `${fill * 100}%`, background: dark ? "#FFF3E9" : "var(--bygga-indigo)" }}
        />
      </div>
      <div
        className="text-[12px] font-semibold tracking-[0.5px] tabular-nums"
        style={{ color: dark ? "rgba(250,247,240,0.7)" : "var(--bygga-ink60)" }}
      >
        {label || `${String(progress).padStart(2, "0")}/${total}`}
      </div>
    </div>
  );
}

// Phone-width column wrapper: mobile-first app feel on any screen.
export function PhoneFrame({
  children,
  tone = "peach",
}: {
  children: React.ReactNode;
  // "peach" = Alan warm base (default); "cobalt" = GoClub bold (paywall).
  tone?: "peach" | "cobalt";
}) {
  return (
    <div
      className={`min-h-dvh w-full flex justify-center ${
        tone === "cobalt" ? "bg-cobalt-grad" : "bg-peach"
      }`}
    >
      <div className="w-full max-w-[480px] min-h-dvh flex flex-col relative">
        {children}
      </div>
    </div>
  );
}
