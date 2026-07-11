import type { Cents } from "./cents.js";

/**
 * Allocate `total` across `weights` using the largest-remainder method.
 *
 * Invariant #5: the returned parts always sum **exactly** to `total`, to the
 * penny, for any set of non-negative weights. No rounding drift is possible —
 * the leftover cents left by integer division are handed out one at a time to
 * the parts with the largest fractional remainders (ties broken by index, so
 * the result is deterministic).
 *
 * Weights are relative: `[1, 1]`, `[50, 50]`, and `[5000, 5000]` all split
 * 50/50. Negative totals are supported (each part is negated after splitting).
 */
export function splitCents(total: Cents, weights: ReadonlyArray<bigint | number>): Cents[] {
  const w = weights.map(toWeight);
  if (w.length === 0) throw new RangeError("splitCents requires at least one weight");

  const totalWeight = w.reduce((a, b) => a + b, 0n);
  if (totalWeight === 0n) throw new RangeError("splitCents weights must sum to more than zero");

  const negative = total < 0n;
  const magnitude = negative ? -(total as bigint) : (total as bigint);

  const floors: bigint[] = new Array(w.length);
  const remainders: bigint[] = new Array(w.length);
  let allocated = 0n;

  for (let i = 0; i < w.length; i++) {
    const scaled = magnitude * w[i]!;
    floors[i] = scaled / totalWeight;
    remainders[i] = scaled % totalWeight;
    allocated += floors[i]!;
  }

  // Leftover is strictly less than the number of parts, so a single pass over
  // the remainder-sorted indices suffices.
  let leftover = magnitude - allocated;

  const order = w.map((_, i) => i).sort((a, b) => {
    if (remainders[a]! !== remainders[b]!) return remainders[a]! > remainders[b]! ? -1 : 1;
    return a - b;
  });

  for (let k = 0; leftover > 0n; k++) {
    floors[order[k]!]! += 1n;
    leftover -= 1n;
  }

  return floors.map((part) => (negative ? -part : part) as Cents);
}

function toWeight(value: bigint | number): bigint {
  const big = typeof value === "bigint" ? value : numberToBigint(value);
  if (big < 0n) throw new RangeError(`splitCents weights must be non-negative, got ${value}`);
  return big;
}

function numberToBigint(value: number): bigint {
  if (!Number.isInteger(value)) {
    throw new RangeError(`splitCents weight must be an integer, got ${value}`);
  }
  return BigInt(value);
}
