import { http, fallback, createConfig } from "wagmi";
import { polygon, polygonAmoy } from "viem/chains";
import { injected, coinbaseWallet } from "wagmi/connectors";
import type { CreateConnectorFn } from "wagmi";

/**
 * wagmi v2 configuration for SubSmart V2.0.
 *
 * Per docs/3_AI_CODING_GUIDELINES.md §4.4:
 * - At least two RPC transports per chain via `fallback([...])`.
 * - Only public RPC URLs may live in client code (NEXT_PUBLIC_*).
 * - Keyed providers must be proxied server-side; not configured here.
 *
 * WalletConnect is intentionally NOT imported statically. It pulls in a large
 * @reown/appkit dependency tree and requires a project id. When you have a
 * WalletConnect project id, set NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID and add
 * the connector via a dynamic import here.
 *
 * RPC selection rationale (Amoy) — browser CORS-safe endpoints only:
 *  - rpc.ankr.com/polygon_amoy — PRIMARY. High-capacity multi-cloud node,
 *    confirmed CORS-safe, no API key required. Previous rate-limit exposure
 *    was caused by the infinite re-render loop (now fixed), not the endpoint.
 *  - rpc-amoy.polygon.technology — FALLBACK. Polygon's official gateway;
 *    confirmed CORS-safe. Used only as a secondary in case Ankr is unavailable.
 *  - polygon-amoy.g.alchemy.com/v2/demo — excluded: enforces strict CORS,
 *    blocks browser fetch with no Access-Control-Allow-Origin header.
 *  - polygon-amoy-bor-rpc.publicnode.com — excluded: CORS-blocked in browser.
 *  - matic-amoy.api.onfinality.io/public — excluded: CORS-blocked in browser.
 *  - polygon-amoy.blockpi.network/v1/rpc/public — excluded: CORS-blocked.
 *  - polygon-amoy.drpc.org — excluded: requires an API key (HTTP 400).
 */

const APP_NAME = "SubSmart V2.0";
// Ensure we use relative paths for client-side API requests to prevent CORS errors on Vercel.
// On the server, we need absolute paths (using Vercel's URL if available).
export function getBaseUrl(): string {
  if (typeof window !== "undefined") return ""; // browser should use relative url
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.trim();
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

const APP_URL = getBaseUrl();

/**
 * Shared http() options.
 *
 * retryCount: 2 — two automatic retries per endpoint. Combined with the
 *   fallback() chain this gives the simulation plenty of runway without
 *   hammering a single node.
 *
 * timeout: 20_000 — 20 s per attempt. Amoy public nodes can be slow to
 *   execute eth_call simulations; 6 s was causing false "HTTP request failed"
 *   network errors before the node had time to respond.
 *
 * retryDelay: 500 — brief pause between retries to avoid thundering-herd on
 *   a node that is momentarily overloaded.
 */
const RPC_OPTIONS = {
  retryCount: 2,
  retryDelay: 500,
  timeout: 15_000,
} as const;

function buildConnectors(): CreateConnectorFn[] {
  return [
    injected({ shimDisconnect: true }),
    coinbaseWallet({
      appName: APP_NAME,
      appLogoUrl: `${APP_URL}/icon.png`,
    }),
  ];
}

export const wagmiConfig = createConfig({
  chains: [polygon, polygonAmoy],
  connectors: buildConnectors(),
  ssr: true,
  /**
   * Multicall batching: bundle parallel eth_call reads (balance, allowance,
   * nonce probes) into a single Multicall3 request. Cuts RPC round-trips and
   * reduces rate-limit exposure on the permit-preparation phase.
   */
  batch: { multicall: true },
  /**
   * Global polling interval (ms). Wagmi polls on-chain state (balances,
   * block number, etc.) at this cadence. 6 000 ms matches Polygon's ~6 s
   * block time, reducing unnecessary RPC calls and rate-limit exposure
   * compared to the default 4 000 ms.
   */
  pollingInterval: 6_000,
  transports: {
    [polygon.id]: fallback([
      http("https://polygon-rpc.com", RPC_OPTIONS),
      http("https://rpc.ankr.com/polygon", RPC_OPTIONS),
      http("https://polygon-bor-rpc.publicnode.com", RPC_OPTIONS),
    ]),
    [polygonAmoy.id]: fallback([
      // Primary: Ankr — confirmed CORS-safe, high-capacity, no API key.
      http("https://rpc.ankr.com/polygon_amoy", RPC_OPTIONS),
      // Fallback: Polygon's official gateway — confirmed CORS-safe.
      http("https://rpc-amoy.polygon.technology", RPC_OPTIONS),
    ]),
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
