import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { cents, splitCents, sum, type Cents } from "../src/money/index.js";
import {
  resolveEffectiveOwnership,
  splitByOwnership,
  type MembershipInterval,
  type OwnershipGraph,
  type OwnershipInterval,
} from "../src/ownership/index.js";

const DATE = new Date("2026-01-15T00:00:00Z");

function graph(
  ownership: OwnershipInterval[],
  memberships: MembershipInterval[],
  syndicates: string[],
): OwnershipGraph {
  const set = new Set(syndicates);
  return { ownership, memberships, isSyndicate: (id) => set.has(id) };
}

/** Turn arbitrary positive weights into bp shares summing to exactly 10000. */
function toBps(weights: number[]): number[] {
  return splitCents(cents(10000n), weights).map(Number);
}

describe("resolveEffectiveOwnership", () => {
  it("resolves flat ownership to basis points", () => {
    const g = graph(
      [
        { horseId: "h1", partyId: "A", basisPoints: 6000, from: new Date("2025-01-01") },
        { horseId: "h1", partyId: "B", basisPoints: 4000, from: new Date("2025-01-01") },
      ],
      [],
      [],
    );
    const shares = resolveEffectiveOwnership(g, "h1", DATE);
    expect(shares.map((s) => [s.partyId, s.basisPoints])).toEqual([
      ["A", 6000],
      ["B", 4000],
    ]);
  });

  it("recursively resolves nested syndicate membership", () => {
    const g = graph(
      [
        { horseId: "h1", partyId: "SYND", basisPoints: 5000, from: new Date("2025-01-01") },
        { horseId: "h1", partyId: "X", basisPoints: 5000, from: new Date("2025-01-01") },
      ],
      [
        { syndicateId: "SYND", memberPartyId: "M1", basisPoints: 3000, from: new Date("2025-01-01") },
        { syndicateId: "SYND", memberPartyId: "M2", basisPoints: 7000, from: new Date("2025-01-01") },
      ],
      ["SYND"],
    );
    const shares = resolveEffectiveOwnership(g, "h1", DATE);
    const byParty = Object.fromEntries(shares.map((s) => [s.partyId, s.basisPoints]));
    expect(byParty).toEqual({ X: 5000, M1: 1500, M2: 3500 });
    expect(shares.reduce((a, s) => a + s.basisPoints, 0)).toBe(10000);
  });

  it("aggregates a party reached via multiple paths", () => {
    const g = graph(
      [
        { horseId: "h1", partyId: "SYND", basisPoints: 5000, from: new Date("2025-01-01") },
        { horseId: "h1", partyId: "M1", basisPoints: 5000, from: new Date("2025-01-01") },
      ],
      [
        { syndicateId: "SYND", memberPartyId: "M1", basisPoints: 4000, from: new Date("2025-01-01") },
        { syndicateId: "SYND", memberPartyId: "M2", basisPoints: 6000, from: new Date("2025-01-01") },
      ],
      ["SYND"],
    );
    const shares = resolveEffectiveOwnership(g, "h1", DATE);
    const byParty = Object.fromEntries(shares.map((s) => [s.partyId, s.basisPoints]));
    // M1: direct 5000 + 5000*4000/10000 = 2000 -> 7000; M2: 3000
    expect(byParty).toEqual({ M1: 7000, M2: 3000 });
  });

  it("respects effective dating", () => {
    const g = graph(
      [
        {
          horseId: "h1",
          partyId: "OLD",
          basisPoints: 10000,
          from: new Date("2025-01-01"),
          to: new Date("2026-01-01"),
        },
        { horseId: "h1", partyId: "NEW", basisPoints: 10000, from: new Date("2026-01-01") },
      ],
      [],
      [],
    );
    expect(resolveEffectiveOwnership(g, "h1", DATE)[0]!.partyId).toBe("NEW");
    expect(
      resolveEffectiveOwnership(g, "h1", new Date("2025-06-01"))[0]!.partyId,
    ).toBe("OLD");
  });

  it("throws on ownership that does not sum to 10000", () => {
    const g = graph(
      [{ horseId: "h1", partyId: "A", basisPoints: 5000, from: new Date("2025-01-01") }],
      [],
      [],
    );
    expect(() => resolveEffectiveOwnership(g, "h1", DATE)).toThrow(/sum to 10000/);
  });

  it("throws on membership cycles", () => {
    const g = graph(
      [{ horseId: "h1", partyId: "S1", basisPoints: 10000, from: new Date("2025-01-01") }],
      [
        { syndicateId: "S1", memberPartyId: "S2", basisPoints: 10000, from: new Date("2025-01-01") },
        { syndicateId: "S2", memberPartyId: "S1", basisPoints: 10000, from: new Date("2025-01-01") },
      ],
      ["S1", "S2"],
    );
    expect(() => resolveEffectiveOwnership(g, "h1", DATE)).toThrow(/cycle/);
  });
});

describe("splitByOwnership (penny-exact disbursement)", () => {
  it("splits an amount across nested leaves to the penny", () => {
    const g = graph(
      [
        { horseId: "h1", partyId: "SYND", basisPoints: 5000, from: new Date("2025-01-01") },
        { horseId: "h1", partyId: "X", basisPoints: 5000, from: new Date("2025-01-01") },
      ],
      [
        { syndicateId: "SYND", memberPartyId: "M1", basisPoints: 3333, from: new Date("2025-01-01") },
        { syndicateId: "SYND", memberPartyId: "M2", basisPoints: 3333, from: new Date("2025-01-01") },
        { syndicateId: "SYND", memberPartyId: "M3", basisPoints: 3334, from: new Date("2025-01-01") },
      ],
      ["SYND"],
    );
    const parts = splitByOwnership(g, "h1", DATE, cents(10000n)); // $100.00
    const total = [...parts.values()].reduce((a, b) => (a + b) as Cents, 0n as Cents);
    expect(total).toBe(10000n);
  });

  it("PROPERTY: split of a two-level tree always sums to the total", () => {
    const leafWeights = fc.array(fc.integer({ min: 1, max: 500 }), {
      minLength: 1,
      maxLength: 6,
    });
    const arb = fc.record({
      total: fc.bigInt({ min: -(10n ** 9n), max: 10n ** 9n }),
      ownerWeights: fc.array(fc.integer({ min: 1, max: 500 }), { minLength: 1, maxLength: 6 }),
      syndicateMembers: fc.array(leafWeights, { minLength: 1, maxLength: 6 }),
    });

    fc.assert(
      fc.property(arb, ({ total, ownerWeights, syndicateMembers }) => {
        const ownerBps = toBps(ownerWeights);
        const ownership: OwnershipInterval[] = [];
        const memberships: MembershipInterval[] = [];
        const syndicates: string[] = [];

        ownerBps.forEach((bp, i) => {
          // Alternate owners are syndicates (if we have member weights for them).
          const isSynd = i % 2 === 1 && syndicateMembers[i % syndicateMembers.length]!.length > 0;
          const partyId = isSynd ? `S${i}` : `O${i}`;
          ownership.push({ horseId: "h", partyId, basisPoints: bp, from: new Date("2020-01-01") });
          if (isSynd) {
            syndicates.push(partyId);
            const memberBps = toBps(syndicateMembers[i % syndicateMembers.length]!);
            memberBps.forEach((mbp, j) => {
              memberships.push({
                syndicateId: partyId,
                memberPartyId: `${partyId}_m${j}`,
                basisPoints: mbp,
                from: new Date("2020-01-01"),
              });
            });
          }
        });

        const g = graph(ownership, memberships, syndicates);
        const parts = splitByOwnership(g, "h", DATE, cents(total));
        const summed = [...parts.values()].reduce((a, b) => (a + b) as Cents, 0n as Cents);
        expect(summed).toBe(total);
      }),
    );
  });
});
