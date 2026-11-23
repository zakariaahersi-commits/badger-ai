"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { authJsonHeaders } from "@/lib/cloud";
import { track } from "@/lib/telemetry";
import { BrandBo } from "./brand-bo";

type ChannelState = {
  configured: boolean;
  provider: "linq" | "sendblue" | null;
  connected: boolean;
  status: "not_connected" | "active" | "paused" | "opted_out";
};

type LinkState = {
  provider: "linq" | "sendblue";
  code: string;
  message: string;
  number: string;
  expiresAt: string;
  deepLink: string;
};

const subscribeToDevice = () => () => {};

function usePhoneKind(): "unknown" | "iphone" | "other" {
  return useSyncExternalStore(
    subscribeToDevice,
    () => /iPhone|iPod/i.test(navigator.userAgent) ? "iphone" : "other",
    () => "unknown",
  );
}

export function IMessageConnect() {
  const phoneKind = usePhoneKind();
  const [channel, setChannel] = useState<ChannelState | null>(null);
  const [link, setLink] = useState<LinkState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [phone, setPhone] = useState("");
  const [copied, setCopied] = useState(false);
  const [clock, setClock] = useState(() => Date.now());

  const refreshChannel = useCallback(async () => {
    try {
      const response = await fetch("/api/messaging/link", { headers: await authJsonHeaders() });
      if (!response.ok) return;
      const next = await response.json() as ChannelState;
      setChannel(next);
      if (next.connected && next.status === "active") setLink(null);
    } catch {
      // This optional pilot card can retry when the founder returns to it.
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void refreshChannel(), 0);
    const onFocus = () => void refreshChannel();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refreshChannel();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearTimeout(initial);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refreshChannel]);

  useEffect(() => {
    if (!channel?.configured || window.location.hash !== "#connect-bo") return;
    window.requestAnimationFrame(() => {
      document.getElementById("connect-bo")?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [channel]);

  useEffect(() => {
    if (!link) return;
    const timer = window.setInterval(() => setClock(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [link]);

  if (phoneKind === "unknown") return null;

  if (!channel || channel.configured === false) return null;
  const isIphone = phoneKind === "iphone";
  const remainingSeconds = link ? Math.max(0, Math.ceil((Date.parse(link.expiresAt) - clock) / 1_000)) : 0;
  const linkExpired = Boolean(link && remainingSeconds === 0);

  const connect = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const headers = await authJsonHeaders();
      const response = await fetch("/api/messaging/link", {
        method: "POST",
        headers,
        body: channel?.provider === "sendblue" ? JSON.stringify({ phone }) : undefined,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not create the connection");
      setClock(Date.now());
      setLink(data);
      void track("imessage_link_created", { provider: data.provider });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create the connection");
    } finally {
      setBusy(false);
    }
  };

  const copyHandoff = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(`Text ${link.message} to ${link.number}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_500);
      void track("imessage_link_opened", { provider: link.provider, handoff: "copy" });
    } catch {
      setError("Could not copy automatically. Use the number and START message shown below.");
    }
  };

  if (channel?.connected && channel.status === "active" && !link) {
    return (
      <div id="connect-bo" className="rounded-[18px] border border-ink-10 bg-paper px-4 py-3.5 shadow-card">
        <div className="flex items-center gap-3">
          <BrandBo pose="peek" size={58} alt="Bo" className="-my-2" />
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-bold">Bo is connected in iMessage</div>
            <div className="mt-0.5 text-[11.5px] leading-[1.4] text-ink-60">Text TODAY, STUCK, DONE, PAUSE or STOP anytime.</div>
          </div>
          <span className="rounded-full bg-teal/15 px-2.5 py-1 text-[10px] font-bold text-teal-deep">CONNECTED</span>
        </div>
      </div>
    );
  }

  return (
    <div id="connect-bo" className="overflow-hidden rounded-[20px] bg-ink px-4 py-4 text-cream shadow-card">
      <div className="flex items-start gap-3">
        <BrandBo pose="peek" size={70} alt="Bo" className="-my-3" />
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-bold uppercase tracking-[1.2px] text-yellow">iPhone pilot</div>
          <div className="mt-1 text-[18px] font-bold leading-[1.18]">{isIphone ? "Bo is ready to coach you for the next 28 days." : "Connect an iPhone to Bo from this screen."}</div>
          <div className="mt-2 text-[12px] leading-[1.45] text-white/65">{isIphone ? "Text first to connect." : "Create the code here, then copy the number and START message to the iPhone you want to connect."} One morning task, at most one follow-up, and never outside your chosen hours. STOP opts out immediately.</div>
        </div>
      </div>
      {link ? (
        <div className="mt-4 rounded-[14px] bg-white/8 p-3">
          <div className="text-[11px] text-white/60">{linkExpired ? "This code has expired" : `Private code · ${Math.floor(remainingSeconds / 60)}:${String(remainingSeconds % 60).padStart(2, "0")} left`}</div>
          <div className="mt-1 font-mono text-[20px] font-bold tracking-[2px]">{link.code}</div>
          <div className="mt-2 rounded-[10px] bg-black/20 px-3 py-2 text-[11px] leading-[1.5] text-white/75"><span className="font-bold text-white">To:</span> {link.number}<br /><span className="font-bold text-white">Message:</span> {link.message}</div>
          {linkExpired ? (
            <button type="button" disabled={busy} onClick={connect} className="mt-3 w-full rounded-[12px] border-none bg-yellow px-4 py-3 text-center text-[14px] font-bold text-ink disabled:opacity-50">
              {busy ? "Creating a fresh code…" : "Create a fresh code"}
            </button>
          ) : isIphone ? (
            <a
              href={link.deepLink}
              onClick={() => void track("imessage_link_opened", { provider: link.provider, handoff: "iphone" })}
              className="mt-3 block rounded-[12px] bg-[#34C759] px-4 py-3 text-center text-[14px] font-bold text-white no-underline"
            >
              Open iMessage and send {link.message}
            </a>
          ) : (
            <button type="button" onClick={() => void copyHandoff()} className="mt-3 w-full rounded-[12px] border-none bg-[#34C759] px-4 py-3 text-center text-[14px] font-bold text-white">
              {copied ? "Copied — send it from the iPhone" : "Copy number and START message"}
            </button>
          )}
          <div className="mt-2 text-center text-[10.5px] text-white/45">{linkExpired ? "Generate a fresh code when you are ready to send it." : "iMessage will open with the text prepared. Press send to finish connecting."}</div>
        </div>
      ) : (
        <div className="mt-4">
          {channel.provider === "sendblue" && (
            <div className="mb-2.5">
              <label htmlFor="imessage-phone" className="mb-1.5 block text-[10.5px] font-bold text-white/70">Your iPhone number with country code</label>
              <input
                id="imessage-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="+46 70 123 45 67"
                className="w-full rounded-[12px] border border-white/15 bg-white/10 px-3.5 py-3 text-[14px] text-white outline-none placeholder:text-white/35 focus:border-yellow"
              />
              <div className="mt-1.5 text-[10px] leading-[1.35] text-white/45">Used to reserve one of 10 pilot contacts with our iMessage provider. Badger stores it encrypted.</div>
            </div>
          )}
          <button type="button" disabled={busy || (channel.provider === "sendblue" && !phone.trim())} onClick={connect} className="w-full rounded-[12px] border-none bg-yellow px-4 py-3.5 text-[14px] font-bold text-ink disabled:opacity-50">
            {busy ? "Creating your private code…" : "Connect Bo in iMessage →"}
          </button>
        </div>
      )}
      {error && <div className="mt-2 text-[11px] text-[#FF9F9F]">{error}</div>}
    </div>
  );
}
