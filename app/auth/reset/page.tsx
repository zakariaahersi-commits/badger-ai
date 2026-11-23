"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BoMascot } from "@/components/bo";
import { Eyebrow, H1, PhoneFrame, PrimaryButton } from "@/components/ui";
import { cloudEnabled, supabase } from "@/lib/cloud";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [ready, setReady] = useState(!cloudEnabled);
  const [valid, setValid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const sb = supabase();
    if (!sb) return;
    let mounted = true;
    sb.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setValid(Boolean(data.session));
      setReady(true);
    });
    const { data } = sb.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === "PASSWORD_RECOVERY" || session) setValid(true);
      setReady(true);
    });
    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const updatePassword = async () => {
    const sb = supabase();
    if (!sb || busy) return;
    setError("");
    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("The passwords do not match.");
      return;
    }
    setBusy(true);
    const { error } = await sb.auth.updateUser({ password });
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }
    await sb.auth.signOut({ scope: "local" });
    router.replace("/auth?mode=signin&password=updated");
  };

  return (
    <PhoneFrame>
      <main className="flex min-h-dvh flex-1 flex-col items-center justify-center px-6 py-10 text-center">
        <BoMascot state={valid ? "fired-up" : "thinking"} size={104} />
        <Eyebrow className="mt-5 !text-center">SECURE ACCOUNT RECOVERY</Eyebrow>
        <H1 serif style={{ fontSize: 30 }} className="mt-2 text-center">
          Choose a new password.
        </H1>

        {!cloudEnabled || (ready && !valid) ? (
          <div className="mt-5 w-full rounded-[18px] bg-paper p-5 text-left shadow-card">
            <p className="text-[14px] leading-[1.5] text-ink-60">
              This reset link is invalid or has expired. Request a new one from the sign-in screen.
            </p>
            <button type="button" onClick={() => router.replace("/auth?mode=forgot")} className="mt-4 w-full rounded-[14px] border-none bg-ink px-5 py-4 text-[15px] font-bold text-cream">
              Request another link
            </button>
          </div>
        ) : !ready ? (
          <p className="mt-5 text-[14px] text-ink-60">Checking your secure link…</p>
        ) : (
          <form onSubmit={(event) => { event.preventDefault(); void updatePassword(); }} className="mt-5 flex w-full flex-col gap-3 text-left">
            <input type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="New password (8+ characters)" className="w-full rounded-[14px] border-[1.5px] border-ink-20 bg-paper px-4 py-3.5 text-[16px] outline-none focus:border-ink" />
            <input type="password" required minLength={8} autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} placeholder="Type it again" className="w-full rounded-[14px] border-[1.5px] border-ink-20 bg-paper px-4 py-3.5 text-[16px] outline-none focus:border-ink" />
            {error && <div className="px-1 text-[13px] font-semibold text-bred">{error}</div>}
            <PrimaryButton type="submit" disabled={busy || password.length < 8 || confirm.length < 8}>
              {busy ? "Updating…" : "Save new password"}
            </PrimaryButton>
          </form>
        )}
      </main>
    </PhoneFrame>
  );
}
