import type { Metadata } from "next";
import Link from "next/link";
import { BoMascot } from "@/components/bo";
import { BoScene } from "@/components/scenes";

export const metadata: Metadata = {
  title: "Research behind Badger AI",
  description:
    "The research that informs Badger AI, how it appears in the product, and what has not yet been proven.",
};

const EVIDENCE = [
  {
    number: "01",
    title: "Plan when you will act",
    finding:
      "A meta-analysis of 94 independent tests found that specific if-then plans had a medium-to-large positive effect on reaching goals.",
    product:
      "Before a task, Badger AI asks when you will do it. Bo turns that answer into a specific commitment instead of leaving the task as a vague intention.",
    source: "Gollwitzer & Sheeran, 2006",
    detail: "Implementation intentions and goal achievement",
    href: "https://doi.org/10.1016/S0065-2601(06)38002-1",
  },
  {
    number: "02",
    title: "Use real deadlines",
    finding:
      "In controlled studies, deadlines helped people reduce procrastination. Self-set deadlines helped, while well-spaced external deadlines produced better performance in the study tasks.",
    product:
      "The programme has a fixed Day 14 decision and Day 28 outcome. Bo brings attention back to the next small step instead of allowing the idea to stay open forever.",
    source: "Ariely & Wertenbroch, 2002",
    detail: "Procrastination, deadlines, and performance",
    href: "https://pubmed.ncbi.nlm.nih.gov/12009041/",
  },
  {
    number: "03",
    title: "Record progress",
    finding:
      "A meta-analysis of 138 randomized studies found that interventions which increased progress monitoring also improved goal attainment. Recorded progress showed stronger effects.",
    product:
      "Every completed task leaves a short record: what you did, what you learned and any proof. Bo uses those records at checkpoints instead of relying on motivation or memory.",
    source: "Harkin et al., 2016",
    detail: "Does monitoring goal progress promote goal attainment?",
    href: "https://doi.org/10.1037/bul0000025",
  },
  {
    number: "04",
    title: "Make restarting normal",
    finding:
      "Three field studies found that people were more likely to begin goal-related activity after meaningful time markers such as a new week, month or year.",
    product:
      "Badger AI uses named weeks, recovery prompts and a weekly shield. Missing a day creates a clear restart, not a message designed to make you feel guilty.",
    source: "Dai, Milkman & Riis, 2014",
    detail: "The fresh start effect",
    href: "https://doi.org/10.1287/mnsc.2014.1901",
  },
] as const;

export default function MethodPage() {
  return (
    <div className="min-h-dvh bg-peach text-ink">
      <nav className="mx-auto flex w-full max-w-[1080px] items-center justify-between px-5 py-5 sm:px-8">
        <Link href="/" className="flex items-center gap-2.5 no-underline text-ink">
          <BoMascot state="glasses-on" size={36} />
          <span className="text-[14px] font-bold tracking-[1.7px] sm:text-[15px]">BADGER AI</span>
        </Link>
        <Link href="/start" className="rounded-xl bg-ink px-4 py-3 text-[13px] font-bold text-cream no-underline sm:text-[14px]">
          Start building
        </Link>
      </nav>

      <header className="mx-auto max-w-[820px] px-5 pb-12 pt-12 text-center sm:px-8 sm:pt-16">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-paper px-3 py-1.5 text-[11px] font-bold tracking-[1.4px] text-ink-60 shadow-card">
          RESEARCH BEHIND BADGER AI
        </div>
        <h1 className="m-0 font-serif text-[40px] font-semibold leading-[1.02] tracking-[-1.5px] [text-wrap:balance] sm:text-[54px]">
          Research-informed. <span className="rounded-lg bg-yellow px-2">Not research-proven.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-[650px] text-[16px] leading-[1.6] text-ink-60 sm:text-[18px]">
          We use established behavioral research to design how Bo helps you start, follow through,
          record progress and restart. The studies support those individual choices. They do not
          prove that our complete 28-day programme will create a paying customer.
        </p>
      </header>

      <main className="mx-auto w-full max-w-[980px] px-5 pb-16 sm:px-8">
        <section className="grid gap-4 md:grid-cols-2">
          {EVIDENCE.map((item) => (
            <article key={item.number} className="flex flex-col rounded-[22px] bg-paper p-6 shadow-card sm:p-7">
              <div className="font-mono text-[11px] font-bold text-indigo">{item.number}</div>
              <h2 className="mt-5 text-[22px] font-bold tracking-[-0.5px]">{item.title}</h2>

              <div className="mt-5">
                <div className="text-[10px] font-extrabold tracking-[1.3px] text-ink-40">WHAT THE RESEARCH FOUND</div>
                <p className="mt-2 text-[14px] leading-[1.6] text-ink-60">{item.finding}</p>
              </div>

              <div className="mt-4 rounded-[15px] bg-cream-warm p-4">
                <div className="text-[10px] font-extrabold tracking-[1.3px] text-ink-40">HOW IT APPEARS IN BADGER AI</div>
                <p className="mt-2 text-[13.5px] leading-[1.55]">{item.product}</p>
              </div>

              <a
                href={item.href}
                target="_blank"
                rel="noreferrer"
                className="mt-5 text-[12px] font-bold leading-[1.45] text-ink underline decoration-ink-20 underline-offset-4"
              >
                {item.source} · {item.detail} ↗
              </a>
            </article>
          ))}
        </section>

        <section className="mt-5 rounded-[26px] bg-ink p-7 text-cream sm:p-10">
          <div className="grid items-center gap-7 md:grid-cols-[0.7fr_1.3fr]">
            <BoScene scene="research" size={170} className="mx-auto" />
            <div>
              <div className="text-[10px] font-bold tracking-[1.5px] text-yellow">WHAT WE DO NOT CLAIM</div>
              <h2 className="mt-3 text-[28px] font-bold leading-[1.05] tracking-[-0.8px] sm:text-[34px]">
                The full programme still needs its own evidence.
              </h2>
              <p className="mt-4 text-[14px] leading-[1.65] text-white/65 sm:text-[15px]">
                No independent study has tested Badger AI, Bo or this exact 28-day sequence. We
                should not borrow the credibility of these papers and pretend they prove our
                customer outcome. We will measure completed tasks, recorded evidence, programme
                completion and paying-customer outcomes, then publish grouped results as the data
                becomes reliable.
              </p>
            </div>
          </div>
        </section>

        <section className="mt-5 rounded-[26px] bg-yellow p-7 text-center sm:p-10">
          <BoMascot state="fired-up" size={92} className="mx-auto bo-float" />
          <h2 className="mt-4 text-[28px] font-bold tracking-[-0.7px]">Evidence informs the system. Your work tests the idea.</h2>
          <p className="mx-auto mt-3 max-w-[560px] text-[14px] leading-[1.6] text-ink-60">
            Bo keeps the research practical: one clear commitment, one small task and one honest record at a time.
          </p>
          <Link href="/start" className="mt-6 inline-block rounded-[14px] bg-ink px-8 py-4 text-[15px] font-bold text-cream no-underline">
            Start with Bo →
          </Link>
        </section>
      </main>

      <footer className="mx-auto max-w-[1080px] px-6 py-8 text-center text-[12px] text-ink-40">
        BADGER AI · research, sources and limits
      </footer>
    </div>
  );
}
