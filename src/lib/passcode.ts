/**
 * Passcode verification utilities for client and server.
 *
 * This is NOT a security system — it's a casual gate for a public URL.
 * The passcode is shared via env var, stored in sessionStorage (per-tab),
 * and sent as a header on every API request.
 */

const PASSCODE_HEADER = "x-passcode";

/**
 * Verify a passcode against the environment variable.
 * Server-side only.
 */
export function verifyPasscode(submitted: string): boolean {
  const expected = process.env.PASSCODE;
  if (!expected) {
    // If no PASSCODE env var is set, gate is disabled (dev mode)
    return true;
  }
  return submitted === expected;
}

/**
 * Client-side: store passcode in sessionStorage after successful verification.
 */
export function storePasscode(passcode: string): void {
  if (typeof window !== "undefined") {
    sessionStorage.setItem("sprache_passcode", passcode);
  }
}

/**
 * Client-side: retrieve stored passcode from sessionStorage.
 */
export function getStoredPasscode(): string | null {
  if (typeof window !== "undefined") {
    return sessionStorage.getItem("sprache_passcode");
  }
  return null;
}

/**
 * Client-side: clear stored passcode (logout / tab close).
 */
export function clearPasscode(): void {
  if (typeof window !== "undefined") {
    sessionStorage.removeItem("sprache_passcode");
  }
}

/**
 * Client-side: check if user has a stored passcode.
 */
export function isPasscodeStored(): boolean {
  if (typeof window !== "undefined") {
    return sessionStorage.getItem("sprache_passcode") !== null;
  }
  return false;
}

/**
 * Build headers to include in fetch requests.
 */
export function getPasscodeHeaders(): Record<string, string> {
  const passcode = getStoredPasscode();
  if (passcode) {
    return { [PASSCODE_HEADER]: passcode };
  }
  return {};
}
