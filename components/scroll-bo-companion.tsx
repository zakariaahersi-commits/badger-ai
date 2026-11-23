"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";

const clamp = (value: number, minimum = 0, maximum = 1) =>
  Math.max(minimum, Math.min(maximum, value));

export function ScrollBoCompanion() {
  const companionRef = useRef<HTMLDivElement>(null);
  const frameOneRef = useRef<HTMLImageElement>(null);
  const frameTwoRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const companion = companionRef.current;
    const frameOne = frameOneRef.current;
    const frameTwo = frameTwoRef.current;
    const startSection = document.querySelector<HTMLElement>("#tour");
    const endSection = document.querySelector<HTMLElement>("#bo");
    if (!companion || !frameOne || !frameTwo || !startSection || !endSection) return;

    let animationFrame = 0;
    let journeyStart = 0;
    let journeyEnd = 1;

    const measure = () => {
      journeyStart = window.scrollY + startSection.getBoundingClientRect().top - window.innerHeight * 0.84;
      journeyEnd = window.scrollY + endSection.getBoundingClientRect().top - window.innerHeight * 0.2;
    };

    const update = () => {
      animationFrame = 0;
      const rawProgress = (window.scrollY - journeyStart) / Math.max(1, journeyEnd - journeyStart);
      const progress = clamp(rawProgress);
      const visible = rawProgress >= 0 && rawProgress <= 1;

      // Three slow crossings. Bo reaches an edge, turns there, then continues.
      const path = Math.min(2.9999, progress * 3);
      const segment = Math.floor(path);
      const local = path - segment;
      const movingRight = segment % 2 === 1;
      const x = movingRight ? -8 + local * 116 : 108 - local * 116;
      const y = segment === 0 ? 72 - local * 12 : segment === 1 ? 60 - local * 12 : 48 + local * 10;
      const direction = movingRight ? 1 : -1;
      const stepTilt = Math.sin(progress * Math.PI * 26) * 1.8;
      const entrance = clamp(progress / 0.035);
      const exit = clamp((1 - progress) / 0.035);
      const opacity = visible ? Math.min(entrance, exit) : 0;
      const scale = 0.88 + Math.min(entrance, exit) * 0.12;
      const useSecondFrame = Math.floor(Math.max(0, window.scrollY - journeyStart) / 78) % 2 === 1;

      companion.style.opacity = opacity.toFixed(3);
      companion.style.transform = `translate3d(${x.toFixed(2)}vw, ${y.toFixed(2)}vh, 0) translate(-50%, -50%) scale(${scale.toFixed(3)}) scaleX(${direction}) rotate(${stepTilt.toFixed(2)}deg)`;
      companion.dataset.visible = visible ? "true" : "false";
      companion.dataset.direction = movingRight ? "right" : "left";
      frameOne.style.opacity = useSecondFrame ? "0" : "1";
      frameTwo.style.opacity = useSecondFrame ? "1" : "0";
    };

    const requestUpdate = () => {
      if (animationFrame) return;
      animationFrame = window.requestAnimationFrame(update);
    };

    const onResize = () => {
      measure();
      requestUpdate();
    };

    measure();
    update();
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", onResize);
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
    };
  }, []);

  return (
    <div ref={companionRef} className="scroll-bo-companion" aria-hidden="true">
      <Image
        ref={frameOneRef}
        src="/brand/bo-walk-transparent.webp"
        alt=""
        fill
        priority
        sizes="(max-width: 767px) 38vw, 220px"
        className="scroll-bo-frame"
      />
      <Image
        ref={frameTwoRef}
        src="/brand/bo-walk-2-transparent.webp"
        alt=""
        fill
        priority
        sizes="(max-width: 767px) 38vw, 220px"
        className="scroll-bo-frame"
      />
    </div>
  );
}
