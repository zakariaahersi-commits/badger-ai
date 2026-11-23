// Privacy — plain-language and honest, like everything else Byqqa says.

import Link from "next/link";
import { BoMascot } from "@/components/bo";

export const metadata = {
  title: "Privacy — Badger AI",
  description: "What Badger AI collects, where it goes, and what we'll never do with it. In plain words.",
};

const SECTIONS: [string, string][] = [
  [
    "What we collect",
    "Your email address, onboarding answers (your idea, what you're good at, what annoys you, your fear and your goal), daily task logs, proof links and chats with Bo. We also record basic in-product events such as pages opened, onboarding completed and tasks finished, plus technical error details when a screen fails. If you enable browser notifications, we store the encrypted device subscription your browser creates. If you join the optional iMessage pilot, we store an encrypted phone number, a protected channel identifier, your consent and message timing; the conversation itself is saved with your Badger journey so Bo can listen across turns. No advertising trackers follow you around the internet.",
  ],
  [
    "Where your data lives",
    "Your device keeps a local copy so the app feels fast. Your account, purchase access, sprint and first-party product events sync to our database (Supabase). Our site runs on Vercel, which keeps standard server logs. Stripe handles payment details; we store only the identifiers needed to confirm access and refunds.",
  ],
  [
    "Product analytics and attribution",
    "Layers helps us understand whether founders reach their plan, use Bo and complete real work. It receives page and event names, a pseudonymous device and session identifier, basic browser context, referral and campaign parameters, and—after sign-in—your Badger user ID, signup date, login provider and one-time access tier. A verified purchase includes the product, amount, currency and Stripe transaction identifier so it is counted once. Advertising storage and personalized advertising are disabled, session replay is not enabled, and we do not send your idea or Bo conversation to Layers.",
  ],
  [
    "The AI part, honestly",
    "Bo's brain runs on DeepSeek, an AI provider. When you chat with Bo or generate your plan, the text you wrote (your answers, logs, and messages) is sent to DeepSeek's API to produce the response. Our private operations agents can also send limited product activity, error reports and a pseudonymous account reference to DeepSeek to spot reliability problems or prepare relevant journey support. We don't send your email address with it. If an engineering worker is enabled, it receives a bounded technical brief and verified error evidence, not your chat or idea text. If you're not comfortable with that, don't use Badger AI — we'd rather tell you straight than bury it in legalese.",
  ],
  [
    "The optional iMessage pilot",
    "For iPhone testers, our configured messaging provider (Linq or Sendblue) carries messages between Apple's iMessage network and Badger. You must text START first; Badger checks a short-lived code and your current paid or tester access before linking the number, and checks that access again before later coaching. The provider receives the phone number and message content needed to route and deliver the conversation, while Badger sends the coaching text to the same DeepSeek-powered Bo used in the app. We encrypt phone numbers and queued webhook content before database storage, discard the raw queued message after processing, and retain only bounded delivery and engagement facts for the pilot. Text PAUSE to stop proactive messages or STOP to opt out immediately. After STOP, reconnecting requires a new code from Badger. Actions such as sending email, publishing, changing the plan or handling payment still require an authenticated approval in Badger.",
  ],
  [
    "What we learn across founders",
    "We record anonymized outcome signals — for example \"an outreach task on day 3 preceded real progress\" — with no name, email, idea text or chat attached. Bo only shares grouped patterns after there is a useful sample. This makes the coaching better for everyone without exposing anyone's work.",
  ],
  [
    "What we will never do",
    "Sell your data. Show you ads. Use your idea for anything except coaching you. Publish your idea, message, result, name, testimonial or story as social content without your specific permission. Your idea is yours — full stop.",
  ],
  [
    "Emails and phone reminders",
    "If you opt in, Bo can send journey, checkout or daily reminder emails and browser notifications. Creating an account alone does not opt you in. Choosing a reminder time or enabling journey emails does. An iMessage pilot participant receives at most one scheduled morning task and one follow-up only when they have not replied, within their chosen hours. A private AI operations agent may prepare or send a journey-support email when product activity suggests a paid founder is stuck; it can only target an opted-in paid account, uses a strict daily cap and includes an unsubscribe link. If you save a journey and leave at the payment decision, Badger may send one journey-ready reminder only when journey emails are enabled. Opening Stripe Checkout can trigger up to two checkout reminders under the same consent; all recovery stops after payment or opt-out. We record whether operational emails were sent, delivered, opened or clicked so we can see whether reminders are useful. Email opens are approximate because some inbox privacy tools load images automatically. Turning browser notifications off removes the device subscription; expired subscriptions are removed automatically.",
  ],
  [
    "Deleting your data",
    "\"Restart my journey\" erases your current plan, progress, chats and evidence while keeping your account and payment status. \"Delete my account and content\" removes your account data, uploaded avatar and saved payment identifiers. You can also opt out of journey emails. These controls are available directly from Settings without emailing us.",
  ],
  [
    "Your rights (GDPR)",
    "Contact your instance operator to request a copy, correction, or deletion of your data.",
  ],
  [
    "Contact",
    "Contact your instance operator to ask a question or request deletion.",
  ],
];

export default function PrivacyPage() {
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
        <div className="text-[12px] font-bold tracking-[2px] text-ink-40 mb-3">PRIVACY</div>
        <h1 className="font-serif text-[36px] md:text-[44px] font-semibold tracking-[-1px] leading-[1.05] m-0">
          Your idea is yours. So is your data.
        </h1>
        <p className="mt-4 text-[16px] leading-[1.55] text-ink-60">
          The short version: we collect only what Bo needs to coach you, we tell you exactly where
          it goes, and we never sell it. The slightly longer version is below, in plain words.
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
          Last updated August 2026. If we change how we handle your data, we&apos;ll update this page and
          say so plainly. See also our <Link href="/terms" className="text-ink-60 underline">terms</Link>.
        </p>
      </main>
    </div>
  );
}
