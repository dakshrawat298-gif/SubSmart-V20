"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount, useChainId } from "wagmi";
import { getBillingHubAddress } from "@/lib/chain/billingHub";
import { useCustomerSubscriptions } from "@/hooks/useCustomerSubscriptions";
import type { SubscriptionEntry } from "@/hooks/useCustomerSubscriptions";
import { SubscriptionCard } from "@/components/customer/SubscriptionCard";
import { ConnectButton } from "@/components/web3/ConnectButton";

/**
 * Customer dashboard client boundary — all wallet-aware logic lives here.
 *
 * Render states (in priority order):
 *  1. Wallet not connected  → connect prompt
 *  2. Wrong / unsupported chain (hub not deployed) → "switch chain" banner
 *  3. Loading subscriptions → skeleton spinner
 *  4. RPC error            → error banner with retry
 *  5. No active subs       → empty state
 *  6. Active subs          → responsive grid of SubscriptionCards
 *
 * Per §3.2: client component is minimal — all sub-concerns are delegated.
 */
export function CustomerDashboardClient(): JSX.Element {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const hubAddress = getBillingHubAddress(chainId);

  const {
    subscriptions: fetchedSubs,
    isLoading,
    error,
    refetch,
  } = useCustomerSubscriptions();

  // Mirror fetched subscriptions into local state so we can perform optimistic
  // removal the moment a cancel succeeds — no waiting for the next refetch.
  const [subscriptions, setSubscriptions] = useState<SubscriptionEntry[]>([]);
  useEffect(() => {
    setSubscriptions(fetchedSubs);
  }, [fetchedSubs]);

  // Optimistically remove the cancelled card from the visible list, then
  // trigger a background refetch so the local state stays consistent with
  // the chain once the new block propagates.
  const handleCancelled = useCallback(
    (subscriptionId: `0x${string}`) => {
      setSubscriptions((prev) =>
        prev.filter((s) => s.subscriptionId !== subscriptionId)
      );
      // Background sync — runs after the optimistic update so the UI never
      // shows a stale card even if the refetch is slow.
      setTimeout(() => refetch(), 3_000);
    },
    [refetch]
  );

  // ── 1. Not connected ─────────────────────────────────────────────────────
  if (!isConnected) {
    return (
      <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-center sm:p-12">
        <WalletIcon />
        <h2 className="mt-4 text-base font-semibold text-white sm:text-lg">
          Connect your wallet
        </h2>
        <p className="mt-2 text-sm text-white/55">
          Connect to see your active SubSmart subscriptions and manage
          cancellations.
        </p>
        <div className="mt-6 flex justify-center">
          <ConnectButton />
        </div>
      </div>
    );
  }

  // ── 2. Hub not deployed on this chain ────────────────────────────────────
  if (!hubAddress) {
    return (
      <InfoBanner tone="warn" title="Protocol not deployed on this chain">
        SubSmart is not yet deployed on this network. Switch to Polygon Mainnet
        or Polygon Amoy (testnet) to view your subscriptions.
      </InfoBanner>
    );
  }

  // ── 3. Loading ───────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <InfoBanner tone="info" spinner title="Loading your subscriptions…">
        Reading on-chain state — this takes a moment on first load.
      </InfoBanner>
    );
  }

  // ── 4. RPC / fetch error ─────────────────────────────────────────────────
  if (error) {
    return (
      <div
        role="alert"
        className="rounded-2xl border border-rose-300/25 bg-rose-500/[0.07] p-5 text-sm"
      >
        <p className="font-medium text-white">Failed to load subscriptions</p>
        <p className="mt-1 break-words text-rose-100/80">{error}</p>
        <button
          type="button"
          onClick={refetch}
          className="mt-3 inline-flex min-h-[40px] items-center justify-center rounded-xl border border-rose-300/30 bg-rose-500/10 px-4 text-xs font-medium text-rose-100 transition hover:bg-rose-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
        >
          Retry
        </button>
      </div>
    );
  }

  // ── 5. Empty state ───────────────────────────────────────────────────────
  if (subscriptions.length === 0) {
    return (
      <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-center sm:p-12">
        <ReceiptIcon />
        <h2 className="mt-4 text-base font-semibold text-white sm:text-lg">
          No active subscriptions
        </h2>
        <p className="mt-2 text-sm text-white/55">
          You don&apos;t have any active SubSmart subscriptions on this chain.
          Ask your merchant for a checkout link to subscribe.
        </p>
      </div>
    );
  }

  // ── 6. Subscription grid ─────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <p className="text-xs text-white/40">
        {subscriptions.length} active subscription
        {subscriptions.length === 1 ? "" : "s"} on this chain
      </p>
      <ul className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2" role="list">
        {subscriptions.map((entry) => (
          <li key={`${entry.planId}-${entry.subscriptionId}`}>
            <SubscriptionCard
              entry={entry}
              onCancelled={handleCancelled}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Shared UI primitives ───────────────────────────────────────────────────

const TONE_STYLES = {
  info: "border-indigo-300/20 bg-indigo-500/[0.07] text-indigo-100",
  warn: "border-amber-300/25 bg-amber-500/[0.07] text-amber-100",
} as const;

function InfoBanner({
  tone,
  title,
  children,
  spinner = false,
}: {
  tone: keyof typeof TONE_STYLES;
  title: string;
  children?: React.ReactNode;
  spinner?: boolean;
}): JSX.Element {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`rounded-2xl border p-5 text-sm ${TONE_STYLES[tone]}`}
    >
      <div className="flex items-center gap-2">
        {spinner && <Spinner />}
        <span className="font-medium text-white">{title}</span>
      </div>
      {children && <p className="mt-2 text-white/70">{children}</p>}
    </div>
  );
}

function Spinner(): JSX.Element {
  return (
    <svg
      className="h-4 w-4 animate-spin text-white/80"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
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

function WalletIcon(): JSX.Element {
  return (
    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500/15 text-indigo-300 ring-1 ring-inset ring-indigo-300/30">
      <svg
        viewBox="0 0 24 24"
        className="h-7 w-7"
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
    </div>
  );
}

function ReceiptIcon(): JSX.Element {
  return (
    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white/5 text-white/30 ring-1 ring-inset ring-white/10">
      <svg
        viewBox="0 0 24 24"
        className="h-7 w-7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
        />
      </svg>
    </div>
  );
}
