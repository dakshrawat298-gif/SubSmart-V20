"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@/components/web3/ConnectButton";

type NavItem = {
  readonly href: "/merchant" | "/portal";
  readonly label: string;
  readonly shortLabel: string;
  readonly accent: "indigo" | "fuchsia";
};

const NAV_ITEMS: readonly NavItem[] = [
  {
    href: "/merchant",
    label: "Merchant Dashboard",
    shortLabel: "Merchant",
    accent: "indigo",
  },
  {
    href: "/portal",
    label: "Customer Portal",
    shortLabel: "Customer",
    accent: "fuchsia",
  },
];

/**
 * Global, sticky cyber-tech navigation bar with glassmorphism background.
 * Persists across every route via the root layout. Highlights the active
 * surface using the current pathname so the merchant/customer split is
 * always obvious. Only `ConnectButton` is a client-side island; `usePathname`
 * forces this component into the client tree, which is fine — it's tiny.
 */
export function GlobalNav(): JSX.Element | null {
  const pathname = usePathname() ?? "/";

  if (pathname.startsWith("/checkout")) return null;
  if (pathname.startsWith("/deck")) return null;

  return (
    <header className="sticky top-0 z-40 w-full">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 backdrop-blur-xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[#0b1020]/55"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-px bg-gradient-to-r from-transparent via-indigo-400/40 to-transparent"
      />

      <div className="relative mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4">
        <Link
          href="/"
          aria-label="SubSmart home"
          className="group flex min-w-0 shrink-0 items-center gap-2 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
        >
          <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white shadow-[0_8px_24px_-8px_rgba(168,85,247,0.7)]">
            <span
              aria-hidden="true"
              className="absolute inset-0 rounded-xl bg-gradient-to-br from-indigo-400/40 to-fuchsia-400/40 opacity-0 blur-md transition group-hover:opacity-100"
            />
            <svg
              viewBox="0 0 24 24"
              className="relative h-5 w-5"
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
          <span className="hidden truncate text-sm font-semibold tracking-wide text-white sm:inline">
            SubSmart
            <span className="ml-1 rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] font-normal text-white/60">
              V2.0
            </span>
          </span>
        </Link>

        <nav
          aria-label="Primary"
          className="relative flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur"
        >
          {NAV_ITEMS.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <NavPill
                key={item.href}
                item={item}
                active={active}
              />
            );
          })}
        </nav>

        <div className="shrink-0">
          <ConnectButton />
        </div>
      </div>
    </header>
  );
}

function NavPill({
  item,
  active,
}: {
  item: NavItem;
  active: boolean;
}): JSX.Element {
  const ACCENT_GLOW = {
    indigo:
      "from-indigo-500 via-violet-500 to-indigo-500 shadow-[0_8px_28px_-8px_rgba(99,102,241,0.65)]",
    fuchsia:
      "from-fuchsia-500 via-violet-500 to-fuchsia-500 shadow-[0_8px_28px_-8px_rgba(232,121,249,0.65)]",
  } as const;

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`group relative inline-flex min-h-[36px] items-center justify-center rounded-full px-3 text-xs font-medium transition outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 sm:min-h-[40px] sm:px-4 sm:text-sm ${
        active
          ? "text-white"
          : "text-white/65 hover:text-white"
      }`}
    >
      {active && (
        <span
          aria-hidden="true"
          className={`absolute inset-0 rounded-full bg-gradient-to-r ${ACCENT_GLOW[item.accent]}`}
        />
      )}
      {!active && (
        <span
          aria-hidden="true"
          className="absolute inset-0 rounded-full bg-white/0 transition group-hover:bg-white/[0.06]"
        />
      )}
      <span className="relative inline-flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className={`h-1.5 w-1.5 rounded-full ${
            item.accent === "indigo"
              ? "bg-indigo-300"
              : "bg-fuchsia-300"
          } ${active ? "shadow-[0_0_10px_currentColor]" : "opacity-60"}`}
        />
        <span className="sm:hidden">{item.shortLabel}</span>
        <span className="hidden sm:inline">{item.label}</span>
      </span>
    </Link>
  );
}
