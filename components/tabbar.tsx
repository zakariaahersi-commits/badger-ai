"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { id: "today", label: "Today", href: "/app" },
  { id: "plan", label: "Plan", href: "/app/plan" },
  { id: "activity", label: "Activity", href: "/app/activity" },
  { id: "community", label: "Community", href: "/app/community" },
  { id: "bo", label: "Bo", href: "/app/bo" },
] as const;

function Icon({ id, color, active }: { id: string; color: string; active: boolean }) {
  switch (id) {
    case "today":
      return (
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          <rect x="3" y="5" width="16" height="14" rx="2" stroke={color} strokeWidth="1.6" fill={active ? color : "none"} fillOpacity={active ? 0.12 : 0} />
          <line x1="3" y1="9" x2="19" y2="9" stroke={color} strokeWidth="1.6" />
          <line x1="7" y1="3" x2="7" y2="6" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
          <line x1="15" y1="3" x2="15" y2="6" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
          {active && <circle cx="11" cy="14" r="2" fill={color} />}
        </svg>
      );
    case "plan":
      return (
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          <line x1="4" y1="6" x2="14" y2="6" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
          <line x1="4" y1="11" x2="18" y2="11" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
          <line x1="4" y1="16" x2="11" y2="16" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
          {active && <circle cx="17.5" cy="16" r="1.8" fill={color} />}
        </svg>
      );
    case "activity":
      return (
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          <polyline points="3,15 7,10 11,13 15,6 19,9" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          {active && <circle cx="15" cy="6" r="2" fill={color} />}
        </svg>
      );
    case "community":
      return (
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          <circle cx="8" cy="9" r="3" stroke={color} strokeWidth="1.6" fill={active ? color : "none"} fillOpacity={active ? 0.15 : 0} />
          <circle cx="15" cy="10" r="2.2" stroke={color} strokeWidth="1.5" fill="none" />
          <path d="M3 18c0-2.5 2.2-4.5 5-4.5s5 2 5 4.5" stroke={color} strokeWidth="1.6" strokeLinecap="round" fill="none" />
          <path d="M13.5 18c0-1.8 1.4-3.2 3.5-3.2s3.5 1.4 3.5 3.2" stroke={color} strokeWidth="1.5" strokeLinecap="round" fill="none" />
        </svg>
      );
    default:
      // Bo — badger glyph: round face, ears, two eye stripes
      return (
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          <circle cx="6.5" cy="5.5" r="2" stroke={color} strokeWidth="1.4" fill={active ? color : "none"} fillOpacity={active ? 0.25 : 0} />
          <circle cx="15.5" cy="5.5" r="2" stroke={color} strokeWidth="1.4" fill={active ? color : "none"} fillOpacity={active ? 0.25 : 0} />
          <ellipse cx="11" cy="12" rx="7.5" ry="7" stroke={color} strokeWidth="1.6" fill={active ? color : "none"} fillOpacity={active ? 0.1 : 0} />
          <path d="M7 6.5 L8.5 11.5 M15 6.5 L13.5 11.5" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
          <circle cx="8.5" cy="11.5" r="1.2" fill={color} />
          <circle cx="13.5" cy="11.5" r="1.2" fill={color} />
          <ellipse cx="11" cy="14.5" rx="1.4" ry="1" fill={color} />
        </svg>
      );
  }
}

export function TabBar({ dark = false }: { dark?: boolean }) {
  const pathname = usePathname();
  return (
    <div
      className="fixed inset-x-0 bottom-0 mx-auto flex w-full max-w-[480px] justify-around pt-2 z-40"
      style={{
        paddingBottom: "max(14px, env(safe-area-inset-bottom))",
        background: dark ? "var(--bygga-ink)" : "var(--bygga-bg)",
        borderTop: `1px solid ${dark ? "rgba(255,255,255,0.1)" : "var(--bygga-ink10)"}`,
      }}
    >
      {TABS.map((t) => {
        const isActive = t.href === "/app" ? pathname === "/app" : pathname.startsWith(t.href);
        const fg = isActive
          ? dark
            ? "var(--bygga-yellow)"
            : "#1A1A1A"
          : dark
            ? "rgba(250,247,240,0.4)"
            : "rgba(26,26,26,0.4)";
        return (
          <Link key={t.id} href={t.href} aria-current={isActive ? "page" : undefined} data-tour={t.id === "bo" ? "bo-tab" : undefined} className="flex min-h-12 min-w-[56px] flex-col items-center justify-center gap-[3px] no-underline">
            <span className="transition-transform duration-300" style={{ transform: isActive ? "scale(1.15) translateY(-1px)" : "scale(1)" }}>
              <Icon id={t.id} color={fg} active={isActive} />
            </span>
            <span className="text-[10px]" style={{ color: fg, fontWeight: isActive ? 700 : 500 }}>
              {t.label}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
