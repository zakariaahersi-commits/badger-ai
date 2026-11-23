import { BrandBo } from "@/components/brand-bo";

const WEEKS = [
  ["01", "LISTEN", "Talk to real people"],
  ["02", "DECIDE", "Choose from evidence"],
  ["03", "SELL", "Make the real ask"],
  ["04", "LAUNCH", "Finish with an answer"],
] as const;

export function LandingProductTour() {
  return (
    <section id="tour" className="mx-auto w-full max-w-[1240px] px-5 py-12 sm:px-8 lg:px-10 lg:py-16">
      <div className="grid gap-5 lg:grid-cols-[0.72fr_1.28fr] lg:items-end">
        <div>
          <div className="text-[10px] font-extrabold tracking-[1.8px] text-indigo">THE PRODUCT JOURNEY</div>
          <h2 className="mt-3 text-[38px] font-extrabold leading-[0.98] tracking-[-1.8px] sm:text-[48px]">Plan it. Do it. Prove it.</h2>
        </div>
        <p className="max-w-[650px] text-[15px] leading-[1.5] text-ink-60 sm:text-[17px] lg:justify-self-end">
          Badger turns the idea in your head into a daily founder journey. Bo helps with the work and uses real evidence to decide what comes next.
        </p>
      </div>

      <div className="mt-9 grid gap-4 lg:grid-cols-3">
        <article className="overflow-hidden rounded-[26px] border border-ink-10 bg-paper shadow-card">
          <div className="p-5 sm:p-6">
            <div className="flex items-center justify-between"><span className="text-[10px] font-extrabold tracking-[1.3px] text-indigo">01 · YOUR PLAN</span><span className="rounded-full bg-indigo/10 px-2.5 py-1 text-[9px] font-bold text-indigo">DAY 1–28</span></div>
            <h3 className="mt-3 text-[25px] font-extrabold leading-[1] tracking-[-.8px]">Know where today is taking you.</h3>
            <p className="mt-3 text-[13px] leading-[1.45] text-ink-60">Four weeks built around your idea, stage and available time.</p>
          </div>
          <div className="relative mx-3 mb-3 overflow-hidden rounded-[20px] bg-cream-warm p-3.5">
            <div className="flex flex-col gap-2">
              {WEEKS.map(([number, phase, title], index) => (
                <div key={number} className={`flex items-center gap-3 rounded-[13px] p-3 ${index === 0 ? "bg-indigo text-white" : "border border-ink-10 bg-white"}`}>
                  <span className="text-[18px] font-extrabold opacity-65">{number}</span>
                  <div className="min-w-0 flex-1"><div className="text-[8px] font-extrabold tracking-[1px] opacity-65">{phase}</div><div className="mt-0.5 text-[11.5px] font-bold">{title}</div></div>
                  <span className="text-[10px] font-bold">{index === 0 ? "NOW" : "NEXT"}</span>
                </div>
              ))}
            </div>
          </div>
        </article>

        <article className="overflow-hidden rounded-[26px] bg-ink text-cream shadow-card">
          <div className="p-5 sm:p-6">
            <div className="flex items-center justify-between"><span className="text-[10px] font-extrabold tracking-[1.3px] text-yellow">02 · TODAY&apos;S MOVE</span><span className="rounded-full bg-white/10 px-2.5 py-1 text-[9px] font-bold text-white/70">25 MIN</span></div>
            <h3 className="mt-3 text-[25px] font-extrabold leading-[1] tracking-[-.8px]">Do one useful thing—not ten vague things.</h3>
            <p className="mt-3 text-[13px] leading-[1.45] text-white/60">Bo explains the task, helps with the difficult part and shows what counts as done.</p>
          </div>
          <div className="mx-3 mb-3 rounded-[20px] bg-white p-4 text-ink">
            <div className="text-[8px] font-extrabold tracking-[1.1px] text-indigo">YOUR MOVE TODAY</div>
            <div className="mt-2 text-[19px] font-extrabold leading-[1.08]">Send the offer to three warm leads.</div>
            <div className="mt-3 rounded-[12px] bg-cream-warm p-3 text-[11px] leading-[1.4] text-ink-60"><strong className="text-ink">What counts:</strong> the message and every reply—even a no.</div>
            <div className="mt-3 flex items-end gap-2.5"><BrandBo pose="peek" size={50} alt="Bo" /><div className="rounded-[13px] rounded-bl-[4px] bg-indigo/10 p-3 text-[11px] font-semibold leading-[1.4]">I drafted the direct version in your tone. Want it?</div></div>
          </div>
        </article>

        <article className="overflow-hidden rounded-[26px] border border-ink-10 bg-yellow shadow-card">
          <div className="p-5 sm:p-6">
            <div className="flex items-center justify-between"><span className="text-[10px] font-extrabold tracking-[1.3px] text-ink-60">03 · YOUR EVIDENCE</span><span className="rounded-full bg-white/45 px-2.5 py-1 text-[9px] font-bold">REAL WORK</span></div>
            <h3 className="mt-3 text-[25px] font-extrabold leading-[1] tracking-[-.8px]">See what happened. Change the plan.</h3>
            <p className="mt-3 text-[13px] leading-[1.45] text-ink-60">Replies, proof and decisions become visible progress—not empty streaks.</p>
          </div>
          <div className="mx-3 mb-3 rounded-[20px] bg-paper p-4 text-ink">
            <div className="grid grid-cols-3 gap-2">
              {[["6", "moves"], ["4", "replies"], ["1", "offer"]].map(([value, label]) => <div key={label} className="rounded-[11px] bg-cream-warm p-2.5 text-center"><div className="text-[20px] font-extrabold">{value}</div><div className="text-[8px] font-bold uppercase tracking-[.7px] text-ink-40">{label}</div></div>)}
            </div>
            <div className="mt-3 rounded-[13px] bg-ink p-3 text-cream"><div className="text-[8px] font-extrabold tracking-[1px] text-yellow">NEW EVIDENCE</div><div className="mt-1.5 text-[12px] font-bold">“Send me the payment link.”</div><div className="mt-1 text-[9px] text-white/50">Saved to your journey ✓</div></div>
            <div className="mt-3 flex items-center gap-3"><BrandBo pose="thinking" size={50} alt="Bo reviewing the evidence" /><div className="text-[11px] font-semibold leading-[1.4]">The problem is real. Tomorrow we tighten the offer.</div></div>
          </div>
        </article>
      </div>
    </section>
  );
}
