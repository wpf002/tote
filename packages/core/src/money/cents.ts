/**
 * Money is integer cents, always. Invariant #1: no float ever touches the
 * financial path. `Cents` is a branded `bigint` so a raw number can never be
 * passed where cents are expected without going through {@link toCents}.
 */
export type Cents = bigint & { readonly __brand: "Cents" };

/** The canonical zero. */
export const ZERO = 0n as Cents;

/** Assert-free constructor for values already known to be integer cents. */
export function cents(value: bigint): Cents {
  return value as Cents;
}

/**
 * Convert a human-entered dollar amount to integer cents without any floating
 * point. Prefer passing a string ("12.34") for exactness; numbers are accepted
 * but are converted via their shortest round-trip string form.
 *
 * More than two decimal places are rounded half-away-from-zero to the cent.
 */
export function toCents(amount: string | number | bigint): Cents {
  if (typeof amount === "bigint") return amount as Cents;

  const raw = typeof amount === "number" ? numberToDecimalString(amount) : amount.trim();

  const match = /^([+-]?)(\d*)(?:\.(\d+))?$/.exec(raw);
  if (!match || (match[2] === "" && (match[3] ?? "") === "")) {
    throw new RangeError(`Invalid money amount: ${JSON.stringify(amount)}`);
  }

  const sign = match[1] === "-" ? -1n : 1n;
  const wholeDigits = match[2] ?? "";
  const whole = wholeDigits === "" ? 0n : BigInt(wholeDigits);

  // Pad to at least three fractional digits so the third digit drives rounding.
  const frac = ((match[3] ?? "") + "000").slice(0, 3);
  let centsPart = BigInt(frac.slice(0, 2));
  if (Number(frac.charAt(2)) >= 5) centsPart += 1n;

  return (sign * (whole * 100n + centsPart)) as Cents;
}

/**
 * Format cents as a currency string, e.g. `-$1,234.56`. Purely presentational —
 * never feed the result back into the financial path.
 */
export function format(
  value: Cents,
  opts: { symbol?: string; grouping?: boolean } = {},
): string {
  const symbol = opts.symbol ?? "$";
  const grouping = opts.grouping ?? true;

  const negative = value < 0n;
  const abs = negative ? -value : value;
  const dollars = abs / 100n;
  const remainder = abs % 100n;

  const dollarsStr = grouping ? withThousands(dollars.toString()) : dollars.toString();
  const centsStr = remainder.toString().padStart(2, "0");

  return `${negative ? "-" : ""}${symbol}${dollarsStr}.${centsStr}`;
}

function withThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function numberToDecimalString(n: number): string {
  if (!Number.isFinite(n)) {
    throw new RangeError(`Cannot convert non-finite number to cents: ${n}`);
  }
  const str = String(n);
  if (/e/i.test(str)) {
    // Avoid exponential notation for extreme values; 20 dp is well past cents.
    return n.toFixed(20).replace(/0+$/, "").replace(/\.$/, "");
  }
  return str;
}
