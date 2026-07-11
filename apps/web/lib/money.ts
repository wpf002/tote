import { format, type Cents } from "@tote/core";

/** Format integer cents as a currency string. Safe in server and client code. */
export function fmt(value: bigint): string {
  return format(value as Cents);
}

/** Format cents without the currency symbol (for tight table cells). */
export function fmtPlain(value: bigint): string {
  return format(value as Cents, { symbol: "" });
}

/** Basis points → percent label, e.g. 3333 → "33.33%". */
export function fmtBps(bps: number): string {
  return `${(bps / 100).toFixed(2).replace(/\.00$/, "")}%`;
}
