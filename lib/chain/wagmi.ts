import { http, fallback, createConfig } from "wagmi";
import { polygon, polygonAmoy } from "viem/chains";
import { injected, coinbaseWallet } from "wagmi/connectors";
import type { CreateConnectorFn } from "wagmi";

/**
 * wagmi v2 configuration for SubSmart V2.0.
 *
 * Per docs/3_AI_CODING_GUIDELINES.md §4.4:
 *  - At least two RPC transports per chain via `fallback([...])`.
 *  - Only public RPC URLs may live in client code (NEXT_PUBLIC_*).
 *  - Keyed providers must be proxied server-side; not configured here.
 *
 * WalletConnect is intentionally NOT imported statically. It pulls in a large
 * @reown/appkit dependency tree and requires a project id. When you have a
 * WalletConnect project id, set NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID and add
 * the connector via a dynamic import here.
 */

const APP_NAME = "SubSmart V2.0";
const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://app.subsmart.xyz";

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
  transports: {
    [polygon.id]: fallback([
      http("https://polygon-rpc.com"),
      http("https://rpc.ankr.com/polygon"),
      http(),
    ]),
    [polygonAmoy.id]: fallback([
      http("https://rpc-amoy.polygon.technology"),
      http("https://polygon-amoy-bor-rpc.publicnode.com"),
      http(),
    ]),
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
