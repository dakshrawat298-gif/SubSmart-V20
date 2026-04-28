import { polygon, polygonAmoy } from "viem/chains";
import type { Chain } from "viem";

/**
 * Supported chains for SubSmart V2.0.
 * Polygon mainnet is the production target; Amoy is the testnet.
 * See docs/2_SYSTEM_DESIGN.md §6 (Network & Token Support).
 */
export const SUPPORTED_CHAINS = [polygon, polygonAmoy] as const satisfies readonly Chain[];

export const SUPPORTED_CHAIN_IDS: ReadonlyArray<number> = SUPPORTED_CHAINS.map(
  (c) => c.id
);

export const DEFAULT_CHAIN = polygon;

export function isSupportedChainId(chainId: number | undefined): boolean {
  if (chainId === undefined) return false;
  return SUPPORTED_CHAIN_IDS.includes(chainId);
}

export function getChainById(chainId: number | undefined): Chain | undefined {
  if (chainId === undefined) return undefined;
  return SUPPORTED_CHAINS.find((c) => c.id === chainId);
}
