import { ImageResponse } from "next/og";

// Next.js file-based OG image convention — auto-served at /deck/opengraph-image
export const runtime = "edge";
export const alt = "SubSmart Protocol — Decentralized Recurring Billing";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OGImage(): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "space-between",
          backgroundColor: "#0b1020",
          padding: "64px 72px",
          position: "relative",
          overflow: "hidden",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        {/* ── Dot-grid mesh overlay ─────────────────────────────────────── */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "radial-gradient(circle, rgba(255,255,255,0.045) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
            display: "flex",
          }}
        />

        {/* ── Indigo glow — top-left ──────────────────────────────────── */}
        <div
          style={{
            position: "absolute",
            top: "-120px",
            left: "-120px",
            width: "600px",
            height: "500px",
            borderRadius: "50%",
            background:
              "radial-gradient(ellipse at center, rgba(99,102,241,0.30) 0%, transparent 65%)",
            display: "flex",
          }}
        />

        {/* ── Emerald glow — bottom-right ─────────────────────────────── */}
        <div
          style={{
            position: "absolute",
            bottom: "-150px",
            right: "-100px",
            width: "600px",
            height: "500px",
            borderRadius: "50%",
            background:
              "radial-gradient(ellipse at center, rgba(52,211,153,0.20) 0%, transparent 65%)",
            display: "flex",
          }}
        />

        {/* ── Top row: badge + network tag ────────────────────────────── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
            position: "relative",
          }}
        >
          {/* Live badge */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: "999px",
              padding: "8px 18px",
              backgroundColor: "rgba(255,255,255,0.04)",
            }}
          >
            <div
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                backgroundColor: "#818cf8",
                boxShadow: "0 0 10px rgba(99,102,241,0.9)",
                display: "flex",
              }}
            />
            <span
              style={{
                fontSize: "13px",
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.45)",
              }}
            >
              Polygon Amoy · Testnet Live
            </span>
          </div>

          {/* Right tag */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              backgroundColor: "rgba(52,211,153,0.08)",
              border: "1px solid rgba(52,211,153,0.18)",
              borderRadius: "999px",
              padding: "8px 18px",
            }}
          >
            <span
              style={{ fontSize: "13px", color: "#34d399", letterSpacing: "0.05em" }}
            >
              Seed Round Open
            </span>
          </div>
        </div>

        {/* ── Main headline ────────────────────────────────────────────── */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0px",
            position: "relative",
            marginTop: "8px",
          }}
        >
          <span
            style={{
              fontSize: "96px",
              fontWeight: 800,
              lineHeight: 0.95,
              letterSpacing: "-3px",
              color: "rgba(255,255,255,0.95)",
              display: "flex",
            }}
          >
            SubSmart
          </span>
          <span
            style={{
              fontSize: "96px",
              fontWeight: 800,
              lineHeight: 0.95,
              letterSpacing: "-3px",
              color: "rgba(255,255,255,0.38)",
              display: "flex",
            }}
          >
            Protocol
          </span>
        </div>

        {/* ── Bottom row: tagline + ask pill ──────────────────────────── */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            width: "100%",
            position: "relative",
          }}
        >
          {/* Tagline */}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <span
              style={{
                fontSize: "22px",
                color: "rgba(255,255,255,0.55)",
                letterSpacing: "-0.3px",
              }}
            >
              Decentralized, non-custodial recurring billing.
            </span>
            <span
              style={{
                fontSize: "22px",
                color: "rgba(255,255,255,0.28)",
                letterSpacing: "-0.3px",
              }}
            >
              Zero lockups. Instant yield. No intermediaries.
            </span>
          </div>

          {/* Ask pill */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              gap: "4px",
            }}
          >
            <span
              style={{
                fontSize: "42px",
                fontWeight: 800,
                color: "#fbbf24",
                letterSpacing: "-1px",
              }}
            >
              $10k
            </span>
            <span
              style={{
                fontSize: "13px",
                color: "rgba(251,191,36,0.5)",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
              }}
            >
              Raising · Pre-Audit
            </span>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
