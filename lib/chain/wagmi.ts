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
 * RPC selection rationale (Amoy):
 *  - polygon-amoy.drpc.org was removed — it requires an API key and returns
 *    HTTP 400 on unauthenticated requests, breaking simulateContract calls.
 *  - rpc-amoy.polygon.technology is Polygon's own official gateway; most
 *    reliable for unauthenticated access and the URL used in official docs.
 *  - rpc.ankr.com/polygon_amoy is a well-maintained public multi-cloud node.
 *  - polygon-amoy.blockpi.network/v1/rpc/public is BlockPI's public tier,
 *    included as a third fallback for redundancy.
 */

const APP_NAME = "SubSmart V2.0";
const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://app.subsmart.xyz";

/**
 * Shared http() options.
 *
 * retryCount: 1 — one automatic retry per endpoint before wagmi's fallback()
 *   moves to the next transport. Keeping this low means a bad endpoint fails
 *   fast (≤2 attempts × timeout) rather than spending 4 × 10 s = 40 s on one
 *   dead node before moving on.
 *
 * timeout: 6_000 — 6 s per attempt. Matches Polygon's ~6 s block time and
 *   ensures simulateContract / getLogs errors surface to the UI within ~12 s
 *   (2 attempts × 6 s) rather than the original 80 s worst-case.
 */
const RPC_OPTIONS = {
  retryCount: 1,
  retryDelay: 200,
  timeout: 6_000,
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
      // Primary: Polygon Technology's official Amoy gateway (no API key needed,
      // used in Polygon's own developer docs and .env.example files).
      http("https://rpc-amoy.polygon.technology", RPC_OPTIONS),
      // Secondary: Ankr public multi-cloud node — CORS-friendly.
      http("https://rpc.ankr.com/polygon_amoy", RPC_OPTIONS),
    ]),
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
