import { ImageResponse } from "next/og";

// OG image — treated like a YouTube thumbnail (the #5 viral rule): big,
// bold, one message, readable at a glance in a feed. 1200x630.

export const alt = "Badger AI. Your AI co-founder, right in your messages.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OG() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#FFF3E9",
          padding: "64px 72px",
        }}
      >
        {/* confetti dots */}
        {[
          ["#ECD935", 80, 70, 22],
          ["#4CAF82", 1040, 90, 16],
          ["#EF4444", 1090, 470, 14],
          ["#ECD935", 60, 520, 18],
        ].map(([c, x, y, r], i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x as number,
              top: y as number,
              width: (r as number) * 2,
              height: (r as number) * 2,
              borderRadius: 999,
              background: c as string,
            }}
          />
        ))}

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 999,
              background: "#ECD935",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 26,
            }}
          >
            🦡
          </div>
          <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: 6, color: "#1A1A1A" }}>
            B A D G E R  A I
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.04, color: "#1A1A1A", letterSpacing: -3 }}>
            Your AI co-founder,
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 10, flexWrap: "wrap" }}>
            <div style={{ fontSize: 60, fontWeight: 800, color: "#1A1A1A", letterSpacing: -2 }}>right in your</div>
            <div
              style={{
                fontSize: 60,
                fontWeight: 800,
                color: "#1A1A1A",
                letterSpacing: -2,
                background: "#ECD935",
                padding: "0 18px",
                borderRadius: 16,
              }}
            >
              messages.
            </div>
          </div>
          <div style={{ fontSize: 52, fontWeight: 600, fontStyle: "italic", color: "#6B6B6B", marginTop: 14 }}>
            One clear move a day. Launch in 28 days.
          </div>
        </div>

        <div style={{ fontSize: 30, fontWeight: 600, color: "#5c574d" }}>
          Bo remembers, helps with the work and follows up.
        </div>
      </div>
    ),
    { ...size }
  );
}
