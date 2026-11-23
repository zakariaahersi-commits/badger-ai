"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BrandBo } from "@/components/brand-bo";
import { demoMode } from "@/lib/cloud";

const IDLE_DELAY_MS = 75_000;
const SESSION_KEY = "badger-idle-bo-seen";

export function IdleBoPrompt() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (pathname === "/app/bo" || sessionStorage.getItem(SESSION_KEY) === "1") return;

    let completed = false;
    const previewDelay = demoMode && new URLSearchParams(window.location.search).get("idle_bo") === "1";
    const delay = previewDelay ? 350 : IDLE_DELAY_MS;
    let timer = window.setTimeout(show, delay);

    function show() {
      if (completed || document.visibilityState !== "visible") return;
      completed = true;
      sessionStorage.setItem(SESSION_KEY, "1");
      setVisible(true);
    }

    function reset() {
      if (completed) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(show, delay);
    }

    const events: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "scroll", "touchstart"];
    events.forEach((event) => window.addEventListener(event, reset, { passive: true }));
    return () => {
      window.clearTimeout(timer);
      events.forEach((event) => window.removeEventListener(event, reset));
    };
  }, [pathname]);

  if (!visible || pathname === "/app/bo") return null;

  return (
    <aside className="fixed bottom-[calc(5.4rem+env(safe-area-inset-bottom))] left-1/2 z-30 w-full max-w-[480px] -translate-x-1/2 px-3" aria-label="Bo is ready to help" aria-live="polite">
      <div className="idle-bo-card ml-auto flex w-[min(330px,calc(100vw-24px))] items-end gap-2 overflow-hidden rounded-[22px] border border-white/80 bg-paper/95 pr-3 shadow-[0_18px_55px_rgba(26,26,26,0.2)] backdrop-blur-xl">
        <BrandBo pose="peek" size={96} alt="Bo" className="-mb-3 -ml-2" />
        <Link href="/app/bo" className="min-w-0 flex-1 py-3 text-ink no-underline">
          <div className="text-[10px] font-extrabold tracking-[1.1px] text-indigo">BO IS HERE</div>
          <div className="mt-0.5 text-[13px] font-bold leading-[1.3]">Still thinking? Let&apos;s make the next step smaller.</div>
        </Link>
        <button type="button" onClick={() => setVisible(false)} className="mb-auto mt-2 grid h-11 w-11 shrink-0 place-items-center rounded-full border-0 bg-ink-10 text-[18px] text-ink cursor-pointer" aria-label="Dismiss Bo">×</button>
      </div>
    </aside>
  );
}
