"use client";

import { useEffect, useState } from "react";
import { BrandBo } from "./brand-bo";

interface Pattern {
  taskType: string;
  total: number;
  rate: number;
}

const LABELS: Record<string, string> = {
  outreach: "personal outreach",
  validate: "customer conversations",
  build: "small building steps",
  sell: "clear payment asks",
  call: "short check-ins",
  reflection: "written reflections",
};

export function CommunityKnowledge() {
  const [pattern, setPattern] = useState<Pattern | null>(null);

  useEffect(() => {
    fetch("/api/learn")
      .then((response) => response.json())
      .then((data) => setPattern(Array.isArray(data.patterns) ? data.patterns[0] ?? null : null))
      .catch(() => undefined);
  }, []);

  return (
    <div className="rounded-[18px] bg-teal-deep p-4 text-white anim-rise">
      <div className="flex items-start gap-3">
        <BrandBo pose="peek" size={58} alt="Bo" className="-my-2" />
        <div className="min-w-0 flex-1">
          <div className="text-[9.5px] font-extrabold tracking-[1.2px] text-acid">BO LEARNS WITH THE COMMUNITY</div>
          <div className="mt-1 text-[14px] font-bold leading-[1.35]">
            {pattern
              ? `${LABELS[pattern.taskType] ?? pattern.taskType} are helping builders make real progress.`
              : "Every anonymous outcome helps Bo notice what works."}
          </div>
          <p className="mt-1.5 text-[11.5px] leading-[1.45] text-white/70">
            Bo shares useful grouped patterns, like a coach learning across a team. Your idea,
            identity and private chats are never shown to anyone else.
          </p>
        </div>
      </div>
    </div>
  );
}
