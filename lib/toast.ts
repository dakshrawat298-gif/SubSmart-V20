/**
 * Minimal event-based toast dispatcher — zero React, zero context, zero deps.
 *
 * Any module (hook, util, component) calls:
 *   toast.error("Block range exceeded")
 *   toast.success("Plan published")
 *
 * The global <GlobalToast> component listens for the custom event and renders
 * the floating pill. Because it uses window.dispatchEvent, it is safe to call
 * from async callbacks, wagmi hooks, and anywhere outside the React tree.
 */

export type ToastLevel = "error" | "success" | "info";

export interface ToastPayload {
  readonly message: string;
  readonly level: ToastLevel;
}

const EVENT_NAME = "subsmart:toast" as const;

function dispatch(level: ToastLevel, raw: unknown): void {
  if (typeof window === "undefined") return;
  // Sanitise: extract a human-readable string regardless of what was thrown.
  let message: string;
  if (typeof raw === "string") {
    message = raw;
  } else if (raw instanceof Error) {
    // Trim verbose RPC boilerplate like "Request Arguments: …\nDetails: …"
    const full = raw.message;
    const detailsIdx = full.indexOf("\nRequest Arguments");
    message = detailsIdx > 0 ? full.slice(0, detailsIdx).trim() : full;
  } else {
    message = "An unexpected error occurred.";
  }

  window.dispatchEvent(
    new CustomEvent<ToastPayload>(EVENT_NAME, {
      detail: { message, level },
    })
  );
}

export const toast = {
  /** Show a rose-accented error notification. */
  error: (raw: unknown) => dispatch("error", raw),
  /** Show an emerald-accented success notification. */
  success: (message: string) => dispatch("success", message),
  /** Show a neutral indigo notification. */
  info: (message: string) => dispatch("info", message),
  /** The CustomEvent name — used by GlobalToast to attach its listener. */
  EVENT_NAME,
} as const;
