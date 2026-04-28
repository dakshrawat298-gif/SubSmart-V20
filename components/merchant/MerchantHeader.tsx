import Link from "next/link";
import { ConnectButton } from "@/components/web3/ConnectButton";

/**
 * Compact merchant-dashboard header. Mirrors the visual language of the
 * landing-page header (gradient mark, glass pill, dark surface) but adds a
 * "Merchant Dashboard" subtitle so the user always knows which surface
 * they're on. Server-rendered — only `ConnectButton` is a client island.
 */
export function MerchantHeader(): JSX.Element {
  return (
    <header className="relative flex items-center justify-between gap-3 px-4 py-4 sm:px-8 sm:py-6">
      <Link
        href="/"
        className="flex min-w-0 items-center gap-2 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
        aria-label="SubSmart home"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white shadow-[0_8px_24px_-8px_rgba(168,85,247,0.7)]">
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 7h12a4 4 0 010 8H8a4 4 0 010-8h8"
            />
          </svg>
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-semibold tracking-wide text-white sm:text-base">
            SubSmart
            <span className="ml-1 rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] font-normal text-white/60">
              V2.0
            </span>
          </span>
          <span className="truncate text-[10px] uppercase tracking-widest text-white/40 sm:text-[11px]">
            Merchant Dashboard
          </span>
        </span>
      </Link>
      <div className="shrink-0">
        <ConnectButton />
      </div>
    </header>
  );
}
