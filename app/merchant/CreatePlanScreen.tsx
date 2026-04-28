"use client";

import { useAccount } from "wagmi";
import { CreatePlanForm } from "@/components/merchant/CreatePlanForm";

/**
 * Client wrapper that gates the create-plan form behind a connected wallet.
 * When no wallet is connected we render a friendly "connect first" panel
 * instead of the form, so the merchant never sees inputs they cannot submit.
 *
 * The unsupported-chain case is already handled globally by `<NetworkGate />`
 * in the root layout — we don't duplicate it here.
 */
export function CreatePlanScreen(): JSX.Element {
  const { isConnected } = useAccount();

  if (!isConnected) {
    return (
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
    );
  }

  return <CreatePlanForm />;
}
