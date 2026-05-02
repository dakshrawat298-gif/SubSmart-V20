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

/** Shared http() options — retry up to 3 times, 10 s timeout per attempt. */
const RPC_OPTIONS = {
  retryCount: 3,
  retryDelay: 300,
  timeout: 10_000,
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
