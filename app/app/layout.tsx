"use client";

// App shell: phone-width column, bottom tabs, and the Kill-or-Commit gate
// that takes over when 3+ days are missed (PRD §6.5 — no snooze, no escape).

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter, usePathname } from "next/navigation";
import { TabBar } from "@/components/tabbar";
import { BrandBo } from "@/components/brand-bo";
import { IdleBoPrompt } from "@/components/idle-bo-prompt";
import { MomentOverlay } from "@/components/moment-overlay";
import { demoMode } from "@/lib/cloud";
import { hasActiveEntitlement, verifyCheckout } from "@/lib/payments";
import { useSession } from "@/lib/sync";
import { currentDayOf, missedInARow, useBygga } from "@/lib/store";
import type { Profile } from "@/lib/types";
import { track } from "@/lib/telemetry";
import { buildUgcPreviewState } from "@/lib/ugc-preview";

const noopSubscribe = () => () => {};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  // true after hydration — lets the persisted store load before we gate-check
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const s = useBygga();
  const { session, ready: sessionReady } = useSession();
  const [accessChecked, setAccessChecked] = useState(false);
  const checkoutSession =
    mounted && typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("session_id")
      : null;
  const previewMode =
    mounted && demoMode && typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("preview")
      : null;
  const previewStage =
    mounted && demoMode && typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("stage")
      : null;
  const ugcPreview = process.env.NODE_ENV !== "production" && previewMode === "ugc";
  const dashboardPreview = previewMode === "dashboard" || ugcPreview;
  const seededPreviewKey = useRef("");

  // Visual-QA seam. The UGC story is hard-disabled in production, while the
  // existing dashboard preview still follows the explicit demoMode flag.
  useEffect(() => {
    if (!dashboardPreview) return;
    const previewKey = `${previewMode}:${previewStage ?? "default"}`;
    if (seededPreviewKey.current === previewKey) return;
    seededPreviewKey.current = previewKey;
    if (ugcPreview) {
      useBygga.setState(buildUgcPreviewState(previewStage));
      return;
    }
    if (s.onboarded) return;
    const profile: Profile = {
      name: "Alex",
      idea: "A simple service that helps independent creators price their work",
      ideaShort: "pricing help for creators",
      industry: "Creator tools",
      track: "B",
      monthsCarried: "3 months",
      fear: "Nobody will pay for it.",
      thinkingTime: "Sunday morning",
      days: [1, 3, 5],
      sessionMinutes: 25,
      consequence: "Push me. Hard.",
    };
    s.completeOnboarding(profile);
    s.activateSprint(new Date().toISOString());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashboardPreview, previewMode, previewStage, ugcPreview, s.onboarded]);

  useEffect(() => {
    if (!mounted || !sessionReady || dashboardPreview) return;
    if (session && s.cloudHydratedUserId !== session.user.id) return;
    if (!s.onboarded) router.replace("/start");
    else if (!session) router.replace("/auth?next=/app");
  }, [mounted, sessionReady, dashboardPreview, s.cloudHydratedUserId, s.onboarded, session, router]);

  useEffect(() => {
    if (!mounted || !sessionReady || dashboardPreview || !session || s.cloudHydratedUserId !== session.user.id || !s.onboarded) return;
    let cancelled = false;
    const check = checkoutSession ? verifyCheckout(checkoutSession) : hasActiveEntitlement();
    check.then((access) => {
      if (cancelled) return;
      s.setPaid(access.access);
      if (access.access && access.startedAt) s.activateSprint(access.startedAt);
      if (access.access && checkoutSession) void track("checkout_completed", {
        product_id: access.productId ?? "badger-28-day",
        revenue: access.revenue ?? 49,
        currency: access.currency ?? "USD",
        transaction_id: access.transactionId ?? checkoutSession,
        purchase_model: "one_time",
        status: access.status,
      });
      if (checkoutSession) window.history.replaceState({}, "", access.access ? "/app?first_task=1" : "/start?payment=required");
      setAccessChecked(true);
      if (!access.access) router.replace("/start?payment=required");
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, sessionReady, dashboardPreview, session, s.cloudHydratedUserId, s.onboarded, checkoutSession, router]);

  if (!mounted || (!dashboardPreview && (!sessionReady || !session || s.cloudHydratedUserId !== session.user.id || !s.onboarded || !accessChecked || !s.paid))) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-peach">
        <BrandBo size={110} alt="Bo is getting your plan ready" className="anim-bounce-soft" />
      </div>
    );
  }

  const day = currentDayOf(s);
  const missed = missedInARow(s.logs, day);
  const gateActive =
    !dashboardPreview &&
    missed >= 3 &&
    !s.outcome &&
    s.gateDismissedDay !== day &&
    day !== 14 &&
    day !== 28 &&
    pathname !== "/app/outcome";

  return (
    <div className="min-h-[100svh] w-full flex justify-center bg-peach">
      <div className="relative flex min-h-[100svh] w-full max-w-[480px] flex-col overflow-x-clip pb-[calc(6rem+env(safe-area-inset-bottom))]">
        {children}
        <MomentOverlay />
        {!ugcPreview && <IdleBoPrompt />}
        <TabBar />
        {gateActive && <GateModal missed={missed} day={day} />}
      </div>
    </div>
  );
}

function GateModal({ missed, day }: { missed: number; day: number }) {
  const router = useRouter();
  const { dismissGate, profile } = useBygga();
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(26,26,26,0.6)" }}>
      <div className="w-full max-w-[480px] bg-cream rounded-t-[22px] px-4 pt-6 pb-8 anim-rise min-[360px]:px-6">
        <div className="flex justify-between items-start mb-3.5">
          <div className="relative grid h-[150px] w-[150px] place-items-center overflow-hidden rounded-[30px] bg-cobalt-grad shadow-glass">
            <span className="absolute inset-4 rounded-full border border-white/20" aria-hidden="true" />
            <BrandBo pose="recover" size={142} alt="Bo ready to help you continue" className="relative z-10 translate-y-3" />
          </div>
          <span className="text-[10px] font-bold tracking-[1.5px] text-bred px-2 py-1 rounded" style={{ background: "rgba(239,68,68,0.1)" }}>
            MANDATORY CHECKPOINT
          </span>
        </div>
        <h2 className="m-0 font-serif text-[28px] font-semibold tracking-[-0.6px]">
          Ship day or kill day, {profile?.name}.
        </h2>
        <p className="mt-2.5 text-[14px] text-ink-60 leading-[1.45]">
          You&apos;ve been quiet for {missed} days, so it&apos;s time to choose. Both doors are good
          doors. Only &quot;someday&quot; is a bad one.
        </p>
        <div className="mt-5 flex flex-col gap-2.5">
          <button
            type="button"
            onClick={() => dismissGate(day)}
            className="w-full px-5 py-[18px] rounded-[14px] border-none bg-yellow text-ink text-[16px] font-bold cursor-pointer shadow-btn-yellow text-left"
          >
            ↻ Commit to shipping
            <div className="text-[12px] font-medium opacity-70 mt-0.5">
              Fresh start. Today&apos;s task is waiting. Do 10 minutes, log it, streak restarts.
            </div>
          </button>
          <button
            type="button"
            onClick={() => router.push("/app/outcome?mode=kill")}
            className="w-full px-5 py-[18px] rounded-[14px] border-none text-white text-[16px] font-bold cursor-pointer text-left"
            style={{ background: "#991B1B" }}
          >
            ☠ Log Kill Day
            <div className="text-[12px] font-medium opacity-80 mt-0.5">
              An honest ending. Stopping on purpose takes courage. We celebrate it.
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
