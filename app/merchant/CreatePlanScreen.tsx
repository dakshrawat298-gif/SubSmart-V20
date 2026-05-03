"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import dynamic from "next/dynamic";
import { CreatePlanForm } from "@/components/merchant/CreatePlanForm";
import type { CreatedPlan } from "@/components/merchant/ActivePlansInventory";

// ── Dynamic imports (both components use wagmi hooks + window) ────────────────

const MerchantAnalytics = dynamic(
  () =>
    import("@/components/merchant/MerchantAnalytics").then(
      (m) => m.MerchantAnalytics
    ),
  { ssr: false }
);

// ── localStorage plan loader ──────────────────────────────────────────────────

const STORAGE_KEY = "subsmart_v2_created_plans";
type StoredPlan = Omit<CreatedPlan, "planId"> & { planId: string };

function loadPlansFromStorage(): CreatedPlan[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as StoredPlan[];
    return arr.map((p) => ({ ...p, planId: BigInt(p.planId) }));
  } catch {
    return [];
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Client wrapper for the merchant dashboard.
 *
 * Layout order (Stripe-style — metrics first):
 *   1. MerchantAnalytics  ← high-level KPIs at the top of the page
 *   2. CreatePlanForm     ← action panel below the overview
 *
 * When the wallet is disconnected, MerchantAnalytics returns null internally
 * and we render the connect-wallet gate instead of the form.
 */
export function CreatePlanScreen(): JSX.Element {
  const { isConnected } = useAccount();

  // Load plan names from localStorage once, purely for analytics label
  // enrichment. The analytics hook fetches on-chain data independently.
  const [createdPlans, setCreatedPlans] = useState<CreatedPlan[]>([]);
  useEffect(() => {
    setCreatedPlans(loadPlansFromStorage());
  }, []);

  return (
    <>
      {/* ── Analytics panel — always first, hides itself when disconnected ── */}
      <MerchantAnalytics createdPlans={createdPlans} />

      {/* ── Form / connect gate ─────────────────────────────────────────── */}
      {isConnected ? (
        <CreatePlanForm />
      ) : (
        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 text-center sm:p-8">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/15 text-indigo-300 ring-1 ring-inset ring-indigo-300/30">
            <svg
              viewBox="0 0 24 24"
              className="h-6 w-6"
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
            </svg>
          </div>
          <h2 className="mt-4 text-base font-semibold text-white sm:text-lg">
            Connect your merchant wallet
          </h2>
          <p className="mt-2 text-sm text-white/60">
            The wallet that creates the plan becomes the on-chain recipient of
            every charge. Use the Connect button above to continue.
          </p>
        </div>
      )}
    </>
  );
}
