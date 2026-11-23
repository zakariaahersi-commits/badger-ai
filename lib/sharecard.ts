// Shareable proof-of-work cards, drawn on canvas (no deps). Every peak moment
// (day done, Ship Day, Kill Day) can be saved or shared as a designed image —
// the founder's receipt, and Badger's word-of-mouth engine.

const W = 1080;
const H = 1350;
const CREAM = "#FAF7F0";
const INK = "#1A1A1A";
const INK60 = "#5c574d";
const YELLOW = "#E8D44D";
const RED = "#991B1B";
const TEAL = "#0E7C6B";

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function wrap(c: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (c.measureText(t).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}

export type ShareCard =
  | { kind: "day"; day: number; streak: number; did: string; boLine?: string }
  | { kind: "shipped"; idea: string; name?: string }
  | { kind: "killed"; lesson: string };

function draw(card: ShareCard): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const c = cv.getContext("2d")!;

  const dark = card.kind !== "day";
  c.fillStyle = dark ? INK : CREAM;
  c.fillRect(0, 0, W, H);
  const fg = dark ? CREAM : INK;
  const sub = dark ? "rgba(250,247,240,0.65)" : INK60;

  // Wordmark
  c.fillStyle = sub;
  c.font = "bold 34px system-ui, sans-serif";
  c.save();
  c.translate(80, 96);
  c.fillText("B A D G E R  A I", 0, 0);
  c.restore();

  // Badger
  c.font = "120px serif";
  c.fillText("🦡", W - 220, 150);

  if (card.kind === "day") {
    c.fillStyle = INK;
    c.font = "bold 40px system-ui, sans-serif";
    c.fillText(`LAUNCH RECEIPT · DAY ${card.day} OF 28`, 80, 260);

    c.fillStyle = fg;
    c.font = "600 92px Georgia, serif";
    const didLines = wrap(c, `“${card.did}”`, W - 160).slice(0, 6);
    didLines.forEach((l, i) => c.fillText(l, 80, 420 + i * 108));

    // streak chip
    roundRect(c, 80, 1020, 420, 130, 28);
    c.fillStyle = YELLOW;
    c.fill();
    c.fillStyle = INK;
    c.font = "bold 64px system-ui, sans-serif";
    c.fillText(`🔥 ${card.streak}-day streak`, 112, 1105);

    if (card.boLine) {
      c.fillStyle = sub;
      c.font = "italic 40px Georgia, serif";
      wrap(c, `Bo: ${card.boLine}`, W - 160).slice(0, 2).forEach((l, i) => c.fillText(l, 80, 1215 + i * 52));
    }
  }

  if (card.kind === "shipped") {
    c.fillStyle = YELLOW;
    c.font = "bold 40px system-ui, sans-serif";
    c.fillText("SHIP DAY · 28 DAYS DONE", 80, 260);
    c.fillStyle = fg;
    c.font = "600 110px Georgia, serif";
    wrap(c, "Real people are paying. It's real.", W - 160).forEach((l, i) => c.fillText(l, 80, 430 + i * 128));
    c.fillStyle = sub;
    c.font = "48px Georgia, serif";
    wrap(c, card.idea, W - 160).slice(0, 3).forEach((l, i) => c.fillText(l, 80, 880 + i * 62));
    roundRect(c, 80, 1080, 560, 120, 28);
    c.fillStyle = TEAL;
    c.fill();
    c.fillStyle = CREAM;
    c.font = "bold 56px system-ui, sans-serif";
    c.fillText("🚀 Shipped in 28 days", 112, 1158);
  }

  if (card.kind === "killed") {
    c.fillStyle = "#EF4444";
    c.font = "bold 40px system-ui, sans-serif";
    c.fillText("KILL DAY · VERDICT DELIVERED", 80, 260);
    c.fillStyle = fg;
    c.font = "600 110px Georgia, serif";
    wrap(c, "I gave my idea 28 days. The evidence said no.", W - 160).forEach((l, i) => c.fillText(l, 80, 430 + i * 128));
    c.fillStyle = sub;
    c.font = "italic 48px Georgia, serif";
    wrap(c, `What it taught me: ${card.lesson}`, W - 160).slice(0, 3).forEach((l, i) => c.fillText(l, 80, 960 + i * 62));
    roundRect(c, 80, 1130, 640, 120, 28);
    c.fillStyle = RED;
    c.fill();
    c.fillStyle = CREAM;
    c.font = "bold 56px system-ui, sans-serif";
    c.fillText("☠ Killed it clean. No zombie.", 112, 1208);
  }

  // Footer
  c.fillStyle = sub;
  c.font = "bold 34px system-ui, sans-serif";
  c.fillText("One real move at a time", 80, H - 60);

  return cv;
}

// Share the card via the native sheet when available, otherwise download it.
export async function shareCard(card: ShareCard): Promise<"shared" | "downloaded" | "failed"> {
  try {
    const cv = draw(card);
    const blob = await new Promise<Blob | null>((res) => cv.toBlob(res, "image/png"));
    if (!blob) return "failed";
    const file = new File([blob], `badger-launch-receipt.png`, { type: "image/png" });
    if (typeof navigator.share === "function" && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: "Badger AI", text: `I’m building with Bo: ${window.location.origin}/?utm_source=launch_receipt&utm_medium=founder_share&utm_campaign=product_proof_loop` });
      return "shared";
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "badger-launch-receipt.png";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    return "downloaded";
  } catch {
    return "failed";
  }
}
