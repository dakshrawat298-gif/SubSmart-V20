"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { shortenHash } from "@/lib/utils/format";

// Dynamically import the QR renderer with ssr:false — react-qr-code generates
// SVG via browser DOM APIs; excluding it from the server bundle guarantees
// zero hydration surface even if the parent tree is ever partially server-
// rendered.
const QRCode = dynamic(() => import("react-qr-code"), { ssr: false });

// ── Shared type ───────────────────────────────────────────────────────────────
// Exported so CreatePlanForm can import it without a separate types file.

export type CreatedPlan = {
  readonly planId: bigint;
  readonly planName: string;
  readonly amount: string;      // human-readable e.g. "10.00"
  readonly symbol: string;      // e.g. "USDC"
  readonly cycleLabel: string;  // e.g. "Monthly"
  readonly maxCycles: number;
  readonly hash: `0x${string}`;
  readonly createdAt: number;   // Date.now()
};

// ── Component ─────────────────────────────────────────────────────────────────

export function ActivePlansInventory({
  plans,
}: {
  plans: CreatedPlan[];
}): JSX.Element | null {
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") setOrigin(window.location.origin);
  }, []);

  if (plans.length === 0) return null;

  return (
    <section aria-label="Active subscription plans" className="mt-8">
      {/* ── Section header ─────────────────────────────────────────────── */}
      <div className="mb-4 flex items-center gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-white/50">
          Active Plans
        </h2>
        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 font-mono text-[11px] text-white/40">
          {plans.length}
        </span>
        <span className="ml-auto text-[11px] text-white/25">
          Stored locally · session persisted
        </span>
      </div>

      {/* ── Plan cards ─────────────────────────────────────────────────── */}
      <div className="space-y-3">
        {plans.map((plan) => (
          <PlanCard key={plan.planId.toString()} plan={plan} origin={origin} />
        ))}
      </div>
    </section>
  );
}

// ── PlanCard ──────────────────────────────────────────────────────────────────

function PlanCard({
  plan,
  origin,
}: {
  plan: CreatedPlan;
  origin: string;
}): JSX.Element {
  const [copied, setCopied] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);

  const checkoutUrl = origin
    ? `${origin}/checkout/${plan.planId.toString()}?name=${encodeURIComponent(plan.planName)}`
    : "";

  async function handleCopy(): Promise<void> {
    if (!checkoutUrl) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(checkoutUrl);
      } else {
        const ta = document.createElement("textarea");
        ta.value = checkoutUrl;
        ta.style.cssText = "position:fixed;opacity:0;pointer-events:none";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard denied — URL is visible for manual copy.
    }
  }

  const createdLabel = formatRelativeTime(plan.createdAt);

  return (
    <>
      <div className="group rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4 transition hover:border-white/[0.12] hover:bg-white/[0.05] sm:p-5">
        <div className="flex flex-wrap items-start gap-3">
          {/* ── Left: plan identity ──────────────────────────────────────── */}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-lg border border-white/8 bg-white/[0.04] px-2 py-0.5 font-mono text-[11px] text-white/40">
                #{plan.planId.toString()}
              </span>
              <span className="text-[11px] text-white/25">{createdLabel}</span>
            </div>

            <p className="mt-1.5 text-sm font-semibold text-white">
              {plan.planName}
            </p>

            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
              <MetaChip label="Amount" value={`${plan.amount} ${plan.symbol}`} />
              <MetaChip label="Cycle" value={plan.cycleLabel} />
              <MetaChip label="Max cycles" value={String(plan.maxCycles)} />
              {plan.hash && (
                <span className="font-mono text-[11px] text-white/25">
                  {shortenHash(plan.hash)}
                </span>
              )}
            </div>
          </div>

          {/* ── Right: action buttons ─────────────────────────────────── */}
          <div className="flex shrink-0 items-center gap-2">
            {/* QR code button */}
            <button
              type="button"
              onClick={() => setQrOpen(true)}
              disabled={!checkoutUrl}
              aria-label={`Show QR code for ${plan.planName}`}
              className={[
                "inline-flex items-center justify-center rounded-xl border px-2.5 py-2 text-xs font-medium transition",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300",
                "disabled:cursor-not-allowed disabled:opacity-40",
                "border-white/10 bg-white/[0.04] text-white/60 hover:border-indigo-300/30 hover:bg-indigo-500/10 hover:text-indigo-200",
              ].join(" ")}
            >
              <QrIcon />
            </button>

            {/* Copy link button */}
            <button
              type="button"
              onClick={handleCopy}
              disabled={!checkoutUrl}
              aria-label={
                copied
                  ? "Checkout link copied"
                  : `Copy checkout link for ${plan.planName}`
              }
              className={[
                "inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300",
                "disabled:cursor-not-allowed disabled:opacity-40",
                copied
                  ? "border-emerald-300/30 bg-emerald-500/10 text-emerald-300"
                  : "border-white/10 bg-white/[0.04] text-white/60 hover:border-indigo-300/30 hover:bg-indigo-500/10 hover:text-indigo-200",
              ].join(" ")}
            >
              {copied ? (
                <>
                  <CheckIcon />
                  Copied!
                </>
              ) : (
                <>
                  <LinkIcon />
                  Copy Link
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* QR modal — rendered outside the card so stacking context is clean */}
      {qrOpen && (
        <QrModal
          plan={plan}
          checkoutUrl={checkoutUrl}
          onClose={() => setQrOpen(false)}
        />
      )}
    </>
  );
}

// ── QR PNG export ─────────────────────────────────────────────────────────────
// Entirely client-side: XMLSerializer → Blob → Image → Canvas → PNG download.
// No SSR surface — called only from a click handler, never during render.

const QR_EXPORT_SIZE = 768; // px — 4× the rendered size, print-ready
const QR_PADDING     = 48;  // px — quiet zone required by QR spec

async function downloadQrPng(
  svgWrapperEl: HTMLElement | null,
  planId: string,
  planName: string
): Promise<void> {
  const svgEl = svgWrapperEl?.querySelector("svg");
  if (!svgEl) return;

  // 1. Serialize SVG to a data URL
  const serializer = new XMLSerializer();
  const svgStr = serializer.serializeToString(svgEl);
  const svgBlob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
  const svgUrl = URL.createObjectURL(svgBlob);

  // 2. Draw onto an offscreen canvas at 4× resolution with white quiet zone
  const total = QR_EXPORT_SIZE + QR_PADDING * 2;
  const canvas = document.createElement("canvas");
  canvas.width  = total;
  canvas.height = total;
  const ctx = canvas.getContext("2d");
  if (!ctx) { URL.revokeObjectURL(svgUrl); return; }

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, total, total);

  await new Promise<void>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, QR_PADDING, QR_PADDING, QR_EXPORT_SIZE, QR_EXPORT_SIZE);
      URL.revokeObjectURL(svgUrl);
      resolve();
    };
    img.onerror = reject;
    img.src = svgUrl;
  });

  // 3. Export canvas as PNG and trigger download
  const pngUrl = canvas.toDataURL("image/png");
  const anchor = document.createElement("a");
  // Sanitise plan name for a valid filename
  const safeName = planName.replace(/[^a-zA-Z0-9\-_ ]/g, "").trim().replace(/\s+/g, "-");
  anchor.download = `SubSmart-Plan-${planId}-${safeName || "Checkout"}.png`;
  anchor.href = pngUrl;
  anchor.click();
}

// ── QrModal ───────────────────────────────────────────────────────────────────

function QrModal({
  plan,
  checkoutUrl,
  onClose,
}: {
  plan: CreatedPlan;
  checkoutUrl: string;
  onClose: () => void;
}): JSX.Element {
  const qrWrapperRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  async function handleDownload(): Promise<void> {
    setDownloading(true);
    try {
      await downloadQrPng(
        qrWrapperRef.current,
        plan.planId.toString(),
        plan.planName
      );
    } finally {
      setDownloading(false);
    }
  }

  // ESC to close
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    // Prevent background scroll while modal is open
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [handleKeyDown]);

  return (
    // Backdrop — click outside to close
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`QR code for ${plan.planName}`}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Dark blur backdrop */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
      />

      {/* Modal panel — stop propagation so clicking inside doesn't close */}
      <div
        className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-white/[0.10] bg-[#0d1424] shadow-[0_32px_80px_-16px_rgba(0,0,0,0.9)] backdrop-blur-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top accent line */}
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-400/40 to-transparent"
        />

        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close QR modal"
          className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-lg text-white/35 transition hover:bg-white/10 hover:text-white/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>

        {/* Content */}
        <div className="flex flex-col items-center px-8 pb-8 pt-7">
          {/* Plan identity */}
          <span className="mb-1 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-white/40">
            Plan #{plan.planId.toString()}
          </span>
          <h3 className="mt-2 text-center text-base font-semibold leading-snug text-white">
            {plan.planName}
          </h3>
          <p className="mt-1 text-center text-[11px] text-white/35">
            {plan.amount} {plan.symbol} · {plan.cycleLabel}
          </p>

          {/* Separator */}
          <div
            aria-hidden="true"
            className="my-6 h-px w-full bg-gradient-to-r from-transparent via-white/[0.08] to-transparent"
          />

          {/* QR code — white padded container for camera scannability */}
          <div
            ref={qrWrapperRef}
            className="rounded-2xl bg-white p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.06)]"
          >
            <QRCode
              value={checkoutUrl}
              size={192}
              bgColor="#ffffff"
              fgColor="#0b1020"
              level="M"
            />
          </div>

          {/* Instruction line */}
          <p className="mt-5 text-center text-[11px] leading-relaxed text-white/30">
            Scan to open the checkout page
          </p>

          {/* URL chip — for visual confirmation, not meant for reading */}
          <div className="mt-3 w-full rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2">
            <p className="truncate text-center font-mono text-[10px] text-white/25">
              {checkoutUrl}
            </p>
          </div>

          {/* Download button */}
          <button
            type="button"
            onClick={() => void handleDownload()}
            disabled={downloading}
            aria-label="Download QR code as PNG"
            className={[
              "mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-medium tracking-wide transition",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300",
              "disabled:cursor-not-allowed disabled:opacity-50",
              downloading
                ? "border-white/[0.08] bg-white/[0.04] text-white/35"
                : "border-white/[0.08] bg-white/[0.04] text-white/50 hover:border-indigo-300/25 hover:bg-indigo-500/[0.08] hover:text-white/75",
            ].join(" ")}
          >
            {downloading ? (
              <>
                <SpinnerIcon />
                Exporting…
              </>
            ) : (
              <>
                <DownloadIcon />
                Download QR · PNG
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MetaChip({
  label,
  value,
}: {
  label: string;
  value: string;
}): JSX.Element {
  return (
    <span className="text-[11px] text-white/40">
      <span className="text-white/25">{label}: </span>
      <span className="text-white/55">{value}</span>
    </span>
  );
}

function DownloadIcon(): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3v13M8 12l4 4 4-4" />
      <path d="M4 20h16" />
    </svg>
  );
}

function SpinnerIcon(): JSX.Element {
  return (
    <svg
      className="h-3.5 w-3.5 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="12" cy="12" r="9"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="3"
      />
      <path
        d="M21 12a9 9 0 00-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function QrIcon(): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="3" height="3" rx="0.5" />
      <rect x="18" y="14" width="3" height="3" rx="0.5" />
      <rect x="14" y="18" width="3" height="3" rx="0.5" />
      <rect x="18" y="18" width="3" height="3" rx="0.5" />
    </svg>
  );
}

function LinkIcon(): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M10.5 13.5a4 4 0 005.66 0l3-3a4 4 0 10-5.66-5.66l-1 1M13.5 10.5a4 4 0 00-5.66 0l-3 3a4 4 0 105.66 5.66l1-1"
      />
    </svg>
  );
}

function CheckIcon(): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12.5l4.5 4.5L19 7" />
    </svg>
  );
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
