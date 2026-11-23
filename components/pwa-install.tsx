"use client";

import { useEffect, useState } from "react";
import { BoFace } from "./bo";

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const INSTALL_READY_EVENT = "badger:pwa-install-ready";
let deferredInstallPrompt: InstallPromptEvent | null = null;

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
}

function isAppleMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function PwaRuntime() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
    const rememberPrompt = (event: Event) => {
      event.preventDefault();
      deferredInstallPrompt = event as InstallPromptEvent;
      window.dispatchEvent(new Event(INSTALL_READY_EVENT));
    };
    const clearPrompt = () => {
      deferredInstallPrompt = null;
    };
    window.addEventListener("beforeinstallprompt", rememberPrompt);
    window.addEventListener("appinstalled", clearPrompt);
    return () => {
      window.removeEventListener("beforeinstallprompt", rememberPrompt);
      window.removeEventListener("appinstalled", clearPrompt);
    };
  }, []);
  return null;
}

export function PwaInstallCard() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [showAppleSteps, setShowAppleSteps] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setInstalled(isStandalone());
      setPrompt(deferredInstallPrompt);
    });
    const onPrompt = (event: Event) => {
      event.preventDefault();
      deferredInstallPrompt = event as InstallPromptEvent;
      setPrompt(deferredInstallPrompt);
    };
    const onPromptReady = () => setPrompt(deferredInstallPrompt);
    const onInstalled = () => {
      setInstalled(true);
      deferredInstallPrompt = null;
      setPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener(INSTALL_READY_EVENT, onPromptReady);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener(INSTALL_READY_EVENT, onPromptReady);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = async () => {
    if (installed) return;
    const availablePrompt = prompt ?? deferredInstallPrompt;
    if (availablePrompt) {
      await availablePrompt.prompt();
      const choice = await availablePrompt.userChoice;
      if (choice.outcome === "accepted") setInstalled(true);
      deferredInstallPrompt = null;
      setPrompt(null);
      return;
    }
    setShowAppleSteps(true);
  };

  return (
    <div className="rounded-[26px] bg-paper p-6 shadow-card">
      <div className="flex items-start gap-3">
        <BoFace state={installed ? "celebrating" : "fired-up"} size={52} />
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-extrabold tracking-[1.4px] text-indigo">BADGER AI ON YOUR PHONE</div>
          <h2 className="mt-1.5 text-[24px] font-extrabold leading-[1.08] tracking-[-0.7px]">
            {installed ? "Ready like an app." : "Install it like an app."}
          </h2>
          <p className="mt-2 text-[13px] leading-[1.5] text-ink-60">
            A focused phone experience for Android and iPhone, with a Home Screen icon and opt-in
            reminders from Bo.
          </p>
        </div>
      </div>

      {!installed && (
        <button
          type="button"
          onClick={install}
          className="spring mt-5 w-full rounded-[14px] border-0 bg-ink px-5 py-3.5 text-[14px] font-bold text-cream cursor-pointer"
        >
          Add Badger AI to my phone
        </button>
      )}

      {showAppleSteps && !installed && (
        <div className="mt-3 rounded-[14px] bg-cream-warm p-4 text-[12.5px] leading-[1.5] text-ink-60">
          {isAppleMobile() ? (
            <>On iPhone or iPad: open this page in <strong className="text-ink">Safari</strong>, tap <strong className="text-ink">Share</strong>, then <strong className="text-ink">Add to Home Screen</strong>.</>
          ) : (
            <>On Android: open this page in <strong className="text-ink">Chrome</strong>, tap the browser menu, then choose <strong className="text-ink">Install app</strong> or <strong className="text-ink">Add to Home screen</strong>.</>
          )}
        </div>
      )}

      {installed && (
        <div className="mt-4 rounded-[14px] bg-teal/10 p-3 text-center text-[12px] font-bold text-teal-deep">
          ✓ Installed on this device
        </div>
      )}
    </div>
  );
}
