"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ── Slide metadata ─────────────────────────────────────────────────────────────

const SLIDES = [
  { id: "hero",     label: "Intro"    },
  { id: "problem",  label: "Problem"  },
  { id: "solution", label: "Solution" },
  { id: "builder",  label: "Builder"  },
  { id: "ask",      label: "The Ask"  },
] as const;

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DeckPage(): JSX.Element {
  const [current, setCurrent] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Intersection observer: animation triggers + active dot ───────────────
  useEffect(() => {
    // 1. Scroll-reveal: add .in-view to [data-animate] when entering viewport
    const animEls = document.querySelectorAll("[data-animate]");
    const animObs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) e.target.classList.add("in-view");
        });
      },
      { threshold: 0.12 }
    );
    animEls.forEach((el) => animObs.observe(el));

    // 2. Active slide tracking for nav dots
    const sections = document.querySelectorAll("[data-slide-index]");
    const slideObs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setCurrent(
              Number((e.target as HTMLElement).dataset.slideIndex)
            );
          }
        });
      },
      { threshold: 0.5 }
    );
    sections.forEach((s) => slideObs.observe(s));

    return () => {
      animObs.disconnect();
      slideObs.disconnect();
    };
  }, []);

  // ── Keyboard navigation ───────────────────────────────────────────────────
  const goTo = useCallback((index: number) => {
    const clamped = Math.max(0, Math.min(SLIDES.length - 1, index));
    document
      .querySelector(`[data-slide-index="${clamped}"]`)
      ?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === "ArrowDown" || e.key === "PageDown") {
        e.preventDefault();
        goTo(current + 1);
      }
      if (e.key === "ArrowUp" || e.key === "PageUp") {
        e.preventDefault();
        goTo(current - 1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, goTo]);

  return (
    // Full-screen scroll-snap container
    <div
      ref={containerRef}
      className="fixed inset-0 overflow-y-scroll"
      style={{ scrollSnapType: "y mandatory" }}
    >
      {/* ── S1: Hero ──────────────────────────────────────────────────────── */}
      <section
        data-slide-index="0"
        className="relative flex h-[100dvh] flex-col items-center justify-center overflow-hidden px-6"
        style={{ scrollSnapAlign: "start" }}
      >
        {/* Radial glow — indigo */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{
            width: "900px",
            height: "600px",
            background:
              "radial-gradient(ellipse at center, rgba(99,102,241,0.18) 0%, transparent 70%)",
          }}
        />

        <div className="relative z-10 mx-auto max-w-4xl text-center">
          {/* Badge */}
          <div
            data-animate
            className="mb-8 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-1.5 text-[11px] uppercase tracking-[0.2em] text-white/50"
          >
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-400 shadow-[0_0_8px_rgba(99,102,241,0.9)]" />
            Polygon Amoy · Testnet Live
          </div>

          {/* Title */}
          <h1
            data-animate
            data-delay="200"
            className="bg-gradient-to-b from-white via-white to-white/40 bg-clip-text text-[clamp(3.5rem,10vw,8rem)] font-bold leading-[0.95] tracking-tight text-transparent"
          >
            SubSmart
            <br />
            Protocol
          </h1>

          {/* Subtitle */}
          <p
            data-animate
            data-delay="400"
            className="mx-auto mt-8 max-w-xl text-[clamp(1rem,2.5vw,1.25rem)] leading-relaxed text-white/50"
          >
            Decentralized, non-custodial recurring billing — on-chain.
            <br />
            <span className="text-white/30">
              No escrow. No intermediaries. No compromises.
            </span>
          </p>

          {/* Chain pill */}
          <div
            data-animate
            data-delay="600"
            className="mt-10 inline-flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.03] px-5 py-2.5"
          >
            <span className="font-mono text-xs text-white/30">Contract</span>
            <span className="font-mono text-xs text-white/60">
              0xBB05…505a
            </span>
            <span className="h-1 w-1 rounded-full bg-white/20" />
            <span className="font-mono text-xs text-emerald-400">
              Deployed
            </span>
          </div>

          {/* Scroll hint */}
          <div
            data-animate
            data-delay="700"
            className="mt-16 flex flex-col items-center gap-2"
          >
            <span className="text-[10px] uppercase tracking-[0.25em] text-white/20">
              Scroll to explore
            </span>
            <svg
              className="h-4 w-4 animate-bounce text-white/20"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </div>
        </div>
      </section>

      {/* ── S2: Problem ───────────────────────────────────────────────────── */}
      <section
        data-slide-index="1"
        className="relative flex h-[100dvh] flex-col justify-center overflow-hidden px-6 py-16"
        style={{ scrollSnapAlign: "start" }}
      >
        {/* Glow — rose */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-32 top-1/2 -translate-y-1/2"
          style={{
            width: "700px",
            height: "500px",
            background:
              "radial-gradient(ellipse at left, rgba(244,63,94,0.12) 0%, transparent 65%)",
          }}
        />

        <div className="relative z-10 mx-auto w-full max-w-5xl">
          {/* Eyebrow */}
          <p
            data-animate
            className="mb-4 text-[11px] uppercase tracking-[0.2em] text-rose-400/70"
          >
            The Problem
          </p>

          {/* Headline */}
          <h2
            data-animate
            data-delay="100"
            className="max-w-2xl bg-gradient-to-b from-white to-white/60 bg-clip-text text-[clamp(2.5rem,6vw,5rem)] font-bold leading-[1.0] tracking-tight text-transparent"
          >
            Web3 Can&apos;t
            <br />
            Bill Customers.
          </h2>

          <p
            data-animate
            data-delay="200"
            className="mt-6 max-w-lg text-base leading-relaxed text-white/45 sm:text-lg"
          >
            Every SaaS product runs on recurring revenue. Web3 has none of the
            infrastructure to support it — until now.
          </p>

          {/* Pain point cards */}
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {[
              {
                icon: "🔒",
                title: "Custodial Escrow",
                body: "Existing protocols lock merchant funds in smart contract vaults, introducing counterparty risk and capital inefficiency.",
                delay: "300",
              },
              {
                icon: "⛽",
                title: "Gas-Intensive Loops",
                body: "On-chain recurring payment bots require continuous gas funding, making unit economics impossible at scale.",
                delay: "400",
              },
              {
                icon: "🏦",
                title: "Centralized Operators",
                body: "Most Web3 billing solutions depend on off-chain infrastructure — defeating the entire purpose of the chain.",
                delay: "500",
              },
            ].map((card) => (
              <div
                key={card.title}
                data-animate
                data-delay={card.delay}
                className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5"
              >
                <span className="text-2xl">{card.icon}</span>
                <h3 className="mt-3 text-sm font-semibold text-white/80">
                  {card.title}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-white/35">
                  {card.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── S3: Solution ──────────────────────────────────────────────────── */}
      <section
        data-slide-index="2"
        className="relative flex h-[100dvh] flex-col justify-center overflow-hidden px-6 py-16"
        style={{ scrollSnapAlign: "start" }}
      >
        {/* Glow — emerald */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-32 top-1/2 -translate-y-1/2"
          style={{
            width: "700px",
            height: "500px",
            background:
              "radial-gradient(ellipse at right, rgba(52,211,153,0.12) 0%, transparent 65%)",
          }}
        />

        <div className="relative z-10 mx-auto w-full max-w-5xl">
          <p
            data-animate
            className="mb-4 text-[11px] uppercase tracking-[0.2em] text-emerald-400/70"
          >
            The Solution
          </p>

          <h2
            data-animate
            data-delay="100"
            className="max-w-3xl bg-gradient-to-b from-white to-white/60 bg-clip-text text-[clamp(2.5rem,6vw,5rem)] font-bold leading-[1.0] tracking-tight text-transparent"
          >
            EIP-2612 Permits.
            <br />
            Immutable Contracts.
          </h2>

          <p
            data-animate
            data-delay="200"
            className="mt-6 max-w-lg text-base leading-relaxed text-white/45 sm:text-lg"
          >
            The subscriber signs one gasless permit authorizing{" "}
            <em className="not-italic text-white/70">exactly N cycles</em>.
            The merchant calls <code className="rounded bg-white/[0.07] px-1.5 py-0.5 font-mono text-xs text-emerald-300">charge()</code> when due.
            That&apos;s the entire protocol.
          </p>

          {/* Feature grid */}
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {[
              {
                accent: "text-emerald-400",
                border: "border-emerald-400/15",
                bg: "bg-emerald-500/[0.06]",
                title: "Zero Lockup",
                body: "Funds stay in the subscriber's wallet between cycles. Merchants receive payment instantly on charge — no escrow, no waiting.",
                delay: "300",
              },
              {
                accent: "text-indigo-400",
                border: "border-indigo-400/15",
                bg: "bg-indigo-500/[0.06]",
                title: "Bounded by Design",
                body: "cyclesAuthorized is immutable at subscription creation. Merchants cannot charge more than the subscriber approved. Ever.",
                delay: "400",
              },
              {
                accent: "text-violet-400",
                border: "border-violet-400/15",
                bg: "bg-violet-500/[0.06]",
                title: "Non-Custodial",
                body: "SubSmart never holds funds. The smart contract is a billing coordinator, not a bank. Merchants own every dollar from block one.",
                delay: "500",
              },
            ].map((card) => (
              <div
                key={card.title}
                data-animate
                data-delay={card.delay}
                className={`rounded-2xl border ${card.border} ${card.bg} p-5`}
              >
                <h3 className={`text-sm font-semibold ${card.accent}`}>
                  {card.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-white/40">
                  {card.body}
                </p>
              </div>
            ))}
          </div>

          {/* Tech stack pills */}
          <div
            data-animate
            data-delay="600"
            className="mt-8 flex flex-wrap gap-2"
          >
            {[
              "EIP-2612 Gasless Permit",
              "Polygon Amoy",
              "Solidity 0.8",
              "Next.js 14",
              "wagmi v2 / viem",
              "USDC",
            ].map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-white/[0.07] bg-white/[0.03] px-3 py-1 text-[11px] text-white/35"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── S4: Builder ───────────────────────────────────────────────────── */}
      <section
        data-slide-index="3"
        className="relative flex h-[100dvh] flex-col items-center justify-center overflow-hidden px-6 py-16"
        style={{ scrollSnapAlign: "start" }}
      >
        {/* Glow — violet */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{
            width: "800px",
            height: "600px",
            background:
              "radial-gradient(ellipse at center, rgba(139,92,246,0.15) 0%, transparent 65%)",
          }}
        />

        <div className="relative z-10 mx-auto w-full max-w-4xl text-center">
          <p
            data-animate
            className="mb-4 text-[11px] uppercase tracking-[0.2em] text-violet-400/70"
          >
            The Builder
          </p>

          <h2
            data-animate
            data-delay="100"
            className="bg-gradient-to-b from-white to-white/60 bg-clip-text text-[clamp(2.5rem,6vw,5rem)] font-bold leading-[1.0] tracking-tight text-transparent"
          >
            One iPhone.
            <br />
            One Student.
            <br />
            <span className="text-[clamp(2rem,4.5vw,4rem)]">
              Absolute Execution.
            </span>
          </h2>

          {/* Quote block */}
          <div
            data-animate
            data-delay="300"
            className="mx-auto mt-10 max-w-2xl rounded-3xl border border-violet-300/10 bg-violet-500/[0.04] p-7"
          >
            <p className="text-base leading-relaxed text-white/55 sm:text-lg">
              &ldquo;Built entirely on an iPhone by a{" "}
              <span className="text-white/85 font-medium">
                19-year-old solo BBA student
              </span>{" "}
              using AI-augmented development. Non-technical founder. No CS
              degree. No team. Production-grade Web3 protocol shipped in
              weeks.&rdquo;
            </p>
          </div>

          {/* Stat row */}
          <div
            data-animate
            data-delay="500"
            className="mt-8 flex flex-wrap justify-center gap-6 sm:gap-10"
          >
            {[
              { value: "1",      label: "Developer"         },
              { value: "100%",   label: "AI-Augmented"      },
              { value: "0",      label: "VC Backing (yet)"  },
              { value: "∞",      label: "Conviction"        },
            ].map((s) => (
              <div key={s.label} className="flex flex-col items-center gap-1">
                <span className="text-3xl font-bold text-white/90 tabular-nums sm:text-4xl">
                  {s.value}
                </span>
                <span className="text-[11px] uppercase tracking-wider text-white/30">
                  {s.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── S5: The Ask ───────────────────────────────────────────────────── */}
      <section
        data-slide-index="4"
        className="relative flex h-[100dvh] flex-col items-center justify-center overflow-hidden px-6 py-16"
        style={{ scrollSnapAlign: "start" }}
      >
        {/* Glow — amber */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{
            width: "800px",
            height: "600px",
            background:
              "radial-gradient(ellipse at center, rgba(251,191,36,0.1) 0%, transparent 65%)",
          }}
        />

        <div className="relative z-10 mx-auto w-full max-w-4xl text-center">
          <p
            data-animate
            className="mb-4 text-[11px] uppercase tracking-[0.2em] text-amber-400/70"
          >
            The Ask
          </p>

          {/* Big number */}
          <div data-animate data-delay="100">
            <span className="block bg-gradient-to-b from-amber-200 via-amber-300 to-amber-400/50 bg-clip-text text-[clamp(4rem,14vw,11rem)] font-bold leading-none tracking-tight text-transparent">
              $10k
            </span>
            <p className="mt-2 text-base text-white/40 sm:text-lg">
              Seed Round · Pre-Revenue · Pre-Audit
            </p>
          </div>

          {/* Use of funds */}
          <div
            data-animate
            data-delay="300"
            className="mx-auto mt-10 grid max-w-xl gap-4 sm:grid-cols-2"
          >
            {[
              {
                pct: "70%",
                title: "ScaleBit Tier-1 Audit",
                body: "Institutional-grade smart contract security review. Required for mainnet launch and exchange listings.",
                accent: "border-amber-400/15 bg-amber-500/[0.05]",
                label: "text-amber-300",
              },
              {
                pct: "30%",
                title: "Legal Incorporation",
                body: "Delaware C-Corp or Wyoming DAO LLC. Enables compliant VC term sheets and protects the protocol IP.",
                accent: "border-white/[0.07] bg-white/[0.025]",
                label: "text-white/60",
              },
            ].map((item) => (
              <div
                key={item.title}
                className={`rounded-2xl border ${item.accent} p-5 text-left`}
              >
                <span
                  className={`text-2xl font-bold tabular-nums ${item.label}`}
                >
                  {item.pct}
                </span>
                <h3 className="mt-2 text-sm font-semibold text-white/75">
                  {item.title}
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-white/35">
                  {item.body}
                </p>
              </div>
            ))}
          </div>

          {/* CTA */}
          <div
            data-animate
            data-delay="500"
            className="mt-10 flex flex-col items-center gap-3"
          >
            <p className="text-sm text-white/30">
              Grant applications open. Angel introductions welcome.
            </p>
            <a
              href="mailto:hello@subsmart.xyz"
              className="inline-flex min-h-[48px] items-center gap-2 rounded-2xl bg-white px-6 text-sm font-semibold text-black transition hover:bg-white/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black"
            >
              Get in touch
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M17 8l4 4m0 0l-4 4m4-4H3"
                />
              </svg>
            </a>
          </div>
        </div>
      </section>

      {/* ── Navigation dots ──────────────────────────────────────────────── */}
      <nav
        aria-label="Slide navigation"
        className="fixed right-5 top-1/2 z-50 flex -translate-y-1/2 flex-col gap-3 sm:right-8"
      >
        {SLIDES.map((slide, i) => (
          <button
            key={slide.id}
            type="button"
            aria-label={`Go to ${slide.label}`}
            onClick={() => goTo(i)}
            className={[
              "rounded-full transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50",
              i === current
                ? "h-6 w-1.5 bg-white"
                : "h-1.5 w-1.5 bg-white/25 hover:bg-white/50",
            ].join(" ")}
          />
        ))}
      </nav>

      {/* ── Slide counter ─────────────────────────────────────────────────── */}
      <div
        aria-hidden="true"
        className="fixed bottom-6 left-6 z-50 flex items-end gap-1 tabular-nums sm:bottom-8 sm:left-8"
      >
        <span className="text-xl font-semibold leading-none text-white/60">
          {String(current + 1).padStart(2, "0")}
        </span>
        <span className="mb-0.5 text-sm leading-none text-white/20">
          /{String(SLIDES.length).padStart(2, "0")}
        </span>
      </div>
    </div>
  );
}
