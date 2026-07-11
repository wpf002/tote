import type { Cents } from "./cents.js";
import { ZERO } from "./cents.js";

/** Basis points: 1 bp = 1/10000. 100% = 10000 bp. */
export const BPS_SCALE = 10000n;

export function add(...values: Cents[]): Cents {
  return values.reduce((a, b) => (a + b) as Cents, ZERO);
}

export function sub(a: Cents, b: Cents): Cents {
  return (a - b) as Cents;
}

export function neg(a: Cents): Cents {
  return -a as Cents;
}

export function abs(a: Cents): Cents {
  return (a < 0n ? -a : a) as Cents;
}

/** Multiply cents by a whole number of times (e.g. rate × days). */
export function mulInt(a: Cents, factor: bigint | number): Cents {
  const f = typeof factor === "bigint" ? factor : BigInt(assertInt(factor));
  return (a * f) as Cents;
}

export function sum(values: ReadonlyArray<Cents>): Cents {
  return values.reduce((a, b) => (a + b) as Cents, ZERO);
}

export function isZero(a: Cents): boolean {
  return a === 0n;
}

export function cmp(a: Cents, b: Cents): -1 | 0 | 1 {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Apply a basis-point rate to an amount, rounding half-away-from-zero to the
 * cent. Used for markup and single-value percentage math. For splitting one
 * amount across many parties, use {@link splitCents} instead — it is exact.
 */
export function applyBps(a: Cents, bps: bigint | number): Cents {
  const rate = typeof bps === "bigint" ? bps : BigInt(assertInt(bps));
  const negative = a < 0n !== rate < 0n;
  const numerator = (a < 0n ? -a : a) * (rate < 0n ? -rate : rate);
  const q = numerator / BPS_SCALE;
  const r = numerator % BPS_SCALE;
  const rounded = r * 2n >= BPS_SCALE ? q + 1n : q;
  return (negative ? -rounded : rounded) as Cents;
}

function assertInt(value: number): number {
  if (!Number.isInteger(value)) {
    throw new RangeError(`Expected an integer, got ${value}`);
  }
  return value;
}
