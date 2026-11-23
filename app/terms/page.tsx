// Terms — short, honest, readable. The deal, in plain words.

import Link from "next/link";
import { BoMascot } from "@/components/bo";

export const metadata = {
  title: "Terms — Badger AI",
  description: "The deal between you and Badger AI, in plain words.",
};

const SECTIONS: [string, string][] = [
  [
    "What Badger AI is",
    "Badger AI is an AI co-founder (Bo) that coaches you through one 28-day programme toward a launch and your first paying customer. Bo gives you one task a day, checks your proof, and pushes you when you stall.",
  ],
  [
    "What Bo is not",
    "Bo is an AI coach, not a lawyer, accountant, or financial advisor. His advice is startup coaching, not professional advice. You make the decisions and own the outcomes — the company you're building is 100% yours, including everything you create during the sprint.",
  ],
  [
    "No guaranteed outcome",
    "We'll push you toward a launch and your first paying customer. Nobody can guarantee a customer because that depends on your idea, your market, and whether you do the work. What we promise is daily coaching, practical help, clear checkpoints, and an honest verdict.",
  ],
  [
    "The refund promise",
    "You qualify for a full refund of the original $49 when all four conditions are met: you complete the Day 1 through Day 28 programme and save the required task or checkpoint log for every day; a real customer pays for your product or service during those 28 days; you provide reasonable payment evidence such as a Stripe receipt, paid invoice, or payment confirmation; and you email us within 14 days after Day 28. We return the $49 to the original payment method. One refund is available per paid account. We may reject altered, duplicate, or unrelated evidence.",
  ],
  [
    "Fair use",
    "Don't abuse the AI endpoints, scrape the service, use Badger AI for anything illegal, or use it to harm others. We rate-limit heavy use to keep the service fast and affordable for everyone. Accounts that abuse the service can be closed.",
  ],
  [
    "Payment",
    "Badger AI costs $49 once for the complete 28-day programme. Stripe charges the payment during checkout and access starts immediately after it confirms the payment. This is not a subscription, it does not renew, and there are no recurring charges—so there is nothing to cancel later. Leaving checkout without completing payment creates no charge. We never see or store your full card details.",
  ],
  [
    "Liability, plainly",
    "We provide Badger AI as-is. We work hard to keep it running and honest, but we're not liable for business losses, missed opportunities, or decisions you make based on Bo's coaching. Our total liability is capped at what you paid us.",
  ],
  [
    "Changes",
    "If we change these terms in a way that matters, we'll update this page and say so plainly. Continuing to use Badger AI after that means you accept the new terms.",
  ],
  [
    "The legal frame",
    "Contact your instance operator for questions about these terms.",
  ],
];

export default function TermsPage() {
  return (
    <div className="min-h-dvh bg-peach text-ink">
      <nav className="max-w-[760px] mx-auto px-6 py-5 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5 no-underline text-ink">
          <BoMascot state="idle" size={36} />
          <span className="text-[15px] font-bold tracking-[1.7px]">BADGER AI</span>
        </Link>
        <Link href="/start" className="px-4 py-2.5 rounded-xl bg-ink text-cream text-[14px] font-bold no-underline">
          Start the 28 days
        </Link>
      </nav>
      <main className="max-w-[680px] mx-auto px-6 pt-8 pb-20">
        <div className="text-[12px] font-bold tracking-[2px] text-ink-40 mb-3">TERMS</div>
        <h1 className="font-serif text-[36px] md:text-[44px] font-semibold tracking-[-1px] leading-[1.05] m-0">
          The deal, in plain words.
        </h1>
        <p className="mt-4 text-[16px] leading-[1.55] text-ink-60">
          No 40-page wall of legalese. Here&apos;s what you&apos;re agreeing to when you use Badger AI.
        </p>
        <div className="mt-10 flex flex-col gap-8">
          {SECTIONS.map(([title, body]) => (
            <section key={title}>
              <h2 className="text-[19px] font-bold tracking-[-0.3px] m-0">{title}</h2>
              <p className="mt-2 text-[15px] leading-[1.6] text-ink-60 m-0">{body}</p>
            </section>
          ))}
        </div>
        <p className="mt-12 text-[13px] text-ink-40">
          Last updated August 2026. See also our <Link href="/privacy" className="text-ink-60 underline">privacy page</Link>.
        </p>
      </main>
    </div>
  );
}
