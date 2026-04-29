import type { Address } from "viem";
import { getAddress } from "viem";
import { polygon, polygonAmoy } from "viem/chains";
import billingHubAbiJson from "./abis/BillingHub.json";

/**
 * BillingHub ABI, generated 1:1 from the Foundry build artifact at
 * `contracts/out/BillingHub.sol/BillingHub.json`. Re-export it `as const` so
 * wagmi/viem can fully infer argument and return types end-to-end — never
 * re-declare these by hand (per AI guidelines §2 / §1.3).
 *
 * If the contract changes, regenerate the JSON file from the artifact instead
 * of editing this file. The JSON file is intentionally checked in so the
 * frontend build never depends on Foundry being available in CI.
 */
export const billingHubAbi = billingHubAbiJson as Abi;

// `Abi` import-style re-binding — exported lazily so this module has no
// runtime dependency on viem's type-only `Abi` symbol at JSON load time.
import type { Abi } from "viem";

/**
 * Per-chain `BillingHub` contract address, sourced from public env vars at
 * build time. Per AI guidelines §0.5, the UI must NOT silently fall back to
 * fake or hard-coded addresses — when the env var for the active chain is
 * unset, callers MUST surface an explicit "EnvUnavailable" UI state.
 *
 * - Polygon mainnet: `NEXT_PUBLIC_BILLING_HUB_ADDRESS_POLYGON`
 * - Polygon Amoy testnet: `NEXT_PUBLIC_BILLING_HUB_ADDRESS_AMOY`
 *
 * Addresses are checksummed via `getAddress()` so a typo in `.env.local`
 * surfaces as a thrown error during module load rather than as a silent
 * mismatch downstream.
 */
function readChecksummed(raw: string | undefined): Address | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;
  return getAddress(trimmed);
}

// Hardcoded BillingHub deployment addresses. Bypasses Next.js public-env-var
// lookup so the frontend always resolves the address regardless of how the
// runtime is started (build-time inlining gotchas, missing .env file, etc).
const ADDRESSES: Readonly<Record<number, Address | undefined>> = {
  [polygon.id]: readChecksummed(
    process.env.NEXT_PUBLIC_BILLING_HUB_ADDRESS_POLYGON
  ),
  [polygonAmoy.id]: getAddress(
    "0x3fD16b4953131c77E3B6A4cc47a2Df46be71BBf4"
  ),
};

/**
 * Resolves the `BillingHub` deployment address for a given chain.
 *
 * Returns `undefined` when the env var is unset for that chain — callers
 * MUST handle this case explicitly (no silent defaults).
 */
export function getBillingHubAddress(
  chainId: number | undefined
): Address | undefined {
  if (chainId === undefined) return undefined;
  return ADDRESSES[chainId];
}
