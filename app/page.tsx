import { ConnectButton } from "@/components/web3/ConnectButton";

export default function Home() {
  return (
    <div className="relative min-h-screen overflow-x-hidden">
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

