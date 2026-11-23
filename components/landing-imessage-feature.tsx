import Link from "next/link";
import { BrandBo } from "./brand-bo";

export function LandingIMessageFeature() {
  return (
    <section className="border-y border-ink-10 bg-cream-warm px-5 py-14 sm:px-8 lg:py-18">
      <div className="mx-auto grid max-w-[1120px] gap-8 lg:grid-cols-[0.92fr_1.08fr] lg:items-center lg:gap-14">
        <div className="order-2 lg:order-1">
          <div className="inline-flex items-center gap-2 rounded-full bg-[#DDE6FA] px-3 py-1.5 text-[10px] font-extrabold tracking-[.8px] text-[#23457B]">
            NEW · 10-PERSON IPHONE PILOT
          </div>
          <h2 className="mt-4 text-[38px] font-extrabold leading-[0.98] tracking-[-1.8px] sm:text-[48px]">
            Bo lives where you already reply.
          </h2>
          <p className="mt-4 max-w-[560px] text-[15px] leading-[1.55] text-ink-60 sm:text-[17px]">
            Talk to Bo in iMessage. He brings your current task, plan and evidence into every reply. Badger stays the home for the plan, proof and progress.
          </p>
          <div className="mt-5 grid gap-2 text-[12px] font-semibold sm:grid-cols-3">
            <div className="rounded-[13px] bg-paper px-3 py-3">✓ You text first</div>
            <div className="rounded-[13px] bg-paper px-3 py-3">✓ Max two nudges a day</div>
            <div className="rounded-[13px] bg-paper px-3 py-3">✓ STOP anytime</div>
          </div>
          <div className="mt-3 text-[11.5px] font-semibold text-ink-40">Not on iPhone? WhatsApp and Telegram are coming soon.</div>
          <Link href="/start" className="spring mt-6 inline-block rounded-[15px] bg-ink px-7 py-4 text-[13px] font-bold text-cream no-underline min-[360px]:text-[15px]">
            Build my plan and meet Bo →
          </Link>
        </div>

        <div className="order-1 mx-auto w-full max-w-[480px] lg:order-2">
          <div className="overflow-hidden rounded-[34px] border-[7px] border-ink bg-[#F2F2F7] shadow-glass">
            <div className="flex items-center justify-between bg-[#FAFAFC]/95 px-5 pb-3 pt-4">
              <span className="text-[11px] font-bold">9:41</span>
              <div className="flex flex-col items-center">
                <BrandBo pose="peek" size={46} alt="Bo" className="-my-2" />
                <span className="mt-1 text-[10px] font-semibold">Bo ›</span>
              </div>
              <span className="text-[15px] text-[#007AFF]">ⓘ</span>
            </div>
            <div className="space-y-3 px-4 py-5 text-[13px] leading-[1.38]">
              <div className="max-w-[82%] rounded-[18px] rounded-bl-[5px] bg-[#E5E5EA] px-3.5 py-2.5 text-black">
                Your Day 3 task: send the current offer to one founder. 20 minutes.
              </div>
              <div className="ml-auto max-w-[76%] rounded-[18px] rounded-br-[5px] bg-[#0B84FE] px-3.5 py-2.5 text-white">
                I’ve rewritten it six times.
              </div>
              <div className="max-w-[88%] rounded-[18px] rounded-bl-[5px] bg-[#E5E5EA] px-3.5 py-2.5 text-black">
                You’re not improving it now. You’re delaying the moment someone can say no. Send the current version to one person. Reply SENT when reality has a vote.
              </div>
            </div>
            <div className="mx-4 mb-4 flex items-center rounded-full border border-black/15 bg-white px-3 py-2.5 text-[12px] text-black/35">
              iMessage <span className="ml-auto grid h-7 w-7 place-items-center rounded-full bg-[#34C759] text-[13px] text-white">↑</span>
            </div>
          </div>
          <div className="mt-3 text-center text-[10.5px] text-ink-40">Real coaching thread · actions and payment stay protected in Badger</div>
        </div>
      </div>
    </section>
  );
}
