"use client";

// Settings sheet — profile, the contract, verification connections,
// demo time-travel, and the reset escape hatch.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useBygga } from "@/lib/store";
import { cloudEnabled, demoMode, supabase } from "@/lib/cloud";
import {
  beginLocalSignOut,
  cancelLocalSignOut,
  clearLocalAccountAfterSignOut,
} from "@/lib/account-isolation";
import { useSession } from "@/lib/sync";
import { Pill } from "./ui";
import { BrandBo } from "./brand-bo";
import { PushNotificationSetting } from "./push-notifications";

export function SettingsSheet({ onClose }: { onClose: () => void }) {
  const s = useBygga();
  const router = useRouter();
  const [confirmReset, setConfirmReset] = useState(false);
  const { session } = useSession();

  if (!s.profile) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(26,26,26,0.55)" }} onClick={onClose}>
      <div className="w-full max-w-[480px] bg-cream rounded-t-[22px] px-6 pt-5 pb-8 anim-rise max-h-[90dvh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="text-[11px] font-bold tracking-[1.2px] text-ink-60">YOU & BO</div>
          <button type="button" onClick={onClose} className="w-7 h-7 rounded-full bg-ink-10 border-none text-[15px] cursor-pointer">
            ×
          </button>
        </div>

        {/* Profile */}
        <div className="bg-paper shadow-card rounded-2xl p-4 flex items-center gap-3">
          <BrandBo pose="front" size={48} alt="Bo" />
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-bold">{s.profile.name}</div>
            <div className="text-[12px] text-ink-60 truncate">{s.profile.ideaShort}</div>
          </div>
          <Pill bg="var(--bygga-yellow)" color="#1A1A1A">28-day founder</Pill>
        </div>
        <button
          type="button"
          onClick={() => { onClose(); router.push("/app/profile"); }}
          className="spring mt-3 w-full rounded-2xl border border-ink-10 bg-paper p-4 text-left shadow-card cursor-pointer"
        >
          <div className="text-[10px] font-bold tracking-[1px] text-indigo">PROFILE & SETTINGS</div>
          <div className="mt-1 text-[13px] font-bold">Photo, Bo memory, notifications and proof →</div>
        </button>

        {/* Account */}
        {cloudEnabled && (
          <div className="mt-3 bg-paper shadow-card rounded-2xl p-4">
            <div className="text-[10px] font-bold tracking-[1px] text-ink-60 mb-2">ACCOUNT</div>
            {session ? (
              <div className="flex items-center gap-2.5">
                <div className="flex-1 text-[13px] font-semibold truncate">{session.user.email}</div>
                <Pill bg="rgba(60,142,104,0.12)" color="var(--bygga-teal-deep)">✓ Synced</Pill>
                <button
                  type="button"
                  onClick={async () => {
                    beginLocalSignOut(localStorage);
                    const result = await supabase()?.auth.signOut();
                    if (result?.error) {
                      cancelLocalSignOut(localStorage);
                      return;
                    }
                    s.resetAll();
                    clearLocalAccountAfterSignOut(localStorage);
                    onClose();
                    router.replace("/");
                  }}
                  className="px-3 py-1.5 rounded-full text-[11px] font-bold cursor-pointer border border-ink-20 bg-transparent"
                >
                  Sign out
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => router.push("/auth?next=/app")}
                className="spring w-full py-2.5 rounded-[10px] border-none bg-ink text-cream text-[12px] font-bold cursor-pointer"
              >
                Create account · sync across devices
              </button>
            )}
          </div>
        )}

        {/* Notifications — only does anything signed in (the cron reads this) */}
        {cloudEnabled && session && (
          <div className="mt-3 bg-paper shadow-card rounded-2xl p-4 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-bold">Bo&apos;s morning email</div>
              <div className="text-[11.5px] text-ink-60 leading-[1.35]">A daily nudge with today&apos;s one task. Off anytime.</div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={s.notify}
              aria-label="Bo's morning email"
              onClick={() => s.setNotify(!s.notify)}
              className="relative w-12 h-7 rounded-full shrink-0 transition-colors border-none cursor-pointer"
              style={{ background: s.notify ? "var(--bygga-teal-deep)" : "var(--bygga-ink20)" }}
            >
              <span className="absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white transition-transform" style={{ transform: s.notify ? "translateX(20px)" : "translateX(0)" }} />
            </button>
          </div>
        )}

        {cloudEnabled && <PushNotificationSetting />}

        <div className="mt-3 overflow-hidden rounded-2xl bg-paper shadow-card">
          <PreferenceSwitch
            title="Gentle haptics"
            description="A small pulse when you start, add proof or reach a milestone."
            checked={s.hapticsEnabled}
            onChange={s.setHapticsEnabled}
          />
          <PreferenceSwitch
            title="Bo sounds"
            description="Optional quiet tones for completion and milestones. Off by default."
            checked={s.soundEnabled}
            onChange={s.setSoundEnabled}
            divided
          />
          <div className="border-t border-ink-10 px-4 py-3 text-[11px] leading-[1.4] text-ink-40">
            Motion follows your phone&apos;s Reduce Motion setting automatically.
          </div>
        </div>

        {/* The contract */}
        <div className="mt-3 bg-paper shadow-card rounded-2xl p-4">
          <div className="text-[10px] font-bold tracking-[1px] text-ink-60 mb-2">YOUR CONTRACT</div>
          <div className="text-[13px] leading-[1.5]">
            One idea for 28 days, with proof of every step. If you go quiet:{" "}
            <span className="font-bold">&quot;{s.profile.consequence}&quot;</span>
          </div>
          <div className="mt-2 text-[11px] text-ink-40">
            Work days: {s.profile.days.map((d) => "MTWTFSS"[d]).join(" · ")} · {s.profile.sessionMinutes} min ·{" "}
            {s.profile.thinkingTime}
          </div>
        </div>

        {/* Evidence connections are intentionally honest: these are planned,
            not fake OAuth links. Public proof links work today. */}
        <div className="mt-3 bg-paper shadow-card rounded-2xl p-4">
          <div className="text-[10px] font-bold tracking-[1px] text-ink-60 mb-1">PROOF STATUS</div>
          <div className="text-[11.5px] leading-[1.4] text-ink-60 mb-3">Public links are checked now. Direct account connections are coming next and are not connected yet.</div>
          <div className="flex flex-col gap-2">
            {s.connections.map((c) => (
              <div key={c.kind} className="flex items-center gap-2.5">
                <div className="flex-1 text-[13px] font-semibold">{c.label}</div>
                <Pill bg="var(--bygga-ink10)" color="var(--bygga-ink60)">Planned</Pill>
              </div>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            onClose();
            window.setTimeout(() => window.dispatchEvent(new Event("byqqa:show-tour")), 180);
          }}
          className="spring mt-3 w-full rounded-2xl border border-ink-10 bg-paper p-4 text-left shadow-card cursor-pointer"
        >
          <div className="text-[10px] font-bold tracking-[1px] text-indigo">GUIDED TOUR</div>
          <div className="mt-1 text-[13px] font-bold">Show me how Badger AI works →</div>
          <div className="mt-1 text-[11.5px] leading-[1.35] text-ink-60">Replay Bo’s short tour of today’s task, your launch path and co-founder chat.</div>
        </button>

        {/* Demo controls — only in dev / NEXT_PUBLIC_DEMO_MODE, never for real users */}
        {demoMode && (
          <div className="mt-3 bg-cream-warm rounded-2xl p-4" style={{ border: "1.5px dashed var(--bygga-ink20)" }}>
            <div className="text-[10px] font-bold tracking-[1px] text-ink-60 mb-1.5">PREVIEW MODE</div>
            <div className="text-[12px] text-ink-60 mb-2.5">
              Jump forward to preview Kill Day (14) and Ship Day (28) without waiting.
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => s.advanceDay(1)} className="spring flex-1 py-2.5 rounded-[10px] border border-ink-20 bg-paper text-[12px] font-bold cursor-pointer">
                +1 day
              </button>
              <button type="button" onClick={() => s.advanceDay(7)} className="spring flex-1 py-2.5 rounded-[10px] border border-ink-20 bg-paper text-[12px] font-bold cursor-pointer">
                +1 week
              </button>
            </div>
          </div>
        )}

        {/* Reset */}
        {!confirmReset ? (
          <button type="button" onClick={() => setConfirmReset(true)} className="mt-4 w-full py-3 rounded-[12px] bg-transparent border border-ink-20 text-ink-60 text-[13px] font-semibold cursor-pointer">
            Start over with a different idea
          </button>
        ) : (
          <div className="mt-4 bg-paper shadow-card rounded-2xl p-4" style={{ border: "1.5px solid var(--bygga-red)" }}>
            <div className="text-[13px] font-bold mb-1">This erases your sprint, logs, and streak.</div>
            <div className="text-[12px] text-ink-60 mb-3">
              If the idea deserves a verdict, kill it properly instead. It keeps the lesson.
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  s.resetAll();
                  router.push("/start");
                }}
                className="flex-1 py-2.5 rounded-[10px] border-none text-white text-[12px] font-bold cursor-pointer"
                style={{ background: "#991B1B" }}
              >
                Erase and restart
              </button>
              <button type="button" onClick={() => setConfirmReset(false)} className="px-4 py-2.5 rounded-[10px] border border-ink-20 bg-transparent text-[12px] font-semibold cursor-pointer">
                Keep going
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PreferenceSwitch({ title, description, checked, onChange, divided = false }: { title: string; description: string; checked: boolean; onChange: (next: boolean) => void; divided?: boolean }) {
  return (
    <div className={`flex items-center gap-3 p-4 ${divided ? "border-t border-ink-10" : ""}`}>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-bold">{title}</div>
        <div className="text-[11.5px] leading-[1.35] text-ink-60">{description}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={title}
        onClick={() => onChange(!checked)}
        className="relative h-7 w-12 shrink-0 rounded-full border-0 transition-colors"
        style={{ background: checked ? "var(--bygga-teal-deep)" : "var(--bygga-ink20)" }}
      >
        <span className="absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-white transition-transform" style={{ transform: checked ? "translateX(20px)" : "translateX(0)" }} />
      </button>
    </div>
  );
}
