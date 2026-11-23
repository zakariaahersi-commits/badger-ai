"use client";

// The checkpoint — Day 14 kill-or-commit, Day 28 ship-or-kill, and the
// gate-triggered kill flow. Binary outcomes, permanently logged, both celebrated.

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BrandBo } from "@/components/brand-bo";
import { Pill, PrimaryButton } from "@/components/ui";
import { ShareCardModal } from "@/components/sharecard";
import { currentDayOf, useBygga } from "@/lib/store";
import { cloudEnabled, publishCloudPost } from "@/lib/feed";
import { authJsonHeaders } from "@/lib/cloud";
import { playMoment } from "@/lib/feedback";

export default function OutcomePage() {
  return (
    <Suspense>
      <OutcomeInner />
    </Suspense>
  );
}

function OutcomeInner() {
  const router = useRouter();
  const params = useSearchParams();
  const s = useBygga();
  const day = currentDayOf(s);
  const isDay14 = Number(params.get("day")) === 14 || (day <= 14 && params.get("mode") !== "kill" && day >= 14);
  const forceKill = params.get("mode") === "kill";
  const [phase, setPhase] = useState<"decide" | "kill-form" | "killed" | "shipped">(
    forceKill ? "kill-form" : "decide"
  );
  const [l1, setL1] = useState("");
  const [l2, setL2] = useState("");
  const [l3, setL3] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [nominated, setNominated] = useState(false);

  const stats = useMemo(() => {
    const logged = Object.values(s.logs);
    return {
      showed: logged.length,
      proofs: logged.filter((l) => l.proof?.trim()).length,
      outreach: logged.filter((l) => /dm|message|sent|email|call|ask|post/i.test(l.did)).length,
      asks: logged.filter((l) => /pay|price|\$|charge/i.test(l.did + l.learned)).length,
    };
  }, [s.logs]);

  if (!s.profile) return null;
  const name = s.profile.name;

  if (phase === "killed") {
    return (
      <div className="px-6 pt-10 pb-8 flex flex-col items-center text-center gap-6 min-h-[80dvh] justify-center">
        <div className="relative grid h-[210px] w-[210px] place-items-center overflow-hidden rounded-[38px] bg-cobalt-grad shadow-glass anim-pop">
          <span className="absolute h-36 w-36 rounded-full border border-white/20 bg-white/10" aria-hidden="true" />
          <BrandBo pose="celebrate" size={200} alt="Bo celebrating your decision" className="relative z-10 translate-y-3" />
        </div>
        <div>
          <Pill bg="rgba(239,68,68,0.12)" color="var(--bygga-red)">
            🪦 Killed smart · permanent
          </Pill>
          <h1 className="font-serif text-[34px] font-semibold tracking-[-0.8px] mt-4 leading-[1.05]">
            Killing fast is a skill, {name}.
          </h1>
          <p className="mt-3 text-[15px] text-ink-60 leading-[1.5] max-w-[300px] mx-auto">
            You just saved yourself two years of wondering. You showed up {stats.showed} days,
            logged {stats.outreach} real outreach moves, and got an honest answer. Most people never
            get one.
          </p>
        </div>
        <div className="w-full bg-paper border border-ink-10 rounded-[14px] p-4 text-left">
          <div className="text-[10px] font-bold tracking-[1px] text-ink-60 mb-2">YOUR DEBRIEF · SAVED TO PROFILE</div>
          {[l1, l2, l3].filter(Boolean).map((l, i) => (
            <div key={i} className="text-[13px] leading-[1.4] mb-1.5">
              · {l}
            </div>
          ))}
        </div>
        <div className="w-full flex flex-col gap-2.5">
          <PrimaryButton onClick={() => setShareOpen(true)}>Share my launch receipt</PrimaryButton>
          <button
            type="button"
            disabled={nominated}
            onClick={() => {
              const body = `Kill Day. I closed "${s.profile?.ideaShort}" after ${stats.showed} days and ${stats.outreach} real conversations. Lesson: ${l1 || s.outcomeNote || "the evidence said no"}. On to the next one.`;
              if (cloudEnabled) publishCloudPost(body, "kill", s.profile?.name ?? "Builder", "Week 4");
              else s.addPost(body, "kill");
              setNominated(true);
              router.push("/app/community");
            }}
            className="spring p-3.5 rounded-[14px] bg-transparent border-[1.5px] border-ink-20 text-ink text-[14px] font-semibold cursor-pointer disabled:opacity-50"
          >
            {nominated ? "Posted to the cohort ✓" : "Post my kill to the cohort"}
          </button>
          <button
            type="button"
            onClick={() => {
              s.resetAll();
              router.push("/start");
            }}
            className="p-3 bg-transparent border-none text-ink-60 text-[14px] cursor-pointer"
          >
            Ready for idea #2 → new sprint
          </button>
        </div>
        {shareOpen && (
          <ShareCardModal
            kind="killed"
            name={name}
            idea={s.profile?.ideaShort ?? "my idea"}
            days={stats.showed}
            outreach={stats.outreach}
            onClose={() => setShareOpen(false)}
          />
        )}
      </div>
    );
  }

  if (phase === "shipped") {
    return (
      <div className="px-6 pt-10 pb-8 flex flex-col items-center text-center gap-6 min-h-[80dvh] justify-center">
        <div className="relative grid h-[210px] w-[210px] place-items-center overflow-hidden rounded-[38px] bg-cobalt-grad shadow-glass anim-pop">
          <span className="absolute h-36 w-36 rounded-full border border-white/20 bg-white/10" aria-hidden="true" />
          <BrandBo pose="celebrate" size={200} alt="Bo celebrating your launch" className="relative z-10 translate-y-3" />
        </div>
        <div>
          <Pill bg="var(--bygga-yellow)" color="#1A1A1A">
            🚀 Shipped · permanent
          </Pill>
          <h1 className="font-serif text-[34px] font-semibold tracking-[-0.8px] mt-4 leading-[1.05]">
            You went from idea to something real.
          </h1>
          <p className="mt-3 text-[15px] text-ink-60 leading-[1.5] max-w-[300px] mx-auto">
            Most people never do this, {name}. {stats.showed} days showed up, {stats.asks} asks for
            money, proof saved. The same Bo keeps coaching and building with you from here.
          </p>
        </div>
        <div className="w-full flex flex-col gap-2.5">
          <PrimaryButton onClick={() => setShareOpen(true)}>Share my launch receipt</PrimaryButton>
          <button type="button" onClick={() => router.push("/app/bo")} className="spring p-3.5 rounded-[14px] bg-transparent border-[1.5px] border-ink-20 text-ink text-[14px] font-semibold cursor-pointer">
            Keep building with Bo →
          </button>
          <button type="button" onClick={() => router.push("/app")} className="p-3 bg-transparent border-none text-ink-60 text-[14px] cursor-pointer">
            Back to Today
          </button>
        </div>
        {shareOpen && (
          <ShareCardModal
            kind="shipped"
            name={name}
            idea={s.profile?.ideaShort ?? "my idea"}
            days={stats.showed}
            outreach={stats.outreach}
            onClose={() => setShareOpen(false)}
          />
        )}
      </div>
    );
  }

  if (phase === "kill-form") {
    return (
      <div className="px-6 pt-6 pb-8 flex flex-col gap-4 min-h-[80dvh]">
        <div className="flex items-center gap-3">
          <BrandBo pose="peek" size={66} alt="Bo" className="bo-float" />
          <div>
            <div className="text-[11px] font-bold tracking-[1.2px] text-ink-60">KILL DAY DEBRIEF</div>
            <div className="text-[20px] font-bold tracking-[-0.4px]">What did it teach you?</div>
          </div>
        </div>
        {(
          [
            ["What the idea taught you", l1, setL1, "People liked the idea but the price point was 2.5x what they'd pay…"],
            ["What you'd do differently", l2, setL2, "Talk to buyers in week 1, not week 3…"],
            ["Would you try this again?", l3, setL3, "A cheaper version for a different audience, maybe…"],
          ] as const
        ).map(([label, val, set, ph]) => (
          <div key={label}>
            <div className="text-[11px] font-bold tracking-[0.8px] text-ink-60 mb-1.5">{label.toUpperCase()}</div>
            <textarea
              value={val}
              onChange={(e) => set(e.target.value.slice(0, 300))}
              placeholder={ph}
              rows={2}
              className="w-full px-3 py-2.5 text-[14px] leading-[1.4] border-[1.5px] border-ink-20 rounded-[10px] bg-paper resize-none outline-none focus:border-ink placeholder:text-ink-20"
            />
          </div>
        ))}
        <div className="bg-paper border border-ink-10 rounded-xl p-3.5 text-[12.5px] font-mono flex flex-col gap-1">
          {[
            ["Days you showed up", stats.showed],
            ["Tasks with proof", stats.proofs],
            ["Outreach moves", stats.outreach],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between">
              <span className="text-ink-60 font-sans">{k}</span>
              <span className="font-bold">{v}</span>
            </div>
          ))}
        </div>
        <div className="flex-1" />
        <button
          type="button"
          disabled={!l1.trim()}
          onClick={async () => {
            s.decideFinal("killed", [l1, l2, l3].filter(Boolean).join(" · "));
            playMoment(day >= 28 ? "day28" : "milestone", { haptics: s.hapticsEnabled, sound: s.soundEnabled });
            void fetch("/api/learn", { method: "POST", headers: await authJsonHeaders(), body: JSON.stringify({ track: s.profile?.track, outcome: "killed" }) }).catch(() => {});
            setPhase("killed");
          }}
          className="w-full px-5 py-[18px] rounded-[14px] border-none text-white text-[16px] font-bold cursor-pointer disabled:opacity-40"
          style={{ background: "#991B1B" }}
        >
          Log Kill Day · permanent
        </button>
      </div>
    );
  }

  // decide phase — dark checkpoint screen
  return (
    <div className="px-5 pt-5 pb-8 flex flex-col gap-3 text-cream rounded-b-none min-h-[92dvh]" style={{ background: "#1A1A1A", margin: "0 0 0 0" }}>
      <div className="pt-2">
        <div className="text-[11px] font-bold tracking-[1.4px] uppercase" style={{ color: "rgba(250,247,240,0.55)" }}>
          Day {day} of 28
        </div>
        <div className="text-[26px] font-bold tracking-[-0.5px] mt-1">
          {isDay14 ? "Kill Day." : "Ship or Kill."}
        </div>
      </div>

      <div className="rounded-2xl p-[18px]" style={{ background: "rgba(239,68,68,0.12)", border: "1.5px solid #EF4444" }}>
        <Pill bg="#EF4444" color="white">
          ⚠ {isDay14 ? "COMMIT-OR-KILL" : "MANDATORY OUTCOME"}
        </Pill>
        <div className="mt-2.5 text-[21px] font-bold leading-[1.15] tracking-[-0.5px]">
          {isDay14 ? "Two weeks in. Your numbers are honest." : "28 days. No more middle ground."}
        </div>
        <div className="mt-3.5 flex flex-col gap-1 text-[12.5px] font-mono">
          {[
            ["Days showed up", `${stats.showed} / ${day}`],
            ["Tasks with proof", String(stats.proofs)],
            ["Outreach moves", String(stats.outreach)],
            ["Asks for money", String(stats.asks)],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3">
              <span style={{ color: "rgba(250,247,240,0.6)" }}>{k}</span>
              <span className="font-bold">{v}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-start gap-2.5">
        <BrandBo pose="peek" size={60} alt="Bo" className="bo-float" />
        <div className="flex-1 rounded-xl px-3.5 py-3 text-[13px] leading-[1.45]" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}>
          <div className="text-[10px] font-bold tracking-[0.6px] mb-1" style={{ color: "rgba(250,247,240,0.5)" }}>
            BO&apos;S READ
          </div>
          {stats.showed >= day * 0.6
            ? `You showed up ${stats.showed} of ${day} days. That's a builder's pattern. The question isn't effort, it's signal: did real people lean in? Decide from the evidence, not the hope.`
            : `You showed up ${stats.showed} of ${day} days. Be honest about why. If the idea doesn't pull you to the work, that IS the data, and killing it clean beats dragging it.`}
        </div>
      </div>

      <div className="flex-1" />

      <div className="flex flex-col gap-2.5">
        <button
          type="button"
          onClick={async () => {
            if (isDay14) {
              s.decideDay14("committed");
              router.push("/app");
            } else {
              s.decideFinal("shipped", "");
              playMoment("day28", { haptics: s.hapticsEnabled, sound: s.soundEnabled });
              void fetch("/api/learn", { method: "POST", headers: await authJsonHeaders(), body: JSON.stringify({ track: s.profile?.track, outcome: "shipped" }) }).catch(() => {});
              setPhase("shipped");
            }
          }}
          className="w-full px-4 py-4 rounded-[14px] border-none bg-yellow text-ink text-[16px] font-bold cursor-pointer text-left"
        >
          {isDay14 ? "→ Commit. I see something worth pushing through." : "🚀 Ship it. This is real. Keep going."}
          <div className="text-[11px] font-medium opacity-70 mt-0.5">
            {isDay14 ? "Two more weeks. Now we sell." : "Logged to your profile. Bo stays with you."}
          </div>
        </button>
        {isDay14 && (
          <button
            type="button"
            onClick={() => {
              s.decideDay14("pivoted");
              router.push("/app");
            }}
            className="w-full px-4 py-4 rounded-[14px] text-cream text-[15px] font-bold cursor-pointer text-left bg-transparent"
            style={{ border: "1px solid rgba(255,255,255,0.2)" }}
          >
            ↻ Same problem, new angle. Reset the approach.
            <div className="text-[11px] font-medium opacity-60 mt-0.5">Keep the idea, change the price/audience/channel.</div>
          </button>
        )}
        <button
          type="button"
          onClick={() => setPhase("kill-form")}
          className="w-full px-4 py-4 rounded-[14px] border-none text-white text-[15px] font-bold cursor-pointer text-left"
          style={{ background: "#991B1B" }}
        >
          ☠ Kill it. Honest exit, celebrated.
          <div className="text-[11px] font-medium opacity-80 mt-0.5">Debrief first. The learning is the asset.</div>
        </button>
      </div>
    </div>
  );
}
