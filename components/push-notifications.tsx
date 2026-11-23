"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authJsonHeaders } from "@/lib/cloud";
import { useSession } from "@/lib/sync";
import { track } from "@/lib/telemetry";

type PushState = "checking" | "off" | "on" | "working" | "denied" | "unsupported" | "install-first" | "unconfigured" | "error";

function standalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

function appleMobile(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function decodeKey(value: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

export function PushNotificationSetting() {
  const router = useRouter();
  const { session } = useSession();
  const [state, setState] = useState<PushState>("checking");

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      queueMicrotask(() => setState("unsupported"));
      return;
    }
    if (appleMobile() && !standalone()) {
      queueMicrotask(() => setState("install-first"));
      return;
    }
    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => setState(subscription ? "on" : Notification.permission === "denied" ? "denied" : "off"))
      .catch(() => setState("error"));
  }, []);

  const enable = async () => {
    if (!session) {
      router.push("/auth?next=/app");
      return;
    }
    setState("working");
    try {
      const keyResponse = await fetch("/api/push/key", { cache: "no-store" });
      const keyData = await keyResponse.json();
      if (!keyData.publicKey) {
        setState("unconfigured");
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState("denied");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      const subscription = existing ?? await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeKey(keyData.publicKey),
      });
      const response = await fetch("/api/push", {
        method: "POST",
        headers: await authJsonHeaders(),
        body: JSON.stringify({
          subscription: subscription.toJSON(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      if (!response.ok) {
        await subscription.unsubscribe();
        throw new Error("subscription not saved");
      }
      setState("on");
      void track("push_enabled");
    } catch {
      setState("error");
    }
  };

  const disable = async () => {
    setState("working");
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await fetch("/api/push", {
          method: "DELETE",
          headers: await authJsonHeaders(),
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }
      setState("off");
    } catch {
      setState("error");
    }
  };

  const detail = state === "on"
    ? "Bo can nudge you even when Badger AI is closed. Off anytime."
    : state === "install-first"
      ? "On iPhone, add Badger AI to your Home Screen first. Reopen it there, then enable reminders."
      : state === "denied"
        ? "Notifications are blocked in your phone settings."
        : state === "unsupported"
          ? "This browser does not support app notifications."
          : state === "unconfigured"
            ? "Device reminders are not ready yet. Email reminders still work."
            : state === "error"
              ? "That did not work. Please try again."
              : "A short daily reminder for today’s one step.";

  const interactive = !["checking", "working", "unsupported", "install-first", "unconfigured"].includes(state);

  return (
    <div className="mt-3 bg-paper shadow-card rounded-2xl p-4 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-bold">Bo&apos;s phone reminders</div>
        <div className="text-[11.5px] text-ink-60 leading-[1.35]">{detail}</div>
        {!session && state === "off" && <div className="mt-1 text-[10.5px] font-bold text-indigo">Sign in when you enable them.</div>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={state === "on"}
        aria-label="Bo's phone reminders"
        disabled={!interactive}
        onClick={state === "on" ? disable : enable}
        className="relative w-12 h-7 rounded-full shrink-0 transition-colors border-none cursor-pointer disabled:opacity-45 disabled:cursor-default"
        style={{ background: state === "on" ? "var(--bygga-teal-deep)" : "var(--bygga-ink20)" }}
      >
        <span className="absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white transition-transform" style={{ transform: state === "on" ? "translateX(20px)" : "translateX(0)" }} />
      </button>
    </div>
  );
}
