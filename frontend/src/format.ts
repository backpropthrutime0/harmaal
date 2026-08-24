/** Currency formatting helpers, shared across the app. */

export function money(n: number | null | undefined): string {
  return `$${(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

/** Two-decimal variant for cash reconciliation, where cents must add up. */
export function money2(n: number | null | undefined): string {
  return `$${(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
