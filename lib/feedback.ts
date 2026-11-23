export type FeedbackMoment =
  | "start"
  | "finish"
  | "proof"
  | "reply"
  | "payment"
  | "milestone"
  | "missed"
  | "day28";

export function playMoment(
  moment: FeedbackMoment,
  options: { haptics?: boolean; sound?: boolean } = {}
) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("badger:moment", { detail: { moment } }));

  if (options.haptics !== false && "vibrate" in navigator) {
    const pattern: Record<FeedbackMoment, number | number[]> = {
      start: 18,
      finish: [22, 45, 36],
      proof: 24,
      reply: 14,
      payment: [28, 45, 28, 45, 56],
      milestone: [24, 38, 24],
      missed: 16,
      day28: [30, 42, 30, 42, 72],
    };
    try { navigator.vibrate(pattern[moment]); } catch {}
  }

  if (options.sound) playTone(moment);
}

function playTone(moment: FeedbackMoment) {
  try {
    const AudioCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return;
    const context = new AudioCtor();
    const notes = moment === "payment" || moment === "day28"
      ? [392, 523.25, 659.25]
      : moment === "milestone" || moment === "finish"
        ? [440, 587.33]
        : [440];
    const now = context.currentTime;
    notes.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, now + index * 0.09);
      gain.gain.exponentialRampToValueAtTime(0.045, now + index * 0.09 + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.09 + 0.16);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(now + index * 0.09);
      oscillator.stop(now + index * 0.09 + 0.18);
    });
    window.setTimeout(() => void context.close(), 700);
  } catch {}
}
