import type { Address, Hex } from "viem";

/**
 * EIP-712 domain for an EIP-2612 Permit-compatible ERC-20 token.
 * Includes only the fields the standard Permit shape uses; tokens with
 * non-standard permit (e.g. legacy DAI) are explicitly out of scope here.
 */
export type PermitDomain = {
  readonly name: string;
  readonly version: string;
  readonly chainId: number;
  readonly verifyingContract: Address;
};

/**
 * EIP-2612 Permit message struct, per the spec.
 *
 * `value` is a bounded amount in token base units. Infinite/MAX values are
 * **forbidden** by AI guidelines §4.1 — the bounded-authorization helper in
 * this file is the only sanctioned source of `value` and `deadline`.
 */
export type PermitMessage = {
  readonly owner: Address;
  readonly spender: Address;
  readonly value: bigint;
  readonly nonce: bigint;
  readonly deadline: bigint;
};

/**
 * EIP-712 type definitions for the standard EIP-2612 Permit payload.
 * Field order MUST match the on-chain `permit()` implementation; any
 * deviation produces an invalid signature.
 */
export const PERMIT_TYPES = {
  Permit: [
    { name: "owner", type: "address" },
    { name: "spender", type: "address" },
    { name: "value", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export const PERMIT_PRIMARY_TYPE = "Permit" as const;

/** Default scheduling slack for relayers past the final cycle (24h). */
export const DEFAULT_GRACE_BUFFER_SECONDS = 24 * 60 * 60;

/** Hard cap on permit lifetime — prevents accidental long-lived authorizations. */
export const MAX_PERMIT_LIFETIME_SECONDS = 5 * 365 * 24 * 60 * 60;

/** Hard cap on number of cycles authorized by a single permit. */
export const MAX_PERMIT_CYCLES = 120;

/** Inputs for computing a bounded authorization (§4.1). */
export type BoundedAuthorizationInput = {
  /** Charge amount per cycle, in token base units. */
  readonly amountPerCycle: bigint;
  /** Maximum number of cycles authorized by this permit. Must be > 0. */
  readonly maxCycles: number;
  /** Cycle length in seconds (e.g. `30 * 86400` for monthly). */
  readonly cycleLengthSeconds: number;
  /** Seconds added past the final cycle for relayer scheduling slack. */
  readonly graceBufferSeconds?: number;
  /** Unix timestamp (s) for the start of cycle 1. Defaults to `now()`. */
  readonly startTimeSeconds?: number;
};

/** Result of bounding an authorization for a permit. */
export type BoundedAuthorization = {
  readonly value: bigint;
  readonly deadline: bigint;
  readonly maxCycles: number;
  readonly cycleLengthSeconds: number;
  readonly amountPerCycle: bigint;
  readonly startTimeSeconds: number;
  readonly endTimeSeconds: number;
};

/**
 * Compute the bounded `value` and `deadline` for an EIP-2612 permit.
 *
 * Throws on any input that would produce an unsafe (effectively-infinite)
 * authorization. There is intentionally no path here that returns
 * `MaxUint256` or any value not derived from `amountPerCycle * maxCycles`.
 *
 * @throws Error when inputs are invalid or exceed protocol caps.
 */
export function computeBoundedAuthorization(
  input: BoundedAuthorizationInput
): BoundedAuthorization {
  if (input.amountPerCycle <= 0n) {
    throw new Error("amountPerCycle must be > 0 (no zero-charge permits)");
  }
  if (!Number.isInteger(input.maxCycles) || input.maxCycles <= 0) {
    throw new Error("maxCycles must be a positive integer");
  }
  if (input.maxCycles > MAX_PERMIT_CYCLES) {
    throw new Error(
      `maxCycles ${input.maxCycles} exceeds hard cap ${MAX_PERMIT_CYCLES}`
    );
  }
  if (
    !Number.isInteger(input.cycleLengthSeconds) ||
    input.cycleLengthSeconds <= 0
  ) {
    throw new Error("cycleLengthSeconds must be a positive integer");
  }

  const grace = input.graceBufferSeconds ?? DEFAULT_GRACE_BUFFER_SECONDS;
  if (!Number.isInteger(grace) || grace < 0) {
    throw new Error("graceBufferSeconds must be a non-negative integer");
  }

  const startTimeSeconds =
    input.startTimeSeconds ?? Math.floor(Date.now() / 1000);
  const lifetime = input.cycleLengthSeconds * input.maxCycles + grace;
  if (lifetime > MAX_PERMIT_LIFETIME_SECONDS) {
    throw new Error(
      `Permit lifetime ${lifetime}s exceeds hard cap ${MAX_PERMIT_LIFETIME_SECONDS}s`
    );
  }

  const endTimeSeconds = startTimeSeconds + lifetime;
  const value = input.amountPerCycle * BigInt(input.maxCycles);

  return {
    value,
    deadline: BigInt(endTimeSeconds),
    maxCycles: input.maxCycles,
    cycleLengthSeconds: input.cycleLengthSeconds,
    amountPerCycle: input.amountPerCycle,
    startTimeSeconds,
    endTimeSeconds,
  };
}

/**
 * Build a fully-typed EIP-712 payload ready for `walletClient.signTypedData`.
 * The shape is intentionally explicit and unwrapped — no helper indirection
 * may obscure the typed-data payload from a developer reading the call site
 * (per AI guidelines §6 forbidden patterns).
 */
export function buildPermitTypedData(args: {
  readonly domain: PermitDomain;
  readonly message: PermitMessage;
}): {
  readonly domain: PermitDomain;
  readonly types: typeof PERMIT_TYPES;
  readonly primaryType: typeof PERMIT_PRIMARY_TYPE;
  readonly message: PermitMessage;
} {
  return {
    domain: args.domain,
    types: PERMIT_TYPES,
    primaryType: PERMIT_PRIMARY_TYPE,
    message: args.message,
  };
}

/**
 * Splits a 65-byte EIP-2612 signature into v/r/s components for the on-chain
 * `permit()` call. Normalises `v` to the canonical {27, 28} range expected
 * by most ERC-20 permit implementations.
 *
 * @throws Error when the signature is not a 65-byte 0x-hex string.
 */
export function splitPermitSignature(signature: Hex): {
  readonly v: number;
  readonly r: Hex;
  readonly s: Hex;
} {
  if (!signature.startsWith("0x") || signature.length !== 132) {
    throw new Error("Invalid signature: expected 65-byte 0x-hex");
  }
  const r = ("0x" + signature.slice(2, 66)) as Hex;
  const s = ("0x" + signature.slice(66, 130)) as Hex;
  const vByte = parseInt(signature.slice(130, 132), 16);
  if (Number.isNaN(vByte)) {
    throw new Error("Invalid signature: non-hex v byte");
  }
  const v = vByte < 27 ? vByte + 27 : vByte;
  return { v, r, s };
}
