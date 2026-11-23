import Image from "next/image";

export function BrandBo({
  size = 72,
  alt = "",
  className = "",
  facing = "right",
  pose = "front",
}: {
  size?: number;
  alt?: string;
  className?: string;
  facing?: "left" | "right";
  pose?: "front" | "peek" | "walk" | "thinking" | "celebrate" | "recover";
}) {
  const src = pose === "peek"
    ? "/brand/bo-peek-v1.webp"
    : pose === "walk"
      ? "/brand/bo-walk-transparent.webp"
      : pose === "thinking"
        ? "/brand/bo-thinking-v1.webp"
        : pose === "celebrate"
          ? "/brand/bo-celebrate-v1.webp"
          : pose === "recover"
            ? "/brand/bo-recover-v1.webp"
      : "/brand/bo-front-v1.webp";

  return (
    <span
      className={`relative inline-block shrink-0 ${className}`}
      style={{ width: size, height: size }}
      aria-hidden={alt ? undefined : true}
    >
      <Image
        src={src}
        alt={alt}
        fill
        loading="eager"
        sizes={`${size}px`}
        className="object-contain drop-shadow-[0_8px_12px_rgba(26,26,26,0.14)]"
        style={{ transform: pose === "walk" && facing === "left" ? "scaleX(-1)" : undefined }}
      />
    </span>
  );
}

export function BrandBoDailyStage({ className = "" }: { className?: string }) {
  return (
    <div className={`relative h-[210px] w-full overflow-hidden rounded-[24px] ${className}`}>
      <Image
        src="/brand/bo-daily-stage.png"
        alt="Bo planning the next step"
        fill
        sizes="(max-width: 480px) 90vw, 430px"
        className="object-cover"
        style={{ objectPosition: "50% 53%" }}
      />
    </div>
  );
}
