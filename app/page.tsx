import Link from "next/link";
import Image from "next/image";
import { BoMascot } from "@/components/bo";
import { LandingMessageHero } from "@/components/landing-message-hero";
import { messagingConfigured } from "@/lib/messaging/crypto";

const CTA = "Start with Bo";

const TRUST = [
  ["One payment", "$49 once. Nothing renews."],
  ["Restart", "Begin again with a new idea."],
  ["Your content", "Delete it permanently anytime."],
  ["Your inbox", "Turn journey emails off anytime."],
] as const;

export default function Landing() {
  const imessagePilotReady = messagingConfigured();
  return (
    <div className="landing-site min-h-dvh bg-peach text-ink">
      <nav className="border-b border-ink-10">
        <div className="mx-auto flex w-full max-w-[1240px] items-center justify-between px-5 py-4 sm:px-8 lg:px-10">
          <Link href="/" className="flex items-center gap-2.5 text-ink no-underline">
            <BoMascot state="idle" size={38} className="bo-float" />
            <span className="badger-display text-[14px] font-extrabold tracking-[1.2px] sm:text-[15px]">BADGER AI</span>
          </Link>
          <div className="flex items-center gap-5">
            <div className="hidden items-center gap-6 text-[13px] font-semibold text-ink-60 md:flex">
              <Link href="#price" className="text-inherit no-underline hover:text-ink">Price</Link>
            </div>
            <Link href="/start" className="spring rounded-full bg-ink px-4 py-3 text-[12px] font-extrabold text-cream no-underline shadow-[0_5px_0_rgba(0,0,0,.2)] sm:px-5 sm:text-[13px]">
              Start with Bo
            </Link>
          </div>
        </div>
      </nav>

      <header className="mx-auto grid w-full max-w-[1240px] grid-cols-1 items-center gap-8 px-5 pb-14 pt-7 sm:px-8 sm:pt-10 lg:grid-cols-[minmax(0,0.96fr)_minmax(440px,1.04fr)] lg:gap-14 lg:px-10 lg:py-16 xl:gap-20 xl:py-20">
        <div className="anim-rise lg:pr-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-ink-10 bg-paper px-3 py-1.5 text-[10px] font-bold tracking-[.5px] text-ink-60 sm:text-[11px]">
            <span className="h-2 w-2 rounded-full bg-teal anim-pulse-soft" /> BO LIVES IN YOUR MESSAGES
          </div>
          <div className="hero-bo-headline relative mt-5">
            <Image src="/brand/bo-peek-v1.webp" alt="" width={1254} height={1254} priority className="hero-bo-holder" />
            <h1 className="relative z-[1] text-[46px] font-extrabold leading-[0.94] tracking-[-2.1px] [text-wrap:balance] sm:text-[60px] sm:tracking-[-3px] lg:text-[68px] xl:text-[76px]">
              Your AI co-founder, right in your messages.
            </h1>
          </div>
          <p className="mt-5 max-w-[630px] text-[17px] leading-[1.5] text-ink-60 sm:text-[19px]">
            Bo turns your idea into a 28-day plan, texts you what to do today, helps when you&apos;re stuck and checks back until it&apos;s done.
          </p>
          <div className="mt-7 flex flex-col items-stretch gap-2.5 sm:items-start">
            <Link href="/start" className="landing-primary-cta spring rounded-[15px] bg-yellow px-8 py-[18px] text-center text-[15px] font-extrabold text-ink no-underline min-[360px]:text-[17px] sm:min-w-[285px]">
              {CTA}
            </Link>
            <div className="text-[11.5px] font-semibold leading-[1.4] text-ink-60 sm:text-[12.5px]">
              See your plan and Day 1 before creating an account · Full access is $49 once
            </div>
          </div>
          {imessagePilotReady && <div className="mt-6 flex flex-wrap gap-x-3 gap-y-1 text-[10.5px] font-bold text-ink-40"><span>iPhone pilot live</span><span aria-hidden="true">·</span><span>WhatsApp + Telegram coming soon</span></div>}
        </div>
        <div className="anim-rise d2 relative lg:order-last">
          <LandingMessageHero />
        </div>
      </header>


      <section id="price" className="mx-auto w-full max-w-[1120px] px-5 py-12 sm:px-8 lg:px-10 lg:py-16">
        <div className="grid grid-cols-1 gap-8 rounded-[28px] bg-cobalt-grad p-7 text-white shadow-glass sm:p-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:gap-12 lg:p-12">
          <div>
            <div className="text-[10px] font-bold tracking-[1.8px] text-acid">THE COMPLETE 28-DAY JOURNEY</div>
            <div className="mt-4 font-serif text-[58px] font-semibold leading-none tracking-[-2px]">$49</div>
            <h2 className="mt-2 text-[27px] font-extrabold leading-[1.05] tracking-[-.8px]">One payment. Nothing renews.</h2>
            <p className="mt-4 max-w-[480px] text-[14px] leading-[1.5] text-white/70">Your personalised plan, every daily task, Bo’s practical help, progress and accountability for all 28 days.{imessagePilotReady ? " iPhone founders can join the iMessage pilot while spaces remain." : ""}</p>
            <Link href="/terms" className="mt-4 inline-block text-[11px] font-bold text-white/60 underline underline-offset-3">See refund conditions</Link>
          </div>
          <div className="rounded-[22px] bg-white p-5 text-ink sm:p-6">
            <div className="grid gap-2 sm:grid-cols-2">
              {TRUST.map(([title, body]) => (
                <div key={title} className="rounded-[14px] bg-cream-warm p-3.5">
                  <div className="text-[12.5px] font-extrabold">✓ {title}</div>
                  <div className="mt-1 text-[11.5px] leading-[1.4] text-ink-60">{body}</div>
                </div>
              ))}
            </div>
            <Link href="/start" className="landing-primary-cta spring mt-5 block rounded-[14px] bg-yellow px-5 py-[18px] text-center text-[15px] font-extrabold text-ink no-underline min-[360px]:text-[17px]">
              {CTA}
            </Link>
            <div className="mt-2.5 text-center text-[10.5px] text-ink-40">See the plan first. Creating it does not charge you.</div>
          </div>
        </div>
      </section>

      <section className="bg-yellow px-5 py-12 sm:px-8 lg:py-16">
        <div className="mx-auto max-w-[850px] text-center">
          <BoMascot state="celebrating" size={105} className="mx-auto bo-celebrate" />
          <h2 className="mt-4 font-serif text-[38px] font-semibold leading-[1.02] tracking-[-1.5px] sm:text-[50px]">Your idea has waited long enough.</h2>
          <p className="mx-auto mt-3 max-w-[600px] text-[15px] leading-[1.5] text-ink-60">Give it one honest move a day and know what it is worth by Day 28.</p>
          <Link href="/start" className="landing-dark-cta spring mt-6 inline-block rounded-[15px] bg-ink px-8 py-[18px] text-[15px] font-extrabold text-cream no-underline min-[360px]:text-[17px]">{CTA}</Link>
        </div>
      </section>

      <footer className="bg-ink px-5 py-8 text-cream sm:px-8">
        <div className="mx-auto grid max-w-[1120px] grid-cols-1 items-center gap-4 text-center text-[12px] text-white/45 sm:grid-cols-[1fr_auto_1fr] sm:text-left">
          <span>Badger AI</span>
          <div className="flex justify-center gap-4">
            <Link href="/method" className="text-inherit no-underline">Method</Link>
            <Link href="/privacy" className="text-inherit no-underline">Privacy</Link>
            <Link href="/terms" className="text-inherit no-underline">Terms</Link>
            <Link href="/auth?mode=signin" className="text-inherit no-underline">Sign in</Link>
          </div>
          <span className="sm:justify-self-end">One idea · 28 days</span>
        </div>
        {imessagePilotReady && <p className="mx-auto mt-5 max-w-[1120px] text-center text-[9.5px] leading-[1.45] text-white/28">iMessage is a trademark of Apple Inc., registered in the U.S. and other countries and regions. Badger AI is not affiliated with or endorsed by Apple.</p>}
      </footer>
    </div>
  );
}
