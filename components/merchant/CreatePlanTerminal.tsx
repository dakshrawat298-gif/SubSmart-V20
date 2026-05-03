"use client";

import { useEffect, useRef, useState } from "react";
import type { CreatePlanState } from "@/hooks/useCreatePlan";
import { shortenHash } from "@/lib/utils/format";

// ── Types ─────────────────────────────────────────────────────────────────────

type LogLevel = "neutral" | "pending" | "success" | "error";

type LogEntry = {
  readonly id: number;
  readonly timestamp: string;
  readonly message: string;
  readonly level: LogLevel;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeEntry(
  idRef: React.MutableRefObject<number>,
  message: string,
  level: LogLevel,
): LogEntry {
  const now = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const timestamp = `${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}`;
  return { id: idRef.current++, timestamp, message, level };
}

const LEVEL_CLS: Record<LogLevel, string> = {
  neutral: "text-slate-400/90",
  pending: "text-amber-400/75",
  success: "text-emerald-400/80",
  error: "text-rose-400",
};

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Live-activity console that accumulates one log line per state-machine
 * transition and auto-scrolls to the latest entry.
 *
 * Design rules:
 *  - Purely presentational to this component: reads `state`, never writes it.
 *  - Accumulates lines (never replaces) so the merchant sees the full journey.
 *  - Clears automatically when `state` returns to `idle` (after reset).
 *  - Shows a blinking cursor while a transition is in-flight.
 *  - Silent Premium aesthetic: recessed black panel, traffic-light chrome dots,
 *    monospace font, muted colour palette (no loud neon).
 */
export function CreatePlanTerminal({
  state,
}: {
  state: CreatePlanState;
}): JSX.Element | null {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevStatusRef = useRef<string>("idle");
  const idRef = useRef<number>(0);

  // Convenience: append one or more entries at once.
  const push = (...entries: LogEntry[]) =>
    setLogs((prev) => [...prev, ...entries]);

  const mk = (msg: string, lvl: LogLevel) => makeEntry(idRef, msg, lvl);

  useEffect(() => {
    const prev = prevStatusRef.current;
    const curr = state.status;

    // Guard: only act on genuine status transitions, not re-renders with the
    // same status (e.g. referential identity change on the same state).
    if (prev === curr) return;
    prevStatusRef.current = curr;

    // ── Reset ──────────────────────────────────────────────────────────────
    if (curr === "idle") {
      setLogs([]);
      return;
    }

    // ── Simulating ────────────────────────────────────────────────────────
    if (curr === "simulating") {
      push(
        mk("Session started — validating inputs...", "neutral"),
        mk("Encoding createPlan() calldata against BillingHub ABI...", "neutral"),
        mk("Running eth_call simulation on Polygon Amoy...", "pending"),
      );
      return;
    }

    // ── Awaiting signature ────────────────────────────────────────────────
    if (curr === "awaiting-signature") {
      push(
        mk("Simulation passed — no revert detected ✓", "success"),
        mk("Requesting wallet signature (check your wallet)...", "pending"),
      );
      return;
    }

    // ── Mining ────────────────────────────────────────────────────────────
    if (curr === "mining") {
      const { hash } = state;
      push(
        mk("Signature received ✓", "success"),
        mk(`Broadcasting to Polygon Amoy mempool...`, "neutral"),
        mk(`Transaction submitted: ${shortenHash(hash)}`, "neutral"),
        mk("Awaiting block inclusion — Polygon Amoy ~2 s/block...", "pending"),
      );
      return;
    }

    // ── Success ───────────────────────────────────────────────────────────
    if (curr === "success") {
      const { blockNumber, planId } = state;
      push(
        mk(`Block confirmed ✓ — block #${blockNumber.toString()}`, "success"),
      );
      if (planId !== undefined) {
        push(mk(`PlanCreated event decoded — planId: #${planId.toString()}`, "success"));
      }
      push(mk("Plan is live on-chain. Share the checkout link below. ✓", "success"));
      return;
    }

    // ── Error ─────────────────────────────────────────────────────────────
    if (curr === "error") {
      push(mk(`ERROR: ${state.message}`, "error"));
      return;
    }

    // ── Missing deployment ────────────────────────────────────────────────
    if (curr === "missing-deployment") {
      push(
        mk(`ERROR: No BillingHub deployed on chain ${state.chainId}`, "error"),
        mk("Switch to Polygon Amoy (chainId 80002) and retry.", "neutral"),
      );
      return;
    }
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll to bottom whenever a new line is appended.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs]);

  if (logs.length === 0) return null;

  const isLive =
    state.status === "simulating" ||
    state.status === "awaiting-signature" ||
    state.status === "mining";

  const isError = state.status === "error" || state.status === "missing-deployment";
  const isSuccess = state.status === "success";

  return (
    <div
      aria-live="polite"
      aria-label="Live transaction activity console"
      className="mt-5 overflow-hidden rounded-xl border border-white/[0.06] bg-black/50 backdrop-blur-sm"
    >
      {/* ── Chrome bar ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 border-b border-white/[0.05] px-4 py-2.5">
        {/* macOS-style traffic lights */}
        <span
          aria-hidden="true"
          className={`h-2.5 w-2.5 rounded-full transition-colors duration-500 ${
            isError ? "bg-rose-500/90" : "bg-rose-500/30"
          }`}
        />
        <span
          aria-hidden="true"
          className={`h-2.5 w-2.5 rounded-full transition-colors duration-500 ${
            isLive ? "bg-amber-400/90" : "bg-amber-400/30"
          }`}
        />
        <span
          aria-hidden="true"
          className={`h-2.5 w-2.5 rounded-full transition-colors duration-500 ${
            isSuccess ? "bg-emerald-400/90" : "bg-emerald-400/30"
          }`}
        />

        <span className="ml-2 select-none font-mono text-[10px] uppercase tracking-widest text-white/25">
          live activity console
        </span>

        {/* Live indicator */}
        {isLive && (
          <span className="ml-auto flex items-center gap-1.5 font-mono text-[10px] text-amber-400/70">
            <span
              aria-hidden="true"
              className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400/90"
            />
            LIVE
          </span>
        )}
        {isSuccess && (
          <span className="ml-auto font-mono text-[10px] text-emerald-400/70">
            DONE ✓
          </span>
        )}
        {isError && (
          <span className="ml-auto font-mono text-[10px] text-rose-400/80">
            FAILED
          </span>
        )}
      </div>

      {/* ── Log lines ───────────────────────────────────────────────────── */}
      <div
        ref={scrollRef}
        className="max-h-56 overflow-y-auto p-4 font-mono text-[11.5px] leading-[1.7]"
        style={{
          scrollbarWidth: "thin",
          scrollbarColor: "rgba(255,255,255,0.07) transparent",
        }}
      >
        {logs.map((entry) => (
          <div key={entry.id} className="flex gap-2.5">
            <span className="shrink-0 select-none text-white/18">
              [{entry.timestamp}]
            </span>
            <span className="shrink-0 select-none text-indigo-400/40">›</span>
            <span className={LEVEL_CLS[entry.level]}>{entry.message}</span>
          </div>
        ))}

        {/* Blinking cursor while in-flight */}
        {isLive && (
          <div className="mt-0.5 flex gap-2.5">
            <span className="invisible shrink-0 select-none">[00:00:00]</span>
            <span className="shrink-0 select-none text-indigo-400/40">›</span>
            <span
              aria-hidden="true"
              className="animate-pulse text-white/35"
            >
              ▋
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
