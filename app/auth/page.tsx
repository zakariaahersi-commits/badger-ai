"use client";

// Account — required before payment so purchases, plans and progress stay
// attached to a verified founder instead of a single browser.

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { BoMascot } from "@/components/bo";
import { Eyebrow, H1, PhoneFrame, PrimaryButton } from "@/components/ui";
import { cloudEnabled, supabase } from "@/lib/cloud";
import { markLocalChange } from "@/lib/sync";
import { track } from "@/lib/telemetry";
import { clearLayersAuthIntent, markLayersAuthIntent } from "@/lib/layers-analytics";

export default function AuthPage() {
  return (
    <Suspense>
      <AuthInner />
    </Suspense>
  );
}

function AuthInner() {
  const router = useRouter();
  const params = useSearchParams();
  const requestedNext = params.get("next") || "/app";
  const next = requestedNext.startsWith("/") && !requestedNext.startsWith("//")
    ? requestedNext
    : "/app";
  const checkoutNext = next.includes("checkout=resume");
  const onboardingNext = next.startsWith("/start");
  const [mode, setMode] = useState<"signup" | "signin" | "forgot">(
    params.get("mode") === "signin" ? "signin" : params.get("mode") === "forgot" ? "forgot" : "signup"
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(
    params.get("password") === "updated" ? "Your password is updated. Sign in with the new one." : ""
  );

  if (!cloudEnabled) {
    return (
      <PhoneFrame>
        <div className="flex-1 flex flex-col items-center justify-center px-8 text-center gap-5 min-h-dvh">
          <BoMascot state="thinking" size={110} />
          <H1 serif style={{ fontSize: 28 }}>
            Accounts aren&apos;t switched on yet.
          </H1>
          <p className="text-[14px] text-ink-60 leading-[1.5] max-w-[300px]">
            Secure accounts are temporarily unavailable. Please come back shortly. Your answers
            remain saved on this device.
          </p>
          <Link href="/" className="px-6 py-3.5 rounded-[14px] bg-yellow text-ink text-[15px] font-bold no-underline shadow-btn-yellow">
            Back to Badger AI
          </Link>
        </div>
      </PhoneFrame>
    );
  }

  const submit = async () => {
    const sb = supabase();
    if (!sb || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (mode === "forgot") {
        const { error } = await sb.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/auth/reset`,
        });
        if (error) throw error;
        setNotice("If an account uses that email, a password reset link is on its way.");
        return;
      } else if (mode === "signup") {
        const { data, error } = await sb.auth.signUp({ email: email.trim(), password });
        if (error) throw error;
        void track("account_created", { provider: "email", verification_pending: !data.session });
        if (!data.session) {
          setNotice("Check your inbox to confirm your email, then sign in.");
          setMode("signin");
          return;
        }
      } else {
        const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        void track("signed_in", { provider: "email" });
      }
      markLocalChange();
      router.push(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const continueWithGoogle = async () => {
    const sb = supabase();
    if (!sb || busy) return;
    setBusy(true);
    setError("");
    markLayersAuthIntent(mode === "signin" ? "login" : "sign_up");
    const { error } = await sb.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}${next}` },
    });
    if (error) {
      clearLayersAuthIntent();
      setError(error.message);
      setBusy(false);
    } else void track("account_oauth_started", { provider: "google" });
  };

  return (
    <PhoneFrame>
      <div className="flex-1 flex flex-col px-6 pt-10 pb-8 min-h-dvh">
        <div className="flex flex-col items-center gap-4 mb-8">
          <BoMascot state={mode === "signup" ? "fired-up" : mode === "forgot" ? "thinking" : "idle"} size={96} />
          <div className="text-center">
            <Eyebrow className="!text-center">
              {mode === "signup" ? (checkoutNext ? "Your plan is saved" : onboardingNext ? "Save your place with Bo" : "Save your sprint") : mode === "forgot" ? "Reset your password" : "Welcome back"}
            </Eyebrow>
            <H1 serif style={{ fontSize: 30 }} className="mt-2 text-center">
              {mode === "signup" ? (checkoutNext ? "Create your account. Then start." : onboardingNext ? "Continue now or come back later." : "Your progress deserves an account.") : mode === "forgot" ? "We’ll help you get back in." : "Pick up where you left off."}
            </H1>
            {mode === "signup" && (
              <p className="mt-2 text-[13.5px] text-ink-60 leading-[1.45] max-w-[290px] mx-auto">
                {checkoutNext ? "Next: secure Stripe checkout for one $49 payment. No subscription or renewal." : onboardingNext ? "Save the starting point you chose. If you leave, Bo can send one reminder so you do not have to begin again." : "Progress syncs to every device, and Bo can email your next useful move."}
              </p>
            )}
            {mode === "forgot" && (
              <p className="mt-2 text-[13.5px] text-ink-60 leading-[1.45] max-w-[290px] mx-auto">
                Enter your email. We will send a secure link to choose a new password.
              </p>
            )}
          </div>
        </div>

        {mode !== "forgot" && <>
          <button type="button" onClick={() => void continueWithGoogle()} disabled={busy} className="flex w-full items-center justify-center gap-3 rounded-[14px] border-[1.5px] border-ink bg-ink px-4 py-3.5 text-[15px] font-bold text-cream shadow-card disabled:opacity-40">
            <GoogleMark /> Continue with Google · fastest
          </button>
          <div className="my-4 flex items-center gap-3 text-[10px] font-bold uppercase tracking-[1px] text-ink-40"><span className="h-px flex-1 bg-ink-10" />or use email<span className="h-px flex-1 bg-ink-10" /></div>
        </>}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="flex flex-col gap-3"
        >
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full px-4 py-3.5 text-[16px] border-[1.5px] border-ink-20 rounded-[14px] bg-paper outline-none focus:border-ink placeholder:text-ink-20"
          />
          {mode !== "forgot" && (
            <input
              type="password"
              required
              minLength={8}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === "signup" ? "Password (8+ characters)" : "Password"}
              className="w-full px-4 py-3.5 text-[16px] border-[1.5px] border-ink-20 rounded-[14px] bg-paper outline-none focus:border-ink placeholder:text-ink-20"
            />
          )}
          {error && <div className="text-[13px] font-semibold text-bred px-1">{error}</div>}
          {notice && <div className="text-[13px] font-semibold text-teal-deep px-1">{notice}</div>}
          <PrimaryButton type="submit" disabled={busy || !email.trim() || (mode !== "forgot" && password.length < 8)}>
            {busy ? "One sec…" : mode === "signup" ? "Create my account" : mode === "forgot" ? "Send reset link" : "Sign in"}
          </PrimaryButton>
        </form>

        <div className="mt-4 flex flex-col items-center gap-1">
          {mode === "signin" && (
            <button type="button" onClick={() => { setMode("forgot"); setError(""); setNotice(""); }} className="p-2 bg-transparent border-none text-indigo text-[14px] font-semibold cursor-pointer">
              Forgot your password?
            </button>
          )}
          <button
            type="button"
            onClick={() => { setMode(mode === "signup" ? "signin" : mode === "forgot" ? "signin" : "signup"); setError(""); setNotice(""); }}
            className="p-2 bg-transparent border-none text-ink-60 text-[14px] cursor-pointer"
          >
            {mode === "signup" ? "Already have an account? Sign in" : mode === "forgot" ? "Back to sign in" : "New here? Create an account"}
          </button>
        </div>

        <div className="flex-1" />
        <p className="text-center text-[12px] text-ink-40 leading-[1.4] p-2">
          Google is the quickest option. Email and password remain available so nobody is forced to use Google.
        </p>
      </div>
    </PhoneFrame>
  );
}

function GoogleMark() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5"><path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.4a4.6 4.6 0 0 1-2 3v2.6h3.3c1.9-1.8 2.9-4.4 2.9-7.5Z"/><path fill="#34A853" d="M12 22c2.7 0 5-.9 6.7-2.3l-3.3-2.6c-.9.6-2.1 1-3.4 1a5.9 5.9 0 0 1-5.5-4.1H3.1v2.7A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.5 14a6 6 0 0 1 0-3.9V7.4H3.1A10 10 0 0 0 2 12c0 1.7.4 3.2 1.1 4.6L6.5 14Z"/><path fill="#EA4335" d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.9-2.8A9.7 9.7 0 0 0 3.1 7.4l3.4 2.7A5.9 5.9 0 0 1 12 5.9Z"/></svg>;
}
