"use client";

import { useEffect, useState } from "react";
import { authJsonHeaders, demoMode } from "@/lib/cloud";
import type { FounderBrainBrief } from "@/lib/founder-brain";

const PREVIEW_BRIEF: FounderBrainBrief = {
  known: [
    { text: "Independent creators struggle to choose a price for their work.", source: "onboarding", fresh: true },
    { text: "Two creators said they compare random examples before sending a quote.", source: "saved proof", fresh: true },
  ],
  missing: "We do not know if either creator will pay for help yet.",
  nextMove: "Ask one creator to pay for a short pricing review.",
  commitment: null,
  generatedAt: new Date(0).toISOString(),
};

const UGC_PREVIEW_BRIEF: FounderBrainBrief = {
  known: [
    { text: "Four of five freelancers delay chasing late invoices because it feels awkward.", source: "saved proof", fresh: true },
    { text: "Two people asked Maya if she could handle the follow-up for them.", source: "customer calls", fresh: true },
  ],
  missing: "We still need a real payment to prove the service is valuable.",
  nextMove: "Send one clear $19 payment ask. Do not add another feature.",
  commitment: null,
  generatedAt: new Date(0).toISOString(),
};

async function requestBrief(): Promise<FounderBrainBrief | null> {
  const res = await fetch("/api/brain", { headers: await authJsonHeaders(), cache: "no-store" });
  if (!res.ok) return null;
  const data = await res.json();
  return data.brief ? data.brief as FounderBrainBrief : null;
}

export function BoBrief() {
  const [brief, setBrief] = useState<FounderBrainBrief | null>(null);
  const [available, setAvailable] = useState(true);
  const [busy, setBusy] = useState(false);
  const isUgcPreview = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("preview") === "ugc";
  const previewBrief = isUgcPreview ? UGC_PREVIEW_BRIEF : PREVIEW_BRIEF;

  useEffect(() => {
    let cancelled = false;
    requestBrief().then((result) => {
      if (cancelled) return;
      if (result) setBrief(result);
      else if (demoMode) setBrief(previewBrief);
      else setAvailable(false);
    }).catch(() => {
      if (!cancelled) {
        if (demoMode) setBrief(previewBrief);
        else setAvailable(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [previewBrief]);

  if (!available) return null;
  if (!brief) {
    return <div className="mb-3 rounded-2xl border border-ink-10 bg-paper p-3 text-[11px] text-ink-40">Bo is checking the venture record…</div>;
  }

  const complete = async () => {
    if (!brief.commitment || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/commitments/${encodeURIComponent(brief.commitment.id)}/complete`, {
        method: "POST",
        headers: await authJsonHeaders(),
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error("Could not complete promise");
      const next = await requestBrief();
      if (next) setBrief(next);
    } catch {
      window.alert("I could not update that promise. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mb-3 overflow-hidden rounded-[18px] border border-ink-10 bg-paper shadow-card">
      <div className="flex items-center justify-between px-3.5 pt-3 pb-2">
        <div>
          <div className="text-[9px] font-extrabold tracking-[1.2px] text-indigo">BO&apos;S BRIEF</div>
          <div className="text-[13px] font-bold">What we know. What we need.</div>
        </div>
        <div className="rounded-full px-2 py-1 text-[9px] font-bold text-teal-deep" style={{ background: "rgba(58,142,104,0.12)" }}>LIVE</div>
      </div>
      <div className="border-t border-ink-10 px-3.5 py-2.5">
        <div className="text-[9px] font-bold tracking-[0.8px] text-ink-40">KNOWN</div>
        {brief.known.length ? brief.known.map((fact, index) => (
          <div key={`${fact.source}-${index}`} className="mt-1.5 flex gap-2 text-[11px] leading-[1.4]">
            <span className={fact.fresh ? "text-teal-deep" : "text-bred"}>{fact.fresh ? "●" : "○"}</span>
            <span className="flex-1">{fact.text}</span>
            <span className="shrink-0 text-[9px] text-ink-40">{fact.source}</span>
          </div>
        )) : <div className="mt-1 text-[11px] text-ink-60">No saved customer evidence yet.</div>}
      </div>
      <div className="grid grid-cols-2 border-t border-ink-10">
        <div className="p-3 border-r border-ink-10">
          <div className="text-[9px] font-bold tracking-[0.8px] text-ink-40">MISSING</div>
          <p className="mt-1 text-[11px] leading-[1.4] text-ink-60">{brief.missing}</p>
        </div>
        <div className="bg-yellow/20 p-3">
          <div className="text-[9px] font-bold tracking-[0.8px] text-ink-40">NEXT MOVE</div>
          <p className="mt-1 text-[11px] font-semibold leading-[1.4]">{brief.nextMove}</p>
        </div>
      </div>
      {brief.commitment && (
        <div className="flex items-center gap-3 border-t border-ink-10 px-3.5 py-2.5">
          <div className="min-w-0 flex-1">
            <div className="text-[9px] font-bold tracking-[0.8px] text-ink-40">OPEN PROMISE</div>
            <div className="truncate text-[11px] font-bold">{brief.commitment.title}</div>
            <div className="text-[9px] text-ink-40">Due {new Date(brief.commitment.due_at).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })}</div>
          </div>
          <button type="button" onClick={complete} disabled={busy} className="rounded-full bg-ink px-3 py-2 text-[10px] font-bold text-cream disabled:opacity-40">
            {busy ? "Saving…" : "Mark done"}
          </button>
        </div>
      )}
    </section>
  );
}
