"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useAccount, useDisconnect, useChainId } from "wagmi";
import { WalletModal } from "./WalletModal";
import { Portal } from "./Portal";
import { shortenAddress } from "@/lib/utils/address";
import { getChainById, isSupportedChainId } from "@/lib/chain/networks";

/**
 * Premium dark-mode connect button.
 * - Disconnected: gradient CTA opening the wallet picker.
 * - Connected: pill showing chain dot + truncated address; click to open the
 *   account menu (Copy address / Disconnect).
 *
 * The account menu is rendered via a Portal anchored to the trigger button so
 * it never gets trapped inside an ancestor stacking context (e.g. a header
 * with z-index) and never gets clipped by overflow:hidden.
 */
export function ConnectButton(): JSX.Element {
  const { address, isConnected, status } = useAccount();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const chain = getChainById(chainId);
  const onSupportedChain = isSupportedChainId(chainId);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(
    null
  );

  // Position the portalled dropdown directly under the trigger.
  useLayoutEffect(() => {
    if (!menuOpen || !triggerRef.current) return;
    const recompute = (): void => {
      const r = triggerRef.current?.getBoundingClientRect();
      if (!r) return;
      setMenuPos({
        top: r.bottom + 8,
        right: Math.max(8, window.innerWidth - r.right),
      });
    };
    recompute();
    window.addEventListener("resize", recompute);
    window.addEventListener("scroll", recompute, true);
    return () => {
      window.removeEventListener("resize", recompute);
      window.removeEventListener("scroll", recompute, true);
    };
  }, [menuOpen]);

  // Close the menu on Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  if (status === "reconnecting" || status === "connecting") {
    return (
      <button
        type="button"
        disabled
        className="inline-flex h-11 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 text-sm text-white/70"
      >
        <span className="h-2 w-2 animate-pulse rounded-full bg-indigo-400" />
        Connecting…
      </button>
    );
  }

  if (!isConnected || !address) {
    return (
      <>
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="group relative inline-flex h-11 w-full items-center justify-center overflow-hidden rounded-full px-5 text-sm font-medium text-white shadow-[0_10px_40px_-10px_rgba(99,102,241,0.6)] transition hover:shadow-[0_14px_50px_-10px_rgba(168,85,247,0.7)] focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 sm:h-12 sm:w-auto sm:px-6 sm:text-base"
        >
          <span className="absolute inset-0 bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500" />
          <span className="absolute inset-0 bg-gradient-to-r from-indigo-400 via-violet-400 to-fuchsia-400 opacity-0 transition group-hover:opacity-100" />
          <span className="relative flex items-center gap-2">
            <WalletGlyph />
            Connect Wallet
          </span>
        </button>
        <WalletModal open={pickerOpen} onClose={() => setPickerOpen(false)} />
      </>
    );
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        className="inline-flex h-11 max-w-full items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 text-sm text-white shadow-inner transition hover:border-white/20 hover:bg-white/[0.07] focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 sm:h-12 sm:px-4"
      >
        <span
          aria-hidden="true"
          className={
            "h-2 w-2 shrink-0 rounded-full " +
            (onSupportedChain
              ? "bg-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.8)]"
              : "bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.8)]")
          }
        />
        <span className="hidden text-xs text-white/60 sm:inline">
          {chain?.name ?? "Unsupported"}
        </span>
        <span className="truncate font-mono text-sm text-white">
          {shortenAddress(address)}
        </span>
        <svg
          viewBox="0 0 24 24"
          className={
            "h-3.5 w-3.5 shrink-0 text-white/50 transition " +
            (menuOpen ? "rotate-180" : "")
          }
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path strokeLinecap="round" d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {menuOpen && (
        <Portal>
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
            className="fixed inset-0 z-[80] cursor-default bg-black/30 backdrop-blur-[1px]"
          />
          <div
            role="menu"
            style={
              menuPos
                ? { top: menuPos.top, right: menuPos.right }
                : { visibility: "hidden" }
            }
            className="fixed z-[81] w-56 max-w-[calc(100vw-1rem)] overflow-hidden rounded-2xl border border-white/10 bg-[#0d1228] p-1 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8)]"
          >
            <div className="px-3 py-2">
              <div className="text-[10px] uppercase tracking-widest text-white/40">
                Connected
              </div>
              <div className="mt-1 truncate font-mono text-xs text-white/80">
                {address}
              </div>
            </div>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                navigator.clipboard?.writeText(address);
                setMenuOpen(false);
              }}
              className="flex min-h-[44px] w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-white/80 transition hover:bg-white/5 focus:outline-none focus-visible:bg-white/5"
            >
              Copy address
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                disconnect();
                setMenuOpen(false);
              }}
              className="flex min-h-[44px] w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-rose-300 transition hover:bg-rose-500/10 focus:outline-none focus-visible:bg-rose-500/10"
            >
              Disconnect
            </button>
          </div>
        </Portal>
      )}
    </>
  );
}

function WalletGlyph(): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 7.5A2.5 2.5 0 015.5 5h11A2.5 2.5 0 0119 7.5v1.25H6.5a1.5 1.5 0 000 3H21V18a2 2 0 01-2 2H5a2 2 0 01-2-2V7.5z"
      />
      <circle cx="16.5" cy="13.25" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}
