"use client";

// Share cards — the viral loop. Ship Day and Kill Day generate a branded
// 1080x1350 image drawn on canvas, downloadable or shared via the native
// share sheet. Both outcomes get equal celebration.

import { useEffect, useRef, useState } from "react";
import { PrimaryButton } from "./ui";
import { track } from "@/lib/telemetry";

const INK = "#1A1A1A";
const CREAM = "#FFF3E9";
const YELLOW = "#ECD935";
const PAPER = "#FFFFFF";

function drawBoFace(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  ctx.lineWidth = 1.8 / s > 0.06 ? 1.8 : 0.06 * s;
  ctx.lineWidth = 1.8;
  // ears
  for (const dx of [-17, 17]) {
    ctx.beginPath();
    ctx.arc(dx, -21, 4, 0, Math.PI * 2);
    ctx.fillStyle = "#3D382F";
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.stroke();
  }
  // head
  ctx.beginPath();
  ctx.moveTo(-20, -14);
  ctx.bezierCurveTo(-20, -24, -11, -28, 0, -28);
  ctx.bezierCurveTo(11, -28, 20, -24, 20, -14);
  ctx.bezierCurveTo(20, -6, 13, 2.5, 0, 2.5);
  ctx.bezierCurveTo(-13, 2.5, -20, -6, -20, -14);
  ctx.closePath();
  ctx.fillStyle = "#FBF7EB";
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.stroke();
  // stripes
  for (const m of [1, -1]) {
    ctx.beginPath();
    ctx.moveTo(m * -13.5, -25.5);
    ctx.bezierCurveTo(m * -14.5, -17, m * -12.5, -8, m * -9.5, -1);
    ctx.bezierCurveTo(m * -7, 0.2, m * -4.5, -0.2, m * -3.5, -2);
    ctx.bezierCurveTo(m * -5.2, -10, m * -5.5, -18, m * -5.5, -26.8);
    ctx.bezierCurveTo(m * -8.5, -27.8, m * -11.5, -27, m * -13.5, -25.5);
    ctx.closePath();
    ctx.fillStyle = "#3D382F";
    ctx.fill();
  }
  // eyes
  for (const dx of [-9, 9]) {
    ctx.beginPath();
    ctx.arc(dx, -12, 4.8, 0, Math.PI * 2);
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(dx, -12, 2.4, 3.2, 0, 0, Math.PI * 2);
    ctx.fillStyle = INK;
    ctx.fill();
  }
  // brow (raised right)
  ctx.strokeStyle = "#FBF7EB";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-12.5, -19.5);
  ctx.lineTo(-5.5, -19);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(5.5, -22);
  ctx.quadraticCurveTo(9.5, -25, 12.5, -21.5);
  ctx.stroke();
  // nose + mouth
  ctx.beginPath();
  ctx.ellipse(0, -3.5, 3.4, 2.6, 0, 0, Math.PI * 2);
  ctx.fillStyle = INK;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(-3, 1.5);
  ctx.quadraticCurveTo(0, 4, 3, 1.5);
  ctx.stroke();
  ctx.restore();
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number): number {
  const words = text.split(" ");
  let line = "";
  let yy = y;
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, yy);
      line = w;
      yy += lh;
    } else line = test;
  }
  ctx.fillText(line, x, yy);
  return yy + lh;
}

export function drawShareCard(
  canvas: HTMLCanvasElement,
  opts: {
    kind: "shipped" | "killed";
    name: string;
    idea: string;
    days: number;
    outreach: number;
  }
) {
  const W = 1080;
  const H = 1350;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const ship = opts.kind === "shipped";

  // bg
  ctx.fillStyle = CREAM;
  ctx.fillRect(0, 0, W, H);
  // confetti
  const colors = [YELLOW, "#4CAF82", "#EF4444", "rgba(26,26,26,0.15)"];
  for (let i = 0; i < 26; i++) {
    ctx.beginPath();
    ctx.arc(((i * 173) % W), 60 + ((i * 311) % 420), 7 + (i % 3) * 5, 0, Math.PI * 2);
    ctx.fillStyle = colors[i % 4];
    ctx.globalAlpha = 0.8;
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // wordmark
  ctx.fillStyle = INK;
  ctx.font = "700 34px Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("B A D G E R  A I", W / 2, 110);

  // Bo
  drawBoFace(ctx, W / 2, 320, 4.4);

  // verdict pill
  const pillText = ship ? "SHIP DAY" : "KILLED SMART";
  ctx.font = "700 36px Inter, system-ui, sans-serif";
  const pw = ctx.measureText(pillText).width + 80;
  ctx.fillStyle = ship ? YELLOW : "#991B1B";
  ctx.beginPath();
  ctx.roundRect(W / 2 - pw / 2, 420, pw, 76, 38);
  ctx.fill();
  ctx.fillStyle = ship ? INK : "#fff";
  ctx.fillText(pillText, W / 2, 470);

  // headline
  ctx.fillStyle = INK;
  ctx.font = "600 84px Fraunces, Georgia, serif";
  const headline = ship ? `${opts.name} shipped it.` : `${opts.name} got the answer.`;
  wrapText(ctx, headline, W / 2, 620, 880, 96);

  // idea card
  ctx.fillStyle = PAPER;
  ctx.beginPath();
  ctx.roundRect(100, 700, W - 200, 240, 28);
  ctx.fill();
  ctx.strokeStyle = "rgba(26,26,26,0.1)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "rgba(26,26,26,0.5)";
  ctx.font = "700 26px Inter, system-ui, sans-serif";
  ctx.fillText("THE IDEA", W / 2, 760);
  ctx.fillStyle = INK;
  ctx.font = "500 40px Inter, system-ui, sans-serif";
  wrapText(ctx, `"${opts.idea}"`, W / 2, 820, 800, 52);

  // stats row
  const stats: [string, string][] = [
    [String(opts.days), "days showed up"],
    [String(opts.outreach), "real conversations"],
    [ship ? "SHIP" : "KILL", "the verdict"],
  ];
  stats.forEach(([v, k], i) => {
    const x = 200 + i * 340;
    ctx.fillStyle = INK;
    ctx.font = "600 76px Fraunces, Georgia, serif";
    ctx.fillText(v, x, 1080);
    ctx.fillStyle = "rgba(26,26,26,0.55)";
    ctx.font = "600 26px Inter, system-ui, sans-serif";
    ctx.fillText(k, x, 1124);
  });

  // footer band
  ctx.fillStyle = ship ? YELLOW : INK;
  ctx.fillRect(0, H - 130, W, 130);
  ctx.fillStyle = ship ? INK : CREAM;
  ctx.font = "700 34px Inter, system-ui, sans-serif";
  ctx.fillText(
    ship ? "From idea to a first paying customer in 28 days" : "28 days, an honest answer, zero regret",
    W / 2,
    H - 50
  );
}

export function ShareCardModal({
  kind,
  name,
  idea,
  days,
  outreach,
  onClose,
}: {
  kind: "shipped" | "killed";
  name: string;
  idea: string;
  days: number;
  outreach: number;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [toast, setToast] = useState("");

  useEffect(() => {
    const render = () => {
      if (canvasRef.current)
        drawShareCard(canvasRef.current, { kind, name, idea, days, outreach });
    };
    render();
    // re-render once webfonts are ready so Fraunces lands on the card
    document.fonts?.ready.then(render);
  }, [kind, name, idea, days, outreach]);

  const getBlob = () =>
    new Promise<Blob | null>((resolve) =>
      canvasRef.current?.toBlob((b) => resolve(b), "image/png")
    );

  const share = async () => {
    const blob = await getBlob();
    if (!blob) return;
    const file = new File([blob], `badger-${kind}-receipt.png`, { type: "image/png" });
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          text: `${kind === "shipped" ? "I shipped it. 28 days with Badger AI." : "I tested my idea properly and got an honest answer."} ${window.location.origin}/?utm_source=launch_receipt&utm_medium=founder_share&utm_campaign=product_proof_loop`,
        });
        void track("launch_receipt_shared", { kind, method: "shared", days, conversations: outreach });
        return;
      } catch {
        /* user cancelled */
      }
    }
    download();
  };

  const download = async () => {
    const blob = await getBlob();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `badger-${kind}-receipt.png`;
    a.click();
    URL.revokeObjectURL(url);
    void track("launch_receipt_shared", { kind, method: "downloaded", days, conversations: outreach });
    setToast("Saved. Post it where your people are.");
    setTimeout(() => setToast(""), 2600);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-5" style={{ background: "rgba(26,26,26,0.65)" }} onClick={onClose}>
      <div className="w-full max-w-[420px] bg-cream rounded-[22px] p-5 anim-pop max-h-[92dvh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <div className="text-[11px] font-bold tracking-[1.2px] text-ink-60">YOUR LAUNCH RECEIPT · READY TO POST</div>
          <button type="button" onClick={onClose} className="w-7 h-7 rounded-full bg-ink-10 border-none text-[15px] cursor-pointer">
            ×
          </button>
        </div>
        <canvas ref={canvasRef} className="w-full rounded-xl shadow-card" style={{ aspectRatio: "1080/1350" }} />
        <div className="mt-4 flex flex-col gap-2">
          <PrimaryButton onClick={share}>Share my receipt</PrimaryButton>
          <button type="button" onClick={download} className="spring w-full py-3 rounded-[14px] border-[1.5px] border-ink-20 bg-transparent text-[14px] font-semibold cursor-pointer">
            Download PNG
          </button>
        </div>
        {toast && <div className="mt-3 text-center text-[13px] font-semibold text-teal-deep">{toast}</div>}
      </div>
    </div>
  );
}
