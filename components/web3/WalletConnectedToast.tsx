"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";

/**
 * Global wallet-connection toast.
 *
 * Fires ONLY when a wallet address transitions from absent → present (i.e.
 * the user actively clicks "Connect"). It does NOT fire on page-load
 * restoration of a persisted session — that would be intrusive.
 *
 * StrictMode safety:
 *  - `hasInitializedRef` absorbs the first effect run as baseline capture.
 *    The double-invoke in StrictMode sets the baseline but shows no toast.
 *  - `prevAddressRef` compares the new address against the last-known one so
 *    switching wallets also triggers the toast.
 *  - Timer is held in a ref so rapid re-renders never stack duplicate timers.
 */
export function WalletConnectedToast(): JSX.Element {
  const { address, isConnected } = useAccount();
  const [toastVisible, setToastVisible] = useState(false);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevAddressRef = useRef<string | undefined>(undefined);
  const hasInitializedRef = useRef(false);

  const dismiss = useCallback((): void => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setToastVisible(false);
  }, []);

  useEffect(() => {
    // First invocation (including StrictMode's first of two runs): capture the
    // current address as baseline and return without showing the toast. This
    // prevents the toast from firing for a wallet that was already connected
    // before the page loaded (persisted wagmi session).
    if (!hasInitializedRef.current) {
      hasInitializedRef.current = true;
      prevAddressRef.current = address;
      return;
    }

    // Subsequent runs: show toast only when a genuinely new address appears.
    if (isConnected && address && address !== prevAddressRef.current) {
      prevAddressRef.current = address;
      if (timerRef.current) clearTimeout(timerRef.current);
      setToastVisible(true);
      timerRef.current = setTimeout(() => setToastVisible(false), 3500);
    }

    // Wallet disconnected — clear baseline so reconnecting triggers again.
    if (!isConnected) {
      prevAddressRef.current = undefined;
    }
  }, [isConnected, address]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const truncated = address
    ? `${address.slice(0, 6)}\u2026${address.slice(-4)}`
    : "";

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={[
        // Fixed top-centre — slides in from above.
        "fixed top-4 left-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2",
        // Glassmorphism — matches the checkout insufficient-balance toast.
        "rounded-2xl border border-white/10 bg-slate-900/75 shadow-2xl shadow-black/60 backdrop-blur-xl",
        // Slide-down entrance / slide-up exit.
        "transition-all duration-300 ease-out",
        toastVisible
          ? "translate-y-0 opacity-100"
          : "-translate-y-3 pointer-events-none opacity-0",
      ].join(" ")}
    >
      {/* Emerald accent line along the top edge */}
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-px rounded-t-2xl bg-gradient-to-r from-transparent via-emerald-400/60 to-transparent"
      />

      <div className="flex items-center gap-3.5 px-4 py-3.5">
        {/* Success icon */}
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400 ring-1 ring-inset ring-emerald-400/20">
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
        </span>

        {/* Text */}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight text-white">
            Wallet Connected
          </p>
          <p className="mt-0.5 truncate font-mono text-[11px] text-white/45">
            {truncated}
          </p>
        </div>

        {/* Dismiss button */}
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
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
