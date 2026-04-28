import { erc20Abi as viemErc20Abi, getAddress, type Address } from "viem";
import { polygon, polygonAmoy } from "viem/chains";

/**
 * ERC-20 ABI extended with the EIP-2612 Permit surface this protocol relies
 * on. Kept `as const` so wagmi/viem can fully infer argument and return types
 * end-to-end — never re-declare these by hand (per AI guidelines §2).
 *
 *  - `nonces(owner)` — required by §4.5 runtime probe.
 *  - `DOMAIN_SEPARATOR()` — required by §4.5 runtime probe.
 *  - `version()` — optional on many tokens; tolerated to revert.
 *  - `permit(owner,spender,value,deadline,v,r,s)` — settlement-side call.
 */
export const erc20PermitAbi = [
  ...viemErc20Abi,
  {
    type: "function",
    name: "nonces",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "DOMAIN_SEPARATOR",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bytes32" }],
  },
  {
    type: "function",
    name: "version",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function",
    name: "permit",
    stateMutability: "nonpayable",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "v", type: "uint8" },
      { name: "r", type: "bytes32" },
      { name: "s", type: "bytes32" },
    ],
    outputs: [],
  },
] as const;

/**
 * Static metadata for a token in the protocol allow-list.
 *
 * Per AI guidelines §4.5, this list is the single source of truth — UIs MUST
 * NOT let merchants pick an off-list token. The `supportsPermit` flag is the
 * compile-time expectation; a runtime probe of `DOMAIN_SEPARATOR()` and
 * `nonces(owner)` is still mandatory before any permit-based flow.
 */
export type TokenInfo = {
  readonly chainId: number;
  readonly address: Address;
  readonly symbol: string;
  readonly name: string;
  readonly decimals: number;
  /** EIP-2612 Permit support known a priori. Runtime probe is still required. */
  readonly supportsPermit: boolean;
  /** EIP-712 domain `version` field used by this token, when known. */
  readonly permitVersion?: string;
};

/**
 * Token allow-list. Addresses are checksummed via `getAddress()` at module
 * load — any typo here surfaces as a thrown error rather than a silent
 * mismatch (§4.5).
 *
 * Notes on inclusions:
 *  - Polygon Mainnet `USDC` is Circle-issued *native* USDC and supports
 *    EIP-2612 with domain `version = "2"`.
 *  - Polygon Mainnet `USDT` (Tether-PoS-bridged) is listed for awareness only;
 *    it does NOT implement EIP-2612 and the permit flow will hard-reject it.
 *  - Polygon Amoy testnet `USDC` is Circle's official testnet faucet token.
 */
export const TOKENS: readonly TokenInfo[] = [
  {
    chainId: polygon.id,
    address: getAddress("0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359"),
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    supportsPermit: true,
    permitVersion: "2",
  },
  {
    chainId: polygon.id,
    address: getAddress("0xc2132D05D31c914a87C6611C10748AEb04B58e8F"),
    symbol: "USDT",
    name: "Tether USD",
    decimals: 6,
    supportsPermit: false,
  },
  {
    chainId: polygonAmoy.id,
    address: getAddress("0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582"),
    symbol: "USDC",
    name: "USD Coin (Amoy)",
    decimals: 6,
    supportsPermit: true,
    permitVersion: "2",
  },
];

/** Returns every allow-listed token for a given chain. */
export function getTokensForChain(chainId: number): readonly TokenInfo[] {
  return TOKENS.filter((t) => t.chainId === chainId);
}

/** Looks up an allow-listed token by chain + checksummed address. */
export function getTokenByAddress(
  chainId: number,
  address: Address
): TokenInfo | undefined {
  const checksummed = getAddress(address);
  return TOKENS.find(
    (t) => t.chainId === chainId && t.address === checksummed
  );
}

/**
 * Convenience predicate: is this token both allow-listed AND known to support
 * EIP-2612? A `true` return is necessary but NOT sufficient — callers must
 * still run the §4.5 runtime probe before signing.
 */
export function isPermitTokenAllowed(
  chainId: number,
  address: Address
): boolean {
  const t = getTokenByAddress(chainId, address);
  return Boolean(t && t.supportsPermit);
}
