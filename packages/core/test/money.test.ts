import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  toCents,
  format,
  cents,
  splitCents,
  add,
  sub,
  sum,
  applyBps,
  mulInt,
  type Cents,
} from "../src/money/index.js";

describe("toCents", () => {
  it("parses decimal strings exactly", () => {
    expect(toCents("12.34")).toBe(1234n);
    expect(toCents("0.05")).toBe(5n);
    expect(toCents("1000")).toBe(100000n);
    expect(toCents("-5.5")).toBe(-550n);
    expect(toCents(".99")).toBe(99n);
  });

  it("rounds beyond two decimals half-away-from-zero", () => {
    expect(toCents("0.005")).toBe(1n);
    expect(toCents("0.004")).toBe(0n);
    expect(toCents("1.999")).toBe(200n);
    expect(toCents("-0.005")).toBe(-1n);
  });

  it("accepts numbers via shortest round-trip form", () => {
    expect(toCents(12.34)).toBe(1234n);
    expect(toCents(0.1 + 0.2)).toBe(30n); // 0.30000000000000004 -> 30c
  });

  it("rejects garbage", () => {
    expect(() => toCents("abc")).toThrow();
    expect(() => toCents("")).toThrow();
    expect(() => toCents(Infinity)).toThrow();
  });
});

describe("format", () => {
  it("renders currency with grouping and sign", () => {
    expect(format(cents(123456n))).toBe("$1,234.56");
    expect(format(cents(-123456n))).toBe("-$1,234.56");
    expect(format(cents(5n))).toBe("$0.05");
    expect(format(cents(1000000n), { symbol: "", grouping: false })).toBe("10000.00");
  });

  it("round-trips through toCents", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: -(10n ** 15n), max: 10n ** 15n }), (n) => {
        const c = cents(n);
        expect(toCents(format(c, { symbol: "", grouping: false }))).toBe(c);
      }),
    );
  });
});

describe("money helpers", () => {
  it("adds, subtracts, sums", () => {
    expect(add(cents(100n), cents(250n))).toBe(350n);
    expect(sub(cents(100n), cents(250n))).toBe(-150n);
    expect(sum([cents(1n), cents(2n), cents(3n)])).toBe(6n);
  });

  it("mulInt scales by whole numbers (rate x days)", () => {
    expect(mulInt(cents(5000n), 30)).toBe(150000n);
  });

  it("applyBps rounds half-away-from-zero", () => {
    expect(applyBps(cents(10000n), 1500)).toBe(1500n); // 15% of $100 = $15
    expect(applyBps(cents(1n), 5000)).toBe(1n); // 0.5c -> 1c
    expect(applyBps(cents(-1n), 5000)).toBe(-1n);
  });
});

describe("splitCents (largest remainder, invariant #5)", () => {
  it("splits evenly with deterministic remainder distribution", () => {
    expect(splitCents(cents(100n), [1, 1, 1])).toEqual([34n, 33n, 33n]);
  });

  it("weights are relative", () => {
    expect(splitCents(cents(10000n), [6000, 4000])).toEqual([6000n, 4000n]);
    expect(splitCents(cents(10000n), [3, 2])).toEqual([6000n, 4000n]);
  });

  it("handles negative totals symmetrically", () => {
    const parts = splitCents(cents(-100n), [1, 1, 1]);
    expect(parts).toEqual([-34n, -33n, -33n]);
    expect(sum(parts)).toBe(-100n);
  });

  it("rejects empty / all-zero / negative weights", () => {
    expect(() => splitCents(cents(100n), [])).toThrow();
    expect(() => splitCents(cents(100n), [0, 0])).toThrow();
    expect(() => splitCents(cents(100n), [1, -1])).toThrow();
  });

  it("PROPERTY: parts always sum exactly to the total", () => {
    const weightArb = fc.array(fc.integer({ min: 0, max: 1_000_000 }), {
      minLength: 1,
      maxLength: 25,
    });
    fc.assert(
      fc.property(
        fc.bigInt({ min: -(10n ** 12n), max: 10n ** 12n }),
        weightArb,
        (total, weights) => {
          fc.pre(weights.some((w) => w > 0));
          const parts = splitCents(cents(total), weights);
          expect(parts).toHaveLength(weights.length);
          expect((sum(parts) as bigint)).toBe(total);
        },
      ),
    );
  });

  it("PROPERTY: each part is within one cent of its ideal share", () => {
    const weightArb = fc.array(fc.integer({ min: 1, max: 1000 }), {
      minLength: 1,
      maxLength: 12,
    });
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: 10n ** 9n }), weightArb, (total, weights) => {
        const parts = splitCents(cents(total), weights);
        const W = weights.reduce((a, b) => a + b, 0);
        parts.forEach((part, i) => {
          const ideal = (total * BigInt(weights[i]!)) / BigInt(W);
          const diff = (part as bigint) - ideal;
          expect(diff >= 0n && diff <= 1n).toBe(true);
        });
      }),
    );
  });
});
