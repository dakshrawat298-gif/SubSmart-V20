"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { useConnect, type Connector } from "wagmi";
import { Portal } from "./Portal";

type WalletModalProps = {
  open: boolean;
  onClose: () => void;
};

/**
 * Premium dark-mode wallet picker rendered via a Portal so it always escapes
 * ancestor stacking/overflow traps. Mobile-first: full-width sheet on small
 * screens, centered card on >= sm. Touch targets >= 44px.
 *
 * Scroll-lock contract:
 *  - body overflow is restored unconditionally on every unmount/cleanup path
 *    (success, cancel, error, route change). See useLayoutEffect below.
 */
export function WalletModal({ open, onClose }: WalletModalProps): JSX.Element | null {
  const { connectors, connect, status, error, variables, reset } = useConnect();
  const isPendingAny = status === "pending";
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // Bulletproof scroll lock: always restore on cleanup, regardless of how the
  // modal closes (success, error, route change, force-unmount). Uses
  // useLayoutEffect so DOM mutations happen synchronously with mount/unmount.
  useLayoutEffect(() => {
    if (!open) return;
    const body = document.body;
    const html = document.documentElement;
    const prevBody = body.style.overflow;
    const prevHtml = html.style.overflow;
    body.style.overflow = "hidden";
    html.style.overflow = "hidden";
    return () => {
      body.style.overflow = prevBody;
      html.style.overflow = prevHtml;
    };
  }, [open]);

  // Defensive: if this component ever unmounts entirely (route change, parent
  // remount), wipe any lingering inline overflow so the page can scroll again.
  useEffect(() => {
    return () => {
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
    };
  }, []);

  // Escape-to-close, even mid-connection, so users are never trapped.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  const handleConnect = (connector: Connector): void => {
    reset();
    connect(
      { connector },
      {
        onSuccess: () => closeRef.current(),
      }
    );
  };

  const handleClose = (): void => {
    // Do NOT block closing on a pending mutation. The wagmi mutation will
    // resolve in the background; closing the UI must always work so mobile
    // users are never frozen.
    closeRef.current();
  };

  return (
    <Portal>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="wallet-modal-title"
        className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center"
      >
        <button
          type="button"
          aria-label="Close wallet picker"
          onClick={handleClose}
          className="absolute inset-0 h-full w-full cursor-default bg-black/80 backdrop-blur-md"
        />
        <div className="relative z-[101] w-full max-w-md overflow-hidden rounded-t-3xl border border-white/10 bg-[#0d1228] shadow-[0_30px_120px_-20px_rgba(99,102,241,0.45)] sm:rounded-3xl">
          <div className="flex items-start justify-between gap-4 border-b border-white/5 px-5 py-4 sm:px-6 sm:py-5">
            <div>
              <h2
                id="wallet-modal-title"
                className="text-base font-semibold text-white sm:text-lg"
              >
                Connect a wallet
              </h2>
              <p className="mt-1 text-xs text-white/60 sm:text-sm">
                Choose how you want to sign in. SubSmart never holds your funds.
              </p>
            </div>
            <button
              type="button"
              onClick={handleClose}
              aria-label="Close"
              className="-m-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white/60 transition hover:bg-white/5 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>

          <ul className="flex flex-col gap-2 px-3 py-3 sm:px-4 sm:py-4">
            {connectors.length === 0 && (
              <li className="px-3 py-6 text-center text-sm text-white/60">
                No wallet connectors available.
              </li>
            )}
            {connectors.map((connector) => {
              const isPending =
                isPendingAny && variables?.connector === connector;
              return (
                <li key={connector.uid}>
                  <button
                    type="button"
                    onClick={() => handleConnect(connector)}
                    disabled={isPendingAny}
                    className="group flex min-h-[56px] w-full items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3 text-left transition hover:border-indigo-400/40 hover:bg-white/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/30 to-fuchsia-500/20 text-indigo-200 ring-1 ring-inset ring-white/10">
                      <ConnectorIcon connector={connector} />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-medium text-white">
                        {connector.name}
                      </span>
                      <span className="truncate text-xs text-white/50">
                        {isPending ? "Approve in your wallet…" : connectorSubtitle(connector)}
                      </span>
                    </span>
                    {isPending ? (
                      <Spinner />
                    ) : (
                      <svg
                        viewBox="0 0 24 24"
                        className="h-4 w-4 text-white/40 transition group-hover:translate-x-0.5 group-hover:text-white/80"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        aria-hidden="true"
                      >
                        <path strokeLinecap="round" d="M9 6l6 6-6 6" />
                      </svg>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>

          {error && (
            <div
              role="alert"
              className="mx-4 mb-3 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200 sm:mx-5"
            >
              {error.message}
            </div>
          )}

          {isPendingAny && (
            <div className="mx-4 mb-3 flex items-center justify-between gap-3 rounded-xl border border-indigo-400/20 bg-indigo-500/10 px-3 py-2 text-xs text-indigo-100 sm:mx-5">
              <span>Waiting for your wallet…</span>
              <button
                type="button"
                onClick={() => {
                  reset();
                  closeRef.current();
                }}
                className="min-h-[36px] rounded-lg bg-white/10 px-3 text-xs font-medium text-white transition hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
              >
                Cancel
              </button>
            </div>
          )}

          <div className="border-t border-white/5 px-5 py-3 text-center text-[11px] text-white/40 sm:text-xs">
            By connecting you agree to SubSmart&apos;s non-custodial Terms.
          </div>
        </div>
      </div>
    </Portal>
  );
}

function connectorSubtitle(connector: Connector): string {
  switch (connector.type) {
    case "injected":
      return "Browser extension wallet";
    case "walletConnect":
      return "Scan with a mobile wallet";
    case "coinbaseWallet":
      return "Coinbase Wallet & Smart Wallet";
    default:
      return "Connect via " + connector.type;
  }
}

function ConnectorIcon({ connector }: { connector: Connector }): JSX.Element {
  if (connector.icon) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={connector.icon}
        alt=""
        className="h-6 w-6 rounded"
        aria-hidden="true"
      />
    );
  }
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
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

function Spinner(): JSX.Element {
  return (
    <svg
      className="h-4 w-4 animate-spin text-white/70"
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
