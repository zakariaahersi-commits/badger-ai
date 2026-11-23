import { BrandBo } from "@/components/brand-bo";

export function LandingMessageHero() {
  return (
    <div className="message-hero" aria-label="Maya's iMessage conversation with Bo">
      <div className="message-hero-glow message-hero-glow-one" />
      <div className="message-hero-glow message-hero-glow-two" />

      <div className="message-hero-card">
        <div className="message-hero-header">
          <div className="message-hero-avatar">
            <BrandBo pose="peek" size={58} alt="" />
            <i aria-hidden="true" />
          </div>
          <div>
            <strong>Bo</strong>
            <span>iMessage · Maya&apos;s Day 24</span>
          </div>
          <div className="message-hero-live"><i /> iMessage</div>
        </div>

        <div className="message-hero-thread-window" aria-hidden="true">
          <div className="message-hero-thread message-hero-thread-rolling">
            <div className="message-hero-time">TODAY 09:02</div>
            <div className="message-row message-row-bo">
              <BrandBo pose="peek" size={34} alt="" />
              <p>Morning Maya 👋 You said you&apos;d launch the waitlist today. Let&apos;s keep it simple.</p>
            </div>
            <div className="message-row message-row-bo">
              <BrandBo pose="peek" size={34} alt="" />
              <p>First, change the headline. Then post the video. After lunch, call Lina, Sara and Emma. Can the headline be live by 10:30?</p>
            </div>
            <div className="message-row message-row-you">
              <p>Yes. I&apos;m just not sure it&apos;s good enough.</p>
            </div>
            <div className="message-row message-row-bo">
              <BrandBo pose="peek" size={34} alt="" />
              <p>Send me what you have.</p>
            </div>
            <div className="message-row message-row-you message-row-reacted">
              <p>Meal planning for parents who are tired of deciding dinner at 6pm.</p>
              <span className="message-tapback" title="Bo liked this message">👍</span>
            </div>
            <div className="message-row message-row-bo">
              <BrandBo pose="peek" size={34} alt="" />
              <p>That works. Put it live. I&apos;ll check back at 10:30.</p>
            </div>
            <div className="message-hero-time">10:42</div>
            <div className="message-row message-row-bo">
              <BrandBo pose="peek" size={34} alt="" />
              <p>Hey Maya, how did the headline go?</p>
            </div>
            <div className="message-row message-row-you message-row-reacted">
              <p>It&apos;s live 🙌</p>
              <span className="message-tapback" title="Bo liked this message">👍</span>
            </div>
            <div className="message-row message-row-bo">
              <BrandBo pose="peek" size={34} alt="" />
              <p>Nice. Next is the launch video. Want me to tighten the caption before you post it?</p>
            </div>
          </div>
        </div>
        <div className="message-hero-compose"><span aria-hidden="true">＋</span><div>iMessage</div><span aria-hidden="true">🎙️</span></div>
      </div>
    </div>
  );
}
