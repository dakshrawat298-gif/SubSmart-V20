import { ConnectButton } from "@/components/web3/ConnectButton";

export default function Home() {
  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <BackgroundDecor />

      <header className="relative flex items-center justify-between gap-3 px-4 py-4 sm:px-8 sm:py-6">
        <div className="flex min-w-0 items-center gap-2">
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
          <span className="truncate text-sm font-semibold tracking-wide text-white sm:text-base">
            SubSmart
            <span className="ml-1 rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] font-normal text-white/60">
              V2.0
            </span>
          </span>
        </div>
        <div className="shrink-0">
          <ConnectButton />
        </div>
      </header>

      <main className="relative mx-auto flex max-w-3xl flex-col items-center px-4 pb-20 pt-10 text-center sm:px-6 sm:pt-20">
        <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-widest text-white/70 sm:text-xs">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.8)]" />
          Wallet foundation ready
        </span>
        <h1 className="bg-gradient-to-b from-white to-white/70 bg-clip-text text-4xl font-semibold leading-[1.05] tracking-tight text-transparent sm:text-6xl">
          Recurring billing,
          <br className="hidden sm:block" /> on-chain. Non-custodial.
        </h1>
        <p className="mt-5 max-w-xl text-sm leading-relaxed text-white/65 sm:text-base">
          One signature. Bounded permits. Decentralized auto-settlement on
          Polygon. Funds move directly from customer to merchant — never through
          us.
        </p>

        <div className="mt-10 flex w-full flex-col items-stretch gap-4 sm:mt-8 sm:flex-row sm:items-center sm:justify-center sm:gap-3">
          <ConnectButton />
          <a
            href="#"
            className="inline-flex h-12 w-full items-center justify-center rounded-full border border-white/10 bg-white/[0.03] px-5 text-sm text-white/85 transition hover:border-white/20 hover:bg-white/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 sm:h-12 sm:w-auto sm:px-6 sm:text-base"
          >
            Read the docs
          </a>
        </div>

        <div className="mt-14 grid w-full grid-cols-1 gap-3 text-left sm:grid-cols-3">
          <FeatureCard
            title="Bounded permits"
            body="EIP-2612 signatures capped per cycle. No infinite approvals, ever."
          />
          <FeatureCard
            title="Auto-settlement"
            body="Gelato relayers pull on schedule. Customers stay offline."
          />
          <FeatureCard
            title="Cancel anytime"
            body="One on-chain call kills future charges immediately."
          />
        </div>
      </main>
    </div>
  );
}

function FeatureCard({
  title,
  body,
}: {
  title: string;
  body: string;
}): JSX.Element {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur sm:p-5">
      <div className="text-sm font-medium text-white">{title}</div>
      <div className="mt-1 text-xs leading-relaxed text-white/60 sm:text-sm">
        {body}
      </div>
    </div>
  );
}

function BackgroundDecor(): JSX.Element {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
      <div className="absolute -left-40 -top-40 h-[420px] w-[420px] rounded-full bg-indigo-600/25 blur-3xl" />
      <div className="absolute -right-40 top-40 h-[420px] w-[420px] rounded-full bg-fuchsia-600/20 blur-3xl" />
      <div
        className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage:
            "radial-gradient(ellipse at top, rgba(0,0,0,0.6), transparent 70%)",
          WebkitMaskImage:
            "radial-gradient(ellipse at top, rgba(0,0,0,0.6), transparent 70%)",
        }}
      />
    </div>
  );
}
