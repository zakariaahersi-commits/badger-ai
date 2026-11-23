"use client";

// "Stuck? Find inspiration" — a calm, collapsible helper for the no-idea
// funnel. GummySearch-style: teaches first-timers exactly where to look
// (Reddit, X, their own week, AI) with copy-paste prompts. Optional, never
// in the way. Closed by default so it never adds pressure.

import { useState } from "react";
import { IconChip, IconSparkle } from "./icons";

const TIPS = [
  {
    icon: "🔎",
    title: "Listen on Reddit",
    body: "Search a topic you like on reddit.com, then read the top posts. Look for lines like \"I wish there was…\", \"why is it so hard to…\", or people paying for clumsy workarounds.",
  },
  {
    icon: "𝕏",
    title: "Search complaints on X",
    body: "On X (Twitter), search your topic plus the words \"annoying\" or \"I hate when\". Real frustration, in people's own words, is a goldmine of problems.",
  },
  {
    icon: "📝",
    title: "Watch your own week",
    body: "For two days, note every time something is slow, confusing, or makes you say \"ugh\". You live closest to your own problems. One of them is your idea.",
  },
  {
    icon: "🤖",
    title: "Ask an AI to help you notice",
    body: "Ask an AI assistant: \"I'm good at [your skill] and I care about [your topic]. List 10 small, specific problems people in that world complain about.\" Use it as a starting list, not the answer.",
  },
];

export function InspireHelper() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2.5 px-3.5 py-3 rounded-[14px] bg-cream-warm border-none cursor-pointer text-left"
      >
        <IconChip icon={IconSparkle} tint="lilac" size={32} />
        <span className="flex-1 text-[13.5px] font-semibold">Drawing a blank? Here&apos;s where to look.</span>
        <span className="text-ink-40 text-[13px]">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="mt-2 flex flex-col gap-2 anim-rise">
          {TIPS.map((t) => (
            <div key={t.title} className="bg-paper shadow-card rounded-[14px] p-3.5">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[15px]">{t.icon}</span>
                <span className="text-[13.5px] font-bold">{t.title}</span>
              </div>
              <p className="text-[12.5px] leading-[1.5] text-ink-60 m-0">{t.body}</p>
            </div>
          ))}
          <p className="text-[11.5px] text-ink-40 text-center px-4 mt-1">
            You don&apos;t need the perfect idea. You need one real problem to start with. Bo helps you sharpen it from there.
          </p>
        </div>
      )}
    </div>
  );
}
