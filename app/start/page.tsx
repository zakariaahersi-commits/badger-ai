"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BoMascot } from "@/components/bo";
import { BoScene } from "@/components/scenes";
import { ChoiceCard, Eyebrow, H1, PhoneFrame, PrimaryButton, TopBar } from "@/components/ui";
import { VoiceTextArea } from "@/components/voice";
import { buildFounderDiagnostic } from "@/lib/founder-diagnostic";
import { buildFallbackPlan } from "@/lib/planEngine";
import { authJsonHeaders, cloudEnabled, supabase } from "@/lib/cloud";
import { startCheckout } from "@/lib/payments";
import { markLocalChange, useSession } from "@/lib/sync";
import { useBygga } from "@/lib/store";
import { track, type ProductEvent } from "@/lib/telemetry";
import { clearLayersAuthIntent, markLayersAuthIntent } from "@/lib/layers-analytics";
import { CURRENT_ONBOARDING_FLOW_VERSION } from "@/lib/onboarding-version";
import { matchOpportunities, type Opportunity } from "@/lib/opportunity-catalog";
import type { Fear, Profile, SprintTask, Track } from "@/lib/types";

const FEARS: Fear[] = [
  "Nobody will pay for it.",
  "I'll be embarrassed when it flops.",
  "Charging feels gross.",
  "I don't know who to ask.",
  "I'll do it later. (You won't.)",
];

const SAVE_KEY = "badger-onboarding-v4";
const PREVIOUS_SAVE_KEYS = ["badger-onboarding-v3", "badger-onboarding-v2", "byqqa-onboarding-v1"];
const ONBOARDING_FLOW_VERSION = CURRENT_ONBOARDING_FLOW_VERSION;

interface Answers {
  name: string;
  track: Track | "";
  idea: string;
  whoFor: string;
  industry: string;
  stage: string;
  monthsCarried: string;
  builtWhat: string;
  triedSelling: string;
  skills: string;
  interests: string;
  problemsNoticed: string;
  audience: string;
  experience: string;
  blocker: string;
  confidence: string;
  fear: Fear | "";
  days: number[];
  sessionMinutes: number;
  thinkingTime: string;
  goal: string;
  consequence: string;
  commitment: string;
}

type PlanSource = "ai" | "fallback";
type SavedDraft = { a?: Partial<Answers>; step?: number; planTasks?: SprintTask[]; planSource?: PlanSource };

const EMPTY: Answers = {
  name: "",
  track: "",
  idea: "",
  whoFor: "",
  industry: "",
  stage: "",
  monthsCarried: "",
  builtWhat: "",
  triedSelling: "",
  skills: "",
  interests: "",
  problemsNoticed: "",
  audience: "",
  experience: "",
  blocker: "",
  confidence: "5",
  fear: "",
  days: [1, 3, 5],
  sessionMinutes: 25,
  thinkingTime: "",
  goal: "",
  consequence: "",
  commitment: "",
};

function shortIdea(idea: string): string {
  const clean = idea.trim().replace(/\s+/g, " ");
  if (!clean) return "your idea";
  if (clean.length <= 52) return clean;
  const cut = clean.slice(0, 52);
  return cut.slice(0, cut.lastIndexOf(" ") > 24 ? cut.lastIndexOf(" ") : 52).replace(/[,.;:]+$/, "");
}

function answerLengthBucket(value: string): string {
  const n = value.trim().length;
  if (n < 40) return "under_40";
  if (n < 160) return "40_159";
  if (n < 500) return "160_499";
  return "500_plus";
}

function reminderTime(when: "later_today" | "tomorrow" | "weekend"): Date {
  const now = new Date();
  if (when === "later_today") return new Date(now.getTime() + 4 * 60 * 60 * 1000);
  if (when === "tomorrow") {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    return tomorrow;
  }
  const weekend = new Date(now);
  const daysUntilSaturday = (6 - weekend.getDay() + 7) % 7 || 7;
  weekend.setDate(weekend.getDate() + daysUntilSaturday);
  weekend.setHours(10, 0, 0, 0);
  return weekend;
}

function reminderLabel(when: "later_today" | "tomorrow" | "weekend"): string {
  if (when === "later_today") return "later today";
  if (when === "tomorrow") return "tomorrow morning";
  return "this weekend";
}

function stagePromise(track: Track | ""): { title: string; body: string } {
  if (track === "A") return {
    title: "You do not need an idea before you start.",
    body: "Bo will help you notice one real problem, choose it and test whether anyone cares.",
  };
  if (track === "C") return {
    title: "You probably do not need to rebuild it.",
    body: "Bo will focus the next move on conversations, offers and the reason people are not paying yet.",
  };
  return {
    title: "You do not need a perfect business plan.",
    body: "Bo will turn the rough idea into one small test with a real person.",
  };
}

type Ctx = {
  a: Answers;
  set: <K extends keyof Answers>(key: K, value: Answers[K]) => void;
  pick: <K extends keyof Answers>(screen: string, key: K, value: Answers[K]) => void;
  next: () => void;
  firstName: string;
};

type RenderArgs = {
  ctx: Ctx;
  checkoutError: string;
  accountError: string;
  accountBusy: boolean;
  captureBusy: boolean;
  captureMessage: string;
  authenticated: boolean;
  accountEmail: string;
  startGoogleAccount: () => void;
  startEmailAccount: () => void;
  captureAndContinue: () => void;
  updateCaptureTrack: (track: Track) => void;
  scheduleResume: (when: "later_today" | "tomorrow" | "weekend") => void;
  continueOnDevice: () => void;
  allowLocalAuthBypass: boolean;
  ideaMatches: Opportunity[] | null;
  saveJourney: () => void;
  startCheckout: () => void;
  optOutOfRecovery: () => void;
  emailMessage: string;
  canManageEmail: boolean;
  onPlan: (tasks: SprintTask[] | null, source?: PlanSource) => void;
  buildProfile: () => Profile;
  finish: () => void;
  planTasks: SprintTask[] | null;
};

type Screen = {
  key: string;
  phase: string;
  dark?: boolean;
  bar?: boolean;
  render: (args: RenderArgs) => React.ReactNode;
};

export default function StartPage() {
  const router = useRouter();
  const { completeOnboarding } = useBygga();
  const { session: authSession, ready: authReady } = useSession();
  const [a, setA] = useState<Answers>(EMPTY);
  const [step, setStep] = useState(0);
  const [planTasks, setPlanTasks] = useState<SprintTask[] | null>(null);
  const [planSource, setPlanSource] = useState<PlanSource>("fallback");
  const [draftReady, setDraftReady] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [accountError, setAccountError] = useState("");
  const [accountBusy, setAccountBusy] = useState(false);
  const [captureBusy, setCaptureBusy] = useState(false);
  const [captureMessage, setCaptureMessage] = useState("");
  const [allowLocalAuthBypass, setAllowLocalAuthBypass] = useState(false);
  const [ideaMatches, setIdeaMatches] = useState<Opportunity[] | null>(null);
  const [emailMessage, setEmailMessage] = useState("");
  const [hasStarted, setHasStarted] = useState(false);
  const [backCount, setBackCount] = useState(0);
  const [stepEnteredAt, setStepEnteredAt] = useState<number | null>(null);
  const trackedStep = useRef("");
  const trackedLanding = useRef(false);
  const requestedPlan = useRef("");
  const requestedIdeaMatch = useRef("");

  const markStarted = () => {
    const marker = `badger-onboarding-started-${ONBOARDING_FLOW_VERSION}`;
    if (hasStarted || sessionStorage.getItem(marker) === "1") return;
    sessionStorage.setItem(marker, "1");
    setHasStarted(true);
    void track("onboarding_started", { trigger: "first_answer", flow_version: ONBOARDING_FLOW_VERSION });
  };

  const set = <K extends keyof Answers>(key: K, value: Answers[K]) => {
    markStarted();
    setA((previous) => ({ ...previous, [key]: value }));
  };

  const pick = <K extends keyof Answers>(screen: string, key: K, value: Answers[K]) => {
    set(key, value);
    void track("onboarding_answered", {
      screen,
      flow_version: ONBOARDING_FLOW_VERSION,
      answer: typeof value === "string" ? value.slice(0, 80) : Array.isArray(value) ? value.length : String(value),
    });
  };

  const accountName = String(authSession?.user.user_metadata?.full_name || authSession?.user.user_metadata?.name || "").trim();
  const firstName = (a.name.trim() || accountName).split(" ")[0] || "founder";
  const screens = useMemo(() => buildScreens(a), [a]);
  const total = screens.length;
  const activeIndex = Math.min(step, total - 1);
  const screen = screens[activeIndex];

  const next = () => {
    const elapsedMs = stepEnteredAt === null ? undefined : Math.max(0, new Date().getTime() - stepEnteredAt);
    void track("onboarding_step_completed", {
      step: activeIndex + 1,
      screen: screen.key,
      phase: screen.phase,
      flow_version: ONBOARDING_FLOW_VERSION,
      track: a.track || "unselected",
      back_count: backCount,
      elapsed_ms: elapsedMs,
    });
    setBackCount(0);
    // Selecting the founder stage grows the screen list from one item to the
    // full journey. Do not clamp against the pre-selection total here.
    setStep((value) => value + 1);
  };

  const back = () => {
    setBackCount((value) => value + 1);
    setStep((value) => Math.max(value - 1, 0));
  };

  useEffect(() => {
    if (trackedLanding.current) return;
    trackedLanding.current = true;
    void track("onboarding_landed", { flow_version: ONBOARDING_FLOW_VERSION });
  }, []);

  useEffect(() => {
    const localHost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    const timer = window.setTimeout(() => {
      setAllowLocalAuthBypass(localHost && sessionStorage.getItem("badger-e2e-auth-bypass") === "1");
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    let saved: SavedDraft | null = null;
    let legacy = false;
    let demoIdea = "";
    try {
      const current = localStorage.getItem(SAVE_KEY);
      const previous = !current
        ? PREVIOUS_SAVE_KEYS.map((key) => localStorage.getItem(key)).find(Boolean) || null
        : null;
      saved = JSON.parse(current || previous || "null") as SavedDraft | null;
      legacy = Boolean(previous);
      if (!saved) demoIdea = sessionStorage.getItem("badger-demo-seed-v1")?.trim() || "";
    } catch {
      saved = null;
    }
    const timer = window.setTimeout(() => {
      if (saved?.a) setA({ ...EMPTY, ...saved.a });
      if (saved && !legacy && typeof saved.step === "number") setStep(saved.step);
      if (Array.isArray(saved?.planTasks) && saved.planTasks.length) setPlanTasks(saved.planTasks.slice(0, 28));
      if (saved?.planSource === "ai") setPlanSource("ai");
      if (!saved && demoIdea) {
        setA({ ...EMPTY, track: "B", idea: demoIdea.slice(0, 1500) });
        sessionStorage.removeItem("badger-demo-seed-v1");
      }
      setDraftReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!draftReady) return;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify({ a, step, planTasks, planSource })); } catch { /* optional */ }
  }, [a, draftReady, planSource, planTasks, step]);

  useEffect(() => {
    const key = `${step}:${screen.key}`;
    if (trackedStep.current === key) return;
    trackedStep.current = key;
    setStepEnteredAt(new Date().getTime());
    void track("onboarding_step_viewed", {
      step: step + 1,
      screen: screen.key,
      phase: screen.phase,
      flow_version: ONBOARDING_FLOW_VERSION,
      track: a.track || "unselected",
    });
  }, [a.track, screen.key, screen.phase, step]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [step]);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("email") !== "unsubscribed") return;
    const timer = window.setTimeout(() => setEmailMessage("Journey reminder emails are now off."), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const toProfile = (): Profile => ({
    name: a.name.trim() || accountName || "Founder",
    idea: a.idea.trim() || a.builtWhat.trim() || (a.track === "A" ? "(finding my idea)" : "my idea"),
    ideaShort: a.track === "A" && !a.idea.trim() ? "the problem you pick" : shortIdea(a.idea || a.builtWhat),
    industry: a.industry || "Other",
    track: (a.track || "B") as Track,
    monthsCarried: a.monthsCarried || "a while",
    fear: (a.fear || FEARS[0]) as Fear,
    thinkingTime: a.thinkingTime || "A time that fits my week",
    days: a.days,
    sessionMinutes: a.sessionMinutes,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    consequence: a.consequence || "Push me. Hard.",
    stage: a.stage || undefined,
    audience: a.audience || undefined,
    experience: a.experience || undefined,
    whoFor: a.whoFor || a.audience || undefined,
    skills: a.skills || undefined,
    interests: a.interests || undefined,
    problemsNoticed: a.problemsNoticed || undefined,
    builtWhat: a.builtWhat || undefined,
    triedSelling: a.triedSelling || undefined,
    goal: a.goal || undefined,
    commitment: a.commitment || undefined,
    blocker: a.blocker || undefined,
    confidence: a.confidence || undefined,
  });

  const persistJourney = () => {
    const profile = toProfile();
    profile.planSource = planSource;
    completeOnboarding(profile, planTasks || buildFallbackPlan(profile), true);
    markLocalChange();
  };

  const saveCapture = async ({
    remindAt,
    completed = false,
    trackOverride,
  }: {
    remindAt?: Date;
    completed?: boolean;
    trackOverride?: Track | "undecided";
  } = {}): Promise<boolean> => {
    if (!authSession || captureBusy) return false;
    setCaptureBusy(true);
    setAccountError("");
    try {
      const response = await fetch("/api/onboarding/capture", {
        method: "POST",
        headers: await authJsonHeaders(),
        body: JSON.stringify({
          track: trackOverride || a.track || "undecided",
          remindAt: remindAt?.toISOString(),
          completed,
        }),
      });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not save your place");
      return true;
    } catch (error) {
      setAccountError(error instanceof Error ? error.message : "Could not save your place");
      return false;
    } finally {
      setCaptureBusy(false);
    }
  };

  const captureAndContinue = async () => {
    if (!(await saveCapture({ trackOverride: "undecided" }))) return;
    setCaptureMessage("");
    next();
  };

  const scheduleResume = async (when: "later_today" | "tomorrow" | "weekend") => {
    if (!(await saveCapture({ remindAt: reminderTime(when), trackOverride: a.track || "undecided" }))) return;
    setCaptureMessage(`Done. Bo will email you ${reminderLabel(when)}. Your place is saved.`);
  };

  useEffect(() => {
    if (screen.key !== "diagnosis" || planTasks) return;
    const profile = toProfile();
    const signature = JSON.stringify([profile.track, profile.idea, profile.goal, profile.blocker, profile.audience, profile.stage, profile.fear, profile.days, profile.sessionMinutes]);
    if (requestedPlan.current === signature) return;
    requestedPlan.current = signature;

    const fallback = buildFallbackPlan(profile);
    setPlanTasks(fallback);
    setPlanSource("fallback");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 6000);
    void (async () => {
      try {
        const response = await fetch("/api/plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profile, quick: true }),
          signal: controller.signal,
        });
        const data = await response.json();
        const weekOne = Array.isArray(data.plan) ? data.plan as SprintTask[] : null;
        if (weekOne?.length) {
          setPlanTasks([...weekOne, ...fallback.slice(weekOne.length)].slice(0, 28));
          setPlanSource("ai");
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          void track("onboarding_ai_timeout", { feature: "plan", budget_ms: 6000, flow_version: ONBOARDING_FLOW_VERSION });
        }
      } finally {
        window.clearTimeout(timeout);
      }
    })();
    // Keep the request alive when the founder moves straight to the plan. The
    // deterministic version is already usable and the timeout still bounds AI.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen.key]);

  useEffect(() => {
    if (screen.key !== "opportunity-finder" || !authSession) return;
    const signature = JSON.stringify([a.problemsNoticed, a.skills, a.interests, a.audience]);
    if (requestedIdeaMatch.current === signature) return;
    requestedIdeaMatch.current = signature;
    void (async () => {
      try {
        const response = await fetch("/api/opportunities", {
          method: "POST",
          headers: await authJsonHeaders(),
          body: JSON.stringify({
            context: a.problemsNoticed,
            audience: a.audience,
            workStyle: a.interests,
            edge: a.skills,
          }),
        });
        const data = await response.json().catch(() => ({})) as { opportunities?: Opportunity[]; catalogueSize?: number };
        if (!response.ok || !Array.isArray(data.opportunities) || data.opportunities.length < 3) return;
        const safe = data.opportunities.filter((item) =>
          item && typeof item.id === "string" && typeof item.label === "string" && typeof item.detail === "string"
          && (item.signal === "Paid market signal" || item.signal === "Open lane"),
        ).slice(0, 6);
        if (safe.length >= 3) {
          setIdeaMatches(safe);
          void track("idea_database_matched", { catalogue_size: data.catalogueSize || 0, results: safe.length, flow_version: ONBOARDING_FLOW_VERSION });
        }
      } catch {
        // The small bundled list remains usable if the private catalogue is unavailable.
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen.key]);

  useEffect(() => {
    if (!authSession || !draftReady || sessionStorage.getItem("badger-account-captured-v2") === "1") return;
    sessionStorage.setItem("badger-account-captured-v2", "1");
    void (async () => {
      const saved = await saveCapture({ trackOverride: a.track || "undecided" });
      if (!saved) {
        sessionStorage.removeItem("badger-account-captured-v2");
        return;
      }
      if (new URLSearchParams(window.location.search).get("account") === "ready") {
        const provider = String(authSession.user.app_metadata?.provider || "account");
        void track("account_save_completed", { provider, position: "before_onboarding", flow_version: ONBOARDING_FLOW_VERSION });
        window.history.replaceState({}, "", "/start");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authSession, draftReady]);

  const saveJourney = () => {
    persistJourney();
    void saveCapture({ completed: true });
    if (sessionStorage.getItem("badger-account-save-tracked") !== "1") {
      sessionStorage.setItem("badger-account-save-tracked", "1");
      void track("account_save_completed", {
        provider: String(authSession?.user.app_metadata?.provider || "existing"),
        flow_version: ONBOARDING_FLOW_VERSION,
      });
    }
    next();
  };

  const startGoogleAccount = async () => {
    const sb = supabase();
    if (!sb || accountBusy) return;
    setAccountBusy(true);
    setAccountError("");
    markStarted();
    void track("account_save_started", { provider: "google", flow_version: ONBOARDING_FLOW_VERSION });
    markLayersAuthIntent("sign_up");
    const { error } = await sb.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/start?account=ready` },
    });
    if (error) {
      clearLayersAuthIntent();
      setAccountError(error.message);
      setAccountBusy(false);
    } else {
      void track("account_oauth_started", { provider: "google", source: "journey_save", flow_version: ONBOARDING_FLOW_VERSION });
    }
  };

  const startEmailAccount = () => {
    markStarted();
    void track("account_save_started", { provider: "email", flow_version: ONBOARDING_FLOW_VERSION });
    router.push("/auth?next=/start?account=ready");
  };

  const finish = () => {
    persistJourney();
    try {
      localStorage.removeItem(SAVE_KEY);
      PREVIOUS_SAVE_KEYS.forEach((key) => localStorage.removeItem(key));
    } catch { /* optional */ }
    router.push(cloudEnabled && !authSession ? "/auth?next=/app" : "/app");
  };

  const ctx: Ctx = { a, set, pick, next, firstName };

  return (
    <PhoneFrame>
      <Frame
        dark={screen.dark}
        showBar={screen.bar !== false}
        step={step}
        total={total}
        phase={screen.phase}
        onBack={step > 0 ? back : undefined}
      >
        {emailMessage && screen.key !== "paywall" && (
          <div role="status" aria-live="polite" className="mt-2 rounded-[16px] border border-teal/25 bg-teal/10 px-4 py-3 text-ink shadow-sm">
            <div className="text-[12px] font-extrabold">Journey emails stopped</div>
            <div className="mt-0.5 text-[11.5px] leading-[1.4] text-ink-60">{emailMessage} You can change this later from Profile.</div>
          </div>
        )}
        {screen.render({
          ctx,
          checkoutError,
          accountError,
          accountBusy,
          captureBusy,
          captureMessage,
          authenticated: Boolean(authSession),
          accountEmail: authSession?.user.email || "",
          startGoogleAccount: () => void startGoogleAccount(),
          startEmailAccount,
          captureAndContinue: () => void captureAndContinue(),
          updateCaptureTrack: (trackValue) => void saveCapture({ trackOverride: trackValue }),
          scheduleResume: (when) => void scheduleResume(when),
          continueOnDevice: () => {
            void track("onboarding_answered", { screen: "capture", answer: "local_test_bypass", flow_version: ONBOARDING_FLOW_VERSION });
            next();
          },
          allowLocalAuthBypass,
          ideaMatches,
          saveJourney,
          startCheckout: () => {
            persistJourney();
            void track("onboarding_completed", { track: toProfile().track, flow_version: ONBOARDING_FLOW_VERSION });
            void track("paywall_cta_clicked", { product_id: "badger-28-day", price: 49, currency: "USD", flow_version: ONBOARDING_FLOW_VERSION });
            setCheckoutError("");
            if (!authReady) return;
            if (!authSession) {
              setCheckoutError("Save your journey first, then return here to review the one-time payment.");
              return;
            }
            void track("checkout_started", { product_id: "badger-28-day", revenue: 49, currency: "USD", flow_version: ONBOARDING_FLOW_VERSION });
            void startCheckout({
              cancelPath: "/start?payment=cancelled",
              onUnavailable: () => {
                void track("checkout_failed", { reason: "unavailable" });
                setCheckoutError("Payment is not available right now. Your journey is saved. Please try again shortly.");
              },
            });
          },
          optOutOfRecovery: async () => {
            if (!authSession) return;
            const response = await fetch("/api/email/preferences", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${authSession.access_token}` },
              body: JSON.stringify({ journeyNudgesEnabled: false }),
            });
            setEmailMessage(response.ok ? "Journey reminder emails are now off." : "Could not change reminders. Try again shortly.");
          },
          emailMessage,
          canManageEmail: Boolean(authSession),
          onPlan: (tasks, source = "fallback") => {
            setPlanTasks(tasks);
            setPlanSource(source);
          },
          buildProfile: toProfile,
          finish,
          planTasks,
        })}
      </Frame>
    </PhoneFrame>
  );
}

function Frame({
  children,
  dark,
  showBar,
  step,
  total,
  phase,
  onBack,
}: {
  children: React.ReactNode;
  dark?: boolean;
  showBar?: boolean;
  step: number;
  total: number;
  phase: string;
  onBack?: () => void;
}) {
  return (
    <div
      className={`onboarding-frame flex min-h-dvh flex-1 flex-col px-4 pt-4 min-[360px]:px-6 ${dark ? "is-dark" : ""}`}
      style={{
        background: dark ? "var(--bygga-ink)" : undefined,
        color: dark ? "var(--bygga-bg)" : "var(--bygga-ink)",
        paddingBottom: "max(32px, env(safe-area-inset-bottom))",
      }}
    >
      {showBar && <TopBar progress={step + 1} total={total} onBack={onBack} dark={dark} label={phase} />}
      {children}
    </div>
  );
}

function QHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="mt-4 flex flex-col gap-2 anim-rise">
      <Eyebrow className="!text-indigo">{eyebrow}</Eyebrow>
      <H1 style={{ fontSize: 30, lineHeight: 1.08 }}>{title}</H1>
    </div>
  );
}

function ChoiceList({
  options,
  value,
  onPick,
}: {
  options: { v: string; label: string; sub?: string }[];
  value: string;
  onPick: (value: string) => void;
}) {
  return (
    <div className="mt-5 flex flex-col gap-2.5">
      {options.map((option) => (
        <ChoiceCard key={option.v} selected={value === option.v} onClick={() => onPick(option.v)}>
          <span className="flex items-center gap-3">
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="font-bold">{option.label}</span>
              {option.sub && <span className="text-[12.5px] leading-[1.35] opacity-65">{option.sub}</span>}
            </span>
            <span className={`choice-check ${value === option.v ? "is-selected" : ""}`}>{value === option.v ? "✓" : ""}</span>
          </span>
        </ChoiceCard>
      ))}
    </div>
  );
}

function TrackMoment({ event, id, properties = {} }: { event: ProductEvent; id: string; properties?: Record<string, unknown> }) {
  const sent = useRef("");
  useEffect(() => {
    if (sent.current === id) return;
    sent.current = id;
    void track(event, properties);
  }, [event, id, properties]);
  return null;
}

function reflectionFor(a: Answers): { title: string; body: string } {
  if (a.blocker === "choosing") {
    return {
      title: "You are not short of potential.",
      body: "You are avoiding one choice because choosing makes it real. Bo will help you pick using evidence, not confidence.",
    };
  }
  if (a.blocker === "customers") {
    return {
      title: "The next move is not more building.",
      body: "You need a small number of honest conversations. Your journey will turn those conversations into a clear offer.",
    };
  }
  if (a.blocker === "confidence") {
    return {
      title: "Confidence comes after evidence.",
      body: "You do not need to feel ready first. Bo will make the next move small enough to do and concrete enough to learn from.",
    };
  }
  if (a.blocker === "time") {
    return {
      title: "Your plan has to survive a real week.",
      body: "Bo will strip the work down to the smallest useful move and hold the rest back until it matters.",
    };
  }
  return {
    title: a.track === "C" ? "You have already proved you can build." : "You do not need another framework.",
    body: a.track === "C" ? "The next 28 days should turn what exists into conversations, offers and evidence." : "The next 28 days should turn thinking into one visible move at a time.",
  };
}

function PlanReveal({ ctx, tasks, onContinue }: { ctx: Ctx; tasks: SprintTask[]; onContinue: () => void }) {
  const weekLabels: Record<Track, string[]> = {
    A: ["Notice real problems", "Choose one", "Test it with people", "Launch or let it go"],
    B: ["Validate the problem", "Shape the offer", "Ask for money", "Launch and decide"],
    C: ["Find the sales gap", "Talk to buyers", "Make direct offers", "Close or reposition"],
  };
  const labels = weekLabels[(ctx.a.track || "B") as Track];
  const day1 = tasks[0];
  return (
    <>
      <TrackMoment event="plan_reveal_viewed" id="plan-reveal" properties={{ track: ctx.a.track || "B", has_day1: Boolean(day1?.title), flow_version: ONBOARDING_FLOW_VERSION }} />
      <TrackMoment event="journey_save_viewed" id="journey-ready" properties={{ track: ctx.a.track || "B", flow_version: ONBOARDING_FLOW_VERSION }} />
      <QHeader eyebrow={`Built for ${ctx.firstName}`} title="Your 28-day launch path" />
      <p className="mt-2 text-[14px] leading-[1.45] text-ink-60">Each week earns the next. Bo adjusts the details as real customer evidence comes in.</p>
      <div className="mt-4 grid grid-cols-2 gap-2.5">
        {labels.map((label, index) => (
          <div key={label} className="rounded-[18px] border border-white/80 bg-paper/95 p-3.5 shadow-card">
            <div className="text-[10px] font-bold tracking-[1.1px] text-indigo">WEEK {index + 1}</div>
            <div className="mt-1.5 text-[13px] font-bold leading-[1.3]">{label}</div>
            <div className="mt-2 text-[11px] leading-[1.35] text-ink-40">{tasks[index * 7]?.title || "Bo adapts this from your evidence."}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-[20px] bg-ink p-4 text-cream shadow-card">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-yellow text-[12px] font-extrabold text-ink">DAY 1</div>
          <div>
            <div className="text-[10px] font-bold tracking-[1px] text-yellow">YOUR FIRST MOVE</div>
            <div className="mt-1 text-[14px] font-bold leading-[1.35]">{day1?.title}</div>
          </div>
        </div>
        <div className="mt-3 border-t border-white/10 pt-3 text-[12px] leading-[1.45] text-white/65">About {day1?.minutes || ctx.a.sessionMinutes} minutes. Bo shows you how and asks for proof when it is done.</div>
      </div>
      <div className="flex-1 min-h-4" />
      <PrimaryButton onClick={() => {
        void track("plan_reveal_cta_clicked", {
          cta: "save_this_journey",
          track: ctx.a.track || "B",
          has_day1: Boolean(day1?.title),
          flow_version: ONBOARDING_FLOW_VERSION,
        });
        onContinue();
      }}>Review one-time access</PrimaryButton>
    </>
  );
}

function buildScreens(a: Answers): Screen[] {
  const list: Screen[] = [];

  list.push({
    key: "capture",
    phase: "Save your journey",
    bar: false,
    render: ({ ctx, authenticated, accountEmail, accountBusy, captureBusy, captureMessage, accountError, startGoogleAccount, startEmailAccount, captureAndContinue, scheduleResume, continueOnDevice, allowLocalAuthBypass }) => (
      <>
        <TrackMoment event="onboarding_capture_viewed" id="account-first-capture" properties={{ track: ctx.a.track || "undecided", authenticated, flow_version: ONBOARDING_FLOW_VERSION }} />
        <div className="mt-2 flex items-center justify-between">
          <div className="onboarding-brand-pill"><span className="onboarding-brand-mark">B</span> BADGER AI</div>
          <BoMascot state="thinking" size={70} />
        </div>
        <div className="mt-5 text-center">
          <Eyebrow className="!text-center !text-indigo">YOUR PLACE WITH BO</Eyebrow>
          <H1 serif className="mt-3 text-center" style={{ fontSize: 31 }}>{authenticated ? "You’re in. Start now or come back later." : "Save your place before we begin."}</H1>
          <p className="mx-auto mt-3 max-w-[330px] text-[14px] leading-[1.5] text-ink-60">
            {authenticated
              ? `Signed in${accountEmail ? ` as ${accountEmail}` : ""}. The diagnostic takes about three focused minutes. Continue now or ask Bo to remind you.`
              : "Create a free account first. Then Bo can save every answer and bring you back if this is not the right moment to think it through."}
          </p>
        </div>
        <div className="mt-5 rounded-[18px] border border-indigo/15 bg-indigo/5 p-4">
          <div className="text-[10px] font-bold tracking-[1px] text-indigo">WHAT HAPPENS NEXT</div>
          <div className="mt-2 flex flex-col gap-1.5 text-[12.5px] font-semibold"><span>1. Tell Bo where you are starting</span><span>2. Get a founder diagnosis, 28-day plan and Day 1</span><span>3. Pay $49 once only if you want Bo to start coaching</span></div>
        </div>
        {accountError && <div className="mt-3 rounded-xl bg-red-50 px-3 py-2.5 text-[12px] font-semibold text-bred">{accountError}</div>}
        {captureMessage && <div role="status" className="mt-3 rounded-xl border border-teal/20 bg-teal/10 px-3 py-3 text-[12.5px] font-semibold leading-[1.4] text-teal-deep">{captureMessage}</div>}
        <div className="flex-1 min-h-4" />
        {authenticated ? (
          <div className="flex flex-col gap-2">
            <PrimaryButton onClick={captureAndContinue} disabled={captureBusy}>{captureBusy ? "Saving…" : "Start with Bo"}</PrimaryButton>
            <div className="grid grid-cols-3 gap-1.5">
              <button type="button" disabled={captureBusy} onClick={() => scheduleResume("later_today")} className="rounded-[12px] border border-ink-10 bg-paper px-2 py-2.5 text-[11px] font-semibold">Later today</button>
              <button type="button" disabled={captureBusy} onClick={() => scheduleResume("tomorrow")} className="rounded-[12px] border border-ink-10 bg-paper px-2 py-2.5 text-[11px] font-semibold">Tomorrow</button>
              <button type="button" disabled={captureBusy} onClick={() => scheduleResume("weekend")} className="rounded-[12px] border border-ink-10 bg-paper px-2 py-2.5 text-[11px] font-semibold">Weekend</button>
            </div>
            <p className="text-center text-[10.5px] leading-[1.35] text-ink-40">Choose a time only if you want one email reminder. Otherwise, Bo will not email you.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <PrimaryButton onClick={startGoogleAccount} disabled={accountBusy}>{accountBusy ? "Opening Google…" : "Continue with Google"}</PrimaryButton>
            <button type="button" onClick={startEmailAccount} className="w-full rounded-[14px] border border-ink-20 bg-paper px-4 py-3.5 text-[14px] font-semibold text-ink">Continue with email</button>
            {allowLocalAuthBypass && <button type="button" onClick={continueOnDevice} className="w-full border-0 bg-transparent px-4 py-2 text-[12px] font-semibold text-ink-40 underline underline-offset-2">Continue in local test</button>}
            <p className="text-center text-[10.5px] leading-[1.35] text-ink-40">Free to create. Your plan and Day 1 appear before the one-time payment. Creating an account does not opt you into reminder emails.</p>
          </div>
        )}
      </>
    ),
  });

  list.push({
    key: "stage",
    phase: "Your starting point",
    bar: false,
    render: ({ ctx, onPlan, updateCaptureTrack }) => (
      <>
        <div className="mt-2 flex items-center justify-between">
          <div className="onboarding-brand-pill"><span className="onboarding-brand-mark">B</span> BADGER AI</div>
          <BoMascot state="fired-up" size={70} />
        </div>
        <QHeader eyebrow="28 days · one clear move at a time" title="Where are you right now?" />
        <p className="mt-2 text-[14px] leading-[1.45] text-ink-60">Bo will build the journey around your actual starting point.</p>
        <p className="mt-2 text-[12px] font-semibold leading-[1.4] text-ink-40">Tap the closest answer. You can change it later.</p>
        <ChoiceList
          value={ctx.a.track}
          onPick={(value) => {
            const track = value as Track;
            ctx.pick("stage", "track", track);
            updateCaptureTrack(track);
            onPlan(null);
            window.setTimeout(ctx.next, 180);
          }}
          options={[
            { v: "A", label: "I want more freedom or income, but have no idea", sub: "Start from your constraints—not a fake passion." },
            { v: "B", label: "I have an idea—or too many—and feel stuck", sub: "Get out of your head and in front of real people." },
            { v: "C", label: "I built something, but nobody is paying", sub: "Stop polishing and find the sales truth." },
          ]}
        />
        <div className="mt-4 rounded-[14px] border border-ink-10 bg-paper/80 px-3.5 py-3 text-center text-[11.5px] leading-[1.4] text-ink-60">
          Your place is saved · finish now or later · see your plan and Day 1 before paying
        </div>
        <div className="flex-1 min-h-4" />
      </>
    ),
  });

  if (!a.track) return list;

  list.push({
    key: "outcome",
    phase: "What matters",
    render: ({ ctx }) => {
      const promise = stagePromise(ctx.a.track);
      const outcomes = ctx.a.track === "A"
        ? [
            { v: "side-income", label: "Build income beside my current work" },
            { v: "replace-job", label: "Eventually replace my salary" },
            { v: "independence", label: "Control where and how I work" },
            { v: "company", label: "Build a company I can grow" },
          ]
        : [
            { v: "first-customer", label: "Get my first paying customer" },
            { v: "prove-demand", label: "Know whether people truly want this" },
            { v: "launch", label: "Launch something real, not perfect" },
            { v: "momentum", label: "Prove I can finish what I start" },
          ];
      return (
      <>
        <div className="mt-2 rounded-[18px] border border-indigo/15 bg-indigo/5 p-4">
          <div className="flex items-start gap-3">
            <BoMascot state="thinking" size={42} />
            <div>
              <div className="text-[10px] font-bold tracking-[1px] text-indigo">BO’S FIRST READ</div>
              <div className="mt-1 text-[14px] font-bold leading-[1.35]">{promise.title}</div>
              <div className="mt-1 text-[12.5px] leading-[1.45] text-ink-60">{promise.body}</div>
            </div>
          </div>
        </div>
        <QHeader eyebrow="Your finish line" title="What should Bo help you do first?" />
        <ChoiceList
          value={ctx.a.goal}
          onPick={(value) => { ctx.pick("outcome", "goal", value); window.setTimeout(ctx.next, 180); }}
          options={outcomes}
        />
        <div className="flex-1 min-h-4" />
      </>
      );
    },
  });

  list.push({
    key: "blocker",
    phase: "What matters",
    render: ({ ctx }) => (
      <>
        <QHeader eyebrow="No judgement" title="What keeps getting in the way?" />
        <ChoiceList
          value={ctx.a.blocker}
          onPick={(value) => { ctx.pick("blocker", "blocker", value); window.setTimeout(ctx.next, 180); }}
          options={[
            { v: "choosing", label: "I keep changing direction" },
            { v: "confidence", label: "I overthink and lose confidence" },
            { v: "customers", label: "I do not know how to reach customers" },
            { v: "time", label: "I never seem to have enough time" },
            { v: "execution", label: "I know the next step, but avoid it" },
          ]}
        />
        <div className="flex-1 min-h-4" />
      </>
    ),
  });

  if (a.track === "A") {
    list.push({
      key: "work-style",
      phase: "Your constraints",
      render: ({ ctx }) => (
        <>
          <QHeader eyebrow="No passion required" title="Which way of earning feels least wrong?" />
          <p className="mt-2 text-[13.5px] leading-[1.45] text-ink-60">You are not choosing your life’s work. This only helps Bo avoid suggesting a business you would hate running.</p>
          <ChoiceList
            value={ctx.a.interests}
            onPick={(value) => { ctx.pick("work-style", "interests", value); window.setTimeout(ctx.next, 180); }}
            options={[
              { v: "Sell a useful service to businesses or people", label: "Sell a useful service", sub: "Fastest route to learning and possible income." },
              { v: "Build a small software or digital tool", label: "Build a small digital product" },
              { v: "Create useful content and grow an audience", label: "Build an audience first" },
              { v: "Run something local, practical or physical", label: "Run something local or practical" },
              { v: "I do not know which business model fits me", label: "I genuinely have no clue", sub: "Bo will keep the options deliberately mixed." },
            ]}
          />
          <div className="flex-1 min-h-4" />
        </>
      ),
    });

    list.push({
      key: "starting-edge",
      phase: "Your constraints",
      render: ({ ctx }) => (
        <>
          <QHeader eyebrow="Start with what is available" title="What could give you a small head start?" />
          <ChoiceList
            value={ctx.a.skills}
            onPick={(value) => { ctx.pick("starting-edge", "skills", value); window.setTimeout(ctx.next, 180); }}
            options={[
              { v: "Skills or knowledge from my work, studies or past projects", label: "Skills from work or study" },
              { v: "A group of people or community I understand", label: "People I understand" },
              { v: "Access to an industry, customer type or local network", label: "Access to possible customers" },
              { v: "Time and willingness to learn and sell, but no specialist edge", label: "Time and willingness to learn" },
              { v: "I cannot see any useful advantage yet", label: "Nothing obvious yet", sub: "That is an honest starting point—not a rejection." },
            ]}
          />
          <div className="flex-1 min-h-4" />
        </>
      ),
    });
  }

  list.push({
    key: "idea",
    phase: "Your reality",
    render: ({ ctx }) => {
      const noIdea = ctx.a.track === "A";
      const built = ctx.a.track === "C";
      const value = noIdea ? ctx.a.problemsNoticed : built ? ctx.a.builtWhat : ctx.a.idea;
      const reflection = reflectionFor(ctx.a);
      const noIdeaStarters = [
        { label: "My work or industry", value: "I understand problems from my work or industry, but I have not chosen one yet." },
        { label: "A community I know", value: "I understand a community well and want Bo to help me notice a problem worth solving there." },
        { label: "A problem I live with", value: "I want to start from a frustrating problem I experience personally." },
        { label: "I genuinely do not know", value: "I do not know yet. Help me notice and choose one real problem from my experience." },
      ];
      return (
        <>
          <TrackMoment event="bo_reflection_shown" id="inline-first-read" properties={{ source: "deterministic", position: "before_idea", flow_version: ONBOARDING_FLOW_VERSION }} />
          <QHeader
            eyebrow={noIdea ? "No idea required" : "The rough version is enough"}
            title={noIdea ? "Give Bo one clue. Anything counts." : built ? "What did you build, and who is it for?" : "Tell Bo the idea in one rough sentence."}
          />
          <p className="mt-2 text-[14px] leading-[1.45] text-ink-60">
            {noIdea ? "A job, hobby, group of people or daily frustration is useful. If nothing comes to mind, say that—Bo will use your other answers instead." : "Try: It helps [someone] do [something]. You can give Bo the missing details later."}
          </p>
          <div className="mt-4 flex items-start gap-3 rounded-[16px] border border-indigo/15 bg-indigo/5 p-3.5">
            <BoMascot state="thinking" size={38} />
            <div><div className="text-[9px] font-bold tracking-[1px] text-indigo">BO’S READ</div><div className="mt-1 text-[12.5px] font-semibold leading-[1.4]">{reflection.title} <span className="font-normal text-ink-60">{reflection.body}</span></div></div>
          </div>
          {noIdea && (
            <div className="mt-4 grid grid-cols-2 gap-2">
              {noIdeaStarters.map((starter) => (
                <button
                  key={starter.label}
                  type="button"
                  onClick={() => ctx.set("problemsNoticed", starter.value)}
                  className={`rounded-[14px] border px-3 py-3 text-left text-[12px] font-bold leading-[1.3] ${value === starter.value ? "border-indigo bg-indigo text-white" : "border-ink-10 bg-paper text-ink"}`}
                >{starter.label}</button>
              ))}
            </div>
          )}
          <div className="mt-5">
            <VoiceTextArea
              autoFocus
              value={value}
              onChange={(text) => ctx.set(noIdea ? "problemsNoticed" : built ? "builtWhat" : "idea", text)}
              placeholder={noIdea ? "Or tell Bo: I know a lot about… I keep noticing…" : "It helps [who] to [do what]…"}
              maxLength={1500}
              showCount
            />
          </div>
          <div className="mt-2 text-[12px] text-ink-40">One honest answer is more useful than perfect startup language.</div>
          <div className="flex-1 min-h-4" />
          <PrimaryButton
            disabled={value.trim().length < 4}
            onClick={() => {
              if (built) ctx.set("idea", value);
              void track("onboarding_answered", { screen: "idea", answer_length: answerLengthBucket(value), flow_version: ONBOARDING_FLOW_VERSION });
              ctx.next();
            }}
          >{noIdea ? "Show me directions I could take" : "Use this as my starting point"}</PrimaryButton>
        </>
      );
    },
  });

  list.push({
    key: "reach",
    phase: "Your reality",
    render: ({ ctx }) => (
      <>
        <QHeader eyebrow="Your first customers" title="Who can you realistically reach first?" />
        <ChoiceList
          value={ctx.a.audience}
          onPick={(value) => { ctx.pick("reach", "audience", value); window.setTimeout(ctx.next, 180); }}
          options={[
            { v: "People I already know personally", label: "People I already know" },
            { v: "An online audience or community", label: "An online community or audience" },
            { v: "Businesses or professionals I can contact", label: "Businesses or professionals" },
            { v: "Local people or organisations", label: "People or organisations near me" },
            { v: "I do not know who to reach yet", label: "I genuinely do not know yet", sub: "Bo will make finding them part of Week 1." },
          ]}
        />
        <div className="flex-1 min-h-4" />
      </>
    ),
  });

  if (a.track === "A") {
    list.push({
      key: "opportunity-finder",
      phase: "Find a starting point",
      render: ({ ctx, ideaMatches }) => {
        const opportunities = ideaMatches || matchOpportunities(`${ctx.a.problemsNoticed} ${ctx.a.skills} ${ctx.a.interests}`, ctx.a.audience);
        return (
          <>
            <TrackMoment event="idea_finder_viewed" id="idea-finder" properties={{ flow_version: ONBOARDING_FLOW_VERSION, match_count: opportunities.length }} />
            <QHeader eyebrow="Ideas picked for you" title="Here are six directions worth a look." />
            <p className="mt-2 text-[13.5px] leading-[1.45] text-ink-60">Bo used what you know, how you want to work and who you can reach. A paid market signal has a real purchase behind the problem. An open lane is a Badger idea that still needs checking.</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {opportunities.map((opportunity) => (
                <button
                  key={opportunity.id}
                  type="button"
                  onClick={() => {
                    ctx.set("idea", opportunity.label);
                    ctx.set("industry", opportunity.category);
                    void track("idea_opportunity_selected", { opportunity: opportunity.id, signal: opportunity.signal === "Paid market signal" ? "paid" : "open", flow_version: ONBOARDING_FLOW_VERSION });
                    window.setTimeout(ctx.next, 180);
                  }}
                  className="rounded-[16px] border border-ink-10 bg-paper p-3 text-left shadow-sm transition active:scale-[.98]"
                >
                  <span className={`inline-flex rounded-full px-2 py-1 text-[8px] font-extrabold tracking-[.2px] ${opportunity.signal === "Paid market signal" ? "bg-teal/15 text-teal-deep" : "bg-yellow/25 text-ink"}`}>{opportunity.signal}</span>
                  <span className="mt-2 block text-[12.5px] font-extrabold leading-[1.3]">{opportunity.label}</span>
                  <span className="mt-1.5 block text-[10.5px] leading-[1.35] text-ink-40">{opportunity.detail}</span>
                </button>
              ))}
            </div>
            <div className="mt-3 text-center text-[11px] text-ink-40">Pick one to investigate. Day 1 is still validation—not building.</div>
            <div className="flex-1 min-h-4" />
          </>
        );
      },
    });
  }

  list.push({
    key: "evidence",
    phase: "Your reality",
    render: ({ ctx }) => (
      <>
        <QHeader eyebrow="The honest baseline" title="What evidence do you have today?" />
        <ChoiceList
          value={ctx.a.stage}
          onPick={(value) => { ctx.pick("evidence", "stage", value); window.setTimeout(ctx.next, 180); }}
          options={[
            { v: "none", label: "None yet", sub: "No conversations, signups or sales." },
            { v: "conversations", label: "A few people have talked about the problem" },
            { v: "interest", label: "People have signed up or asked for it" },
            { v: "used", label: "Someone has tried what I made" },
            { v: "revenue", label: "Someone has paid, but it is not repeatable" },
          ]}
        />
        <div className="flex-1 min-h-4" />
      </>
    ),
  });

  list.push({
    key: "schedule",
    phase: "Make it fit",
    render: ({ ctx }) => {
      const days = ["M", "T", "W", "T", "F", "S", "S"];
      return (
        <>
          <QHeader eyebrow="A plan for your real life" title="When can you give this focused time?" />
          <div className="mt-6 flex justify-between gap-1.5">
            {days.map((day, index) => {
              const selected = ctx.a.days.includes(index);
              return (
                <button
                  key={`${day}-${index}`}
                  type="button"
                  aria-label={`${["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][index]}${selected ? " selected" : ""}`}
                  onClick={() => ctx.set("days", selected ? ctx.a.days.filter((item) => item !== index) : [...ctx.a.days, index].slice(-5))}
                  className="flex aspect-[0.85] flex-1 cursor-pointer items-center justify-center rounded-xl text-[17px] font-semibold"
                  style={{ background: selected ? "var(--bygga-ink)" : "var(--bygga-paper)", color: selected ? "var(--bygga-bg)" : "var(--bygga-ink)", border: `1.5px solid ${selected ? "var(--bygga-ink)" : "var(--bygga-ink20)"}` }}
                >{day}</button>
              );
            })}
          </div>
          <div className="mt-7 text-[11px] font-bold uppercase tracking-[1px] text-ink-40">Time per focused session</div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {[15, 25, 40].map((minutes) => (
              <button
                key={minutes}
                type="button"
                onClick={() => ctx.pick("schedule", "sessionMinutes", minutes)}
                className={`rounded-[14px] border px-2 py-3 text-[14px] font-bold ${ctx.a.sessionMinutes === minutes ? "border-indigo bg-indigo text-white" : "border-ink-10 bg-paper text-ink"}`}
              >{minutes} min</button>
            ))}
          </div>
          <p className="mt-4 text-center text-[12px] leading-[1.4] text-ink-40">Bo nudges you on these days. Key journey checkpoints on Days 7, 14, 21 and 28 still get a check-in so important decisions do not slip.</p>
          <div className="flex-1 min-h-4" />
          <PrimaryButton onClick={ctx.next} disabled={!ctx.a.days.length}>Build around this rhythm</PrimaryButton>
        </>
      );
    },
  });

  list.push({
    key: "fear",
    phase: "The deeper blocker",
    render: ({ ctx }) => (
      <>
        <QHeader eyebrow="One deeper question" title="What feels most uncomfortable about making this real?" />
        <ChoiceList
          value={ctx.a.fear}
          onPick={(value) => { ctx.pick("fear", "fear", value as Fear); window.setTimeout(ctx.next, 180); }}
          options={FEARS.map((fear) => ({ v: fear, label: fear }))}
        />
        <div className="flex-1 min-h-4" />
      </>
    ),
  });

  list.push({
    key: "commitment",
    phase: "Your commitment",
    render: ({ ctx }) => (
      <>
        <QHeader eyebrow="A promise to yourself" title="When this gets uncomfortable, how should Bo respond?" />
        <div className="mt-4 rounded-[18px] border border-white/80 bg-paper/95 p-4 shadow-card">
          <div className="text-[10px] font-bold tracking-[1px] text-indigo">FOR THE NEXT 28 DAYS</div>
          <div className="mt-2 flex flex-col gap-1.5 text-[13px] font-semibold"><span>✓ I will choose evidence over guessing.</span><span>✓ I will make one useful move at a time.</span><span>✓ I will tell Bo the truth when I get stuck.</span></div>
        </div>
        <ChoiceList
          value={ctx.a.consequence}
          onPick={(value) => ctx.pick("commitment", "consequence", value)}
          options={[
            { v: "Be patient. We all stumble.", label: "Help me restart without shame" },
            { v: "Push me. Hard.", label: "Challenge me directly" },
            { v: "Remind me what I'll regret.", label: "Remind me why I started" },
          ]}
        />
        <div className="flex-1 min-h-4" />
        <PrimaryButton disabled={!ctx.a.consequence} onClick={() => { ctx.set("commitment", `I will show up for ${ctx.a.sessionMinutes} focused minutes on my chosen days.`); ctx.next(); }}>Build my journey</PrimaryButton>
      </>
    ),
  });

  list.push({
    key: "diagnosis",
    phase: "Your diagnosis",
    render: ({ ctx, buildProfile }) => {
      const diagnostic = buildFounderDiagnostic(buildProfile());
      return (
        <>
          <TrackMoment event="diagnosis_viewed" id="diagnosis" properties={{ track: ctx.a.track, pattern: diagnostic.pattern }} />
          <div className="mt-1 flex items-center justify-between gap-3">
            <Eyebrow className="!text-indigo">YOUR FOUNDER DIAGNOSTIC</Eyebrow>
            <span className="rounded-full bg-teal/15 px-2.5 py-1 text-[9px] font-bold tracking-[0.8px] text-teal-deep">FROM YOUR ANSWERS</span>
          </div>
          <H1 serif className="mt-3" style={{ fontSize: 30 }}>{diagnostic.pattern}</H1>
          <p className="mt-2 text-[17px] font-semibold leading-[1.3]">{diagnostic.headline}</p>
          <div className="mt-4 rounded-[20px] border border-white/80 bg-paper/95 p-4 shadow-card">
            <div className="text-[13px] leading-[1.5] text-ink-60">{diagnostic.summary}</div>
            <div className="my-3 h-px bg-ink-10" />
            <div className="text-[10px] font-bold tracking-[1.2px] text-bred">WHAT MAY SLOW YOU DOWN</div>
            <div className="mt-1.5 text-[13.5px] font-semibold leading-[1.4]">{diagnostic.blocker}</div>
          </div>
          <div className="mt-3 rounded-[18px] bg-ink p-4 text-cream">
            <div className="flex items-center gap-2.5">
              <BoMascot state="thinking" size={42} />
              <div><div className="text-[10px] font-bold tracking-[1px] text-yellow">HOW BO WILL COACH YOU</div><div className="mt-1 text-[12.5px] leading-[1.45] text-white/75">{diagnostic.coachingStyle}</div></div>
            </div>
          </div>
          <div className="flex-1 min-h-4" />
          <PrimaryButton onClick={ctx.next}>Build my journey around this →</PrimaryButton>
        </>
      );
    },
  });

  list.push({
    key: "plan",
    phase: "Your plan",
    render: ({ ctx, planTasks, buildProfile, saveJourney }) => <PlanReveal ctx={ctx} tasks={planTasks || buildFallbackPlan(buildProfile())} onContinue={saveJourney} />,
  });

  list.push({
    key: "paywall",
    phase: "Make it real",
    dark: true,
    render: ({ ctx, startCheckout: beginCheckout, checkoutError, optOutOfRecovery, emailMessage, canManageEmail, planTasks }) => (
      <>
        <TrackMoment event="paywall_viewed" id="paywall" properties={{ product: "badger-28-day", price: 49, track: ctx.a.track, flow_version: ONBOARDING_FLOW_VERSION }} />
        <div className="mt-2">
          <Eyebrow style={{ color: "rgba(232,212,77,0.9)" }}>YOUR 28-DAY JOURNEY IS SAVED</Eyebrow>
          <div className="mt-2.5 font-serif text-[34px] font-semibold leading-[1.05] tracking-[-1px]">{ctx.firstName}, start now.<br /><span className="text-yellow">$49 once.</span></div>
          <p className="mt-3 text-[13px] leading-[1.5] text-white/70">One payment unlocks the complete journey immediately. Bo coaches the next move, helps with the work and follows up when you disappear.</p>
        </div>
        <div className="mt-5 rounded-2xl border border-white/15 bg-white/[0.06] px-[18px] py-[18px]">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div><div className="text-[10px] font-bold tracking-[1px] text-white/45">COMPLETE JOURNEY</div><div className="mt-0.5 text-[13px] font-bold">Days 1–28 · starts immediately</div></div>
            <div className="text-right"><div className="font-serif text-[32px] font-semibold leading-none">$49</div><div className="mt-1 text-[9px] text-white/45">ONE PAYMENT</div></div>
          </div>
          {planTasks?.[0]?.title && <div className="pt-3"><div className="text-[10px] font-bold tracking-[1px] text-yellow">YOUR DAY 1 MOVE</div><div className="mt-1 text-[13px] font-bold leading-[1.4]">{planTasks[0].title}</div></div>}
          <div className="mt-3 flex flex-col gap-1.5 border-t border-white/10 pt-3">
            {["A 28-day path built from your answers", "One manageable move each day", "Bo coaching, practical help and accountability", "Restart your journey whenever you need", "Delete your content or turn reminders off anytime"].map((item) => (
              <div key={item} className="flex gap-2 text-[13px]"><span className="text-yellow">✓</span><span className="text-white/90">{item}</span></div>
            ))}
          </div>
        </div>
        <div className="mt-3 rounded-xl bg-yellow/10 px-3 py-2.5 text-center text-[11px] leading-[1.4] text-yellow">No subscription. Nothing renews. There is nothing to cancel later.</div>
        <div className="flex-1 min-h-4" />
        <div className="flex flex-col gap-1.5">
          {checkoutError && <div className="rounded-xl bg-red-500/15 px-3 py-2.5 text-[12px] leading-[1.4] text-red-300">{checkoutError}</div>}
          {emailMessage && <div className="rounded-xl bg-white/10 px-3 py-2.5 text-[12px] text-white/75">{emailMessage}</div>}
          <PrimaryButton onClick={beginCheckout}>Start my 28 days · Pay $49 once</PrimaryButton>
          <div className="p-2 text-center text-[11px] leading-[1.4] text-white/45">Stripe charges $49 today. Leaving checkout charges nothing. Read the <Link href="/terms" target="_blank" className="underline underline-offset-2">terms</Link> and <Link href="/privacy" target="_blank" className="underline underline-offset-2">privacy policy</Link>.</div>
            {canManageEmail && <button type="button" onClick={optOutOfRecovery} className="border-0 bg-transparent p-2 text-[11px] text-white/45 underline underline-offset-2">Turn journey emails off</button>}
        </div>
      </>
    ),
  });

  list.push({
    key: "final",
    phase: "Day 1",
    bar: false,
    render: ({ ctx, finish }) => (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 pt-6 text-center">
        <BoScene scene="summit" size={180} />
        <div><Eyebrow className="!text-center">YOU ARE IN</Eyebrow><H1 serif className="mt-3 text-center" style={{ fontSize: 32 }}>Day 1 starts now, {ctx.firstName}.</H1><p className="mx-auto mt-3 max-w-[300px] text-[15px] leading-[1.45] text-ink-60">One task is waiting. Bo explains every step. You just show up.</p></div>
        <PrimaryButton dark onClick={finish}>Take me to Day 1</PrimaryButton>
      </div>
    ),
  });

  return list;
}
