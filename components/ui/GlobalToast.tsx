"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast as dispatcher, type ToastPayload, type ToastLevel } from "@/lib/toast";

// ── Constants ─────────────────────────────────────────────────────────────────

/** How long a toast stays visible before auto-dismissing. */
const AUTO_DISMISS_MS = 5000;
/** Never stack more than 3 pills — oldest is evicted first. */
const MAX_VISIBLE = 3;

// ── Style maps (Silent Premium palette) ──────────────────────────────────────

const ACCENT_CLASS: Record<ToastLevel, string> = {
  error:   "via-rose-400/60",
  success: "via-emerald-400/60",
  info:    "via-indigo-400/60",
};

const ICON_CLASS: Record<ToastLevel, string> = {
  error:   "bg-rose-500/15 text-rose-400 ring-rose-400/20",
  success: "bg-emerald-500/15 text-emerald-400 ring-emerald-400/20",
  info:    "bg-indigo-500/15 text-indigo-400 ring-indigo-400/20",
};

// ── Internal type ─────────────────────────────────────────────────────────────

type ToastEntry = ToastPayload & { id: number };

// ── Root provider ─────────────────────────────────────────────────────────────

/**
 * Mount once inside RootLayout (inside <Providers> so wagmi context is
 * available, but at the body level so it renders above all page content).
 *
 * Listens for "subsmart:toast" CustomEvents dispatched by lib/toast.ts and
 * renders a stacked column of floating pills in the top-centre of the viewport.
 */
export function GlobalToast(): JSX.Element {
  const [entries, setEntries] = useState<ToastEntry[]>([]);
  const counterRef = useRef(0);

  useEffect(() => {
    function onToast(e: Event): void {
      const { message, level } = (e as CustomEvent<ToastPayload>).detail;
      const id = ++counterRef.current;

      setEntries((prev) => {
        const next = [...prev, { message, level, id }];
        // Cap the stack — drop the oldest entry when we exceed MAX_VISIBLE.
        return next.length > MAX_VISIBLE ? next.slice(-MAX_VISIBLE) : next;
      });

      setTimeout(() => {
        setEntries((prev) => prev.filter((t) => t.id !== id));
      }, AUTO_DISMISS_MS);
    }

    window.addEventListener(dispatcher.EVENT_NAME, onToast);
    return () => window.removeEventListener(dispatcher.EVENT_NAME, onToast);
  }, []);

  const dismiss = useCallback((id: number) => {
    setEntries((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <div
      aria-live="assertive"
      aria-atomic="false"
      className="pointer-events-none fixed inset-x-0 top-4 z-[9999] flex flex-col items-center gap-2 px-4"
    >
      {entries.map((entry) => (
        <ToastPill key={entry.id} entry={entry} onDismiss={dismiss} />
      ))}
    </div>
  );
}

// ── Single pill ───────────────────────────────────────────────────────────────

function ToastPill({
  entry,
  onDismiss,
}: {
  entry: ToastEntry;
  onDismiss: (id: number) => void;
}): JSX.Element {
  const [mounted, setMounted] = useState(false);

  // One-frame defer so the CSS transition animates from the initial state.
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div
      role="alert"
      className={[
        "pointer-events-auto relative w-full max-w-sm overflow-hidden",
        "rounded-2xl border border-white/10 bg-slate-900/80 shadow-2xl shadow-black/60 backdrop-blur-xl",
        "transition-all duration-300 ease-out",
        mounted
          ? "translate-y-0 opacity-100"
          : "-translate-y-2 opacity-0",
      ].join(" ")}
    >
      {/* Top accent gradient line — colour varies by level */}
      <span
        aria-hidden="true"
        className={[
          "absolute inset-x-0 top-0 h-px",
          `bg-gradient-to-r from-transparent ${ACCENT_CLASS[entry.level]} to-transparent`,
        ].join(" ")}
      />

      <div className="flex items-start gap-3 px-4 py-3.5">
        {/* Level icon */}
        <span
          className={[
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset",
            ICON_CLASS[entry.level],
          ].join(" ")}
        >
          <LevelIcon level={entry.level} />
        </span>

        {/* Message text — allow multi-line for longer RPC errors */}
        <p className="flex-1 break-words pt-0.5 text-sm leading-snug text-white/85">
          {entry.message}
        </p>

        {/* Dismiss × */}
        <button
          type="button"
          onClick={() => onDismiss(entry.id)}
          aria-label="Dismiss notification"
          className="ml-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-white/35 transition hover:bg-white/10 hover:text-white/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-3.5 w-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function LevelIcon({ level }: { level: ToastLevel }): JSX.Element {
  if (level === "success") {
    return (
      <svg
        viewBox="0 0 24 24"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M20 6L9 17l-5-5" />
      </svg>
    );
  }
  if (level === "info") {
    return (
      <svg
        viewBox="0 0 24 24"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 16v-4M12 8h.01" />
      </svg>
    );
  }
  // error
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 9v4M12 17h.01" />
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
    </svg>
  );
}
