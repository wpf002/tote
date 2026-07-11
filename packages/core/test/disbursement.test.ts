import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  cents,
  splitCents,
  Ledger,
  InMemoryLedgerStore,
  disburse,
  type Cents,
  type MembershipInterval,
  type OwnershipGraph,
  type OwnershipInterval,
} from "../src/index.js";

const DATE = new Date("2026-05-01T00:00:00Z");

function graph(
  ownership: OwnershipInterval[],
  memberships: MembershipInterval[],
  syndicates: string[],
): OwnershipGraph {
  const set = new Set(syndicates);
  return { ownership, memberships, isSyndicate: (id) => set.has(id) };
}

function toBps(weights: number[]): number[] {
  return splitCents(cents(10000n), weights).map(Number);
}

describe("disburse — nested syndicate wedge", () => {
  it("splits owner-net across leaf partners, penny-exact, and posts a balanced entry", async () => {
    // Horse: SYND 50% + individual X 50%. SYND members M1/M2/M3 at ~1/3 each.
    const g = graph(
      [
        { horseId: "h1", partyId: "SYND", basisPoints: 5000, from: new Date("2020-01-01") },
        { horseId: "h1", partyId: "X", basisPoints: 5000, from: new Date("2020-01-01") },
      ],
      [
        { syndicateId: "SYND", memberPartyId: "M1", basisPoints: 3333, from: new Date("2020-01-01") },
        { syndicateId: "SYND", memberPartyId: "M2", basisPoints: 3333, from: new Date("2020-01-01") },
        { syndicateId: "SYND", memberPartyId: "M3", basisPoints: 3334, from: new Date("2020-01-01") },
      ],
      ["SYND"],
    );

    const result = disburse(g, "h1", DATE, cents(100000n), cents(5000n)); // $1000 net, $50 trainer cut

    const allocSum = result.allocations.reduce((a, b) => (a + b.amount) as Cents, 0n as Cents);
    expect(allocSum).toBe(100000n); // exact to the penny
    expect(result.allocations.find((a) => a.partyId === "X")?.amount).toBe(50000n);

    // Posting it credits each partner's purse payable by their allocation.
    const l = new Ledger(new InMemoryLedgerStore(), { orgId: "o", legalEntityId: "e" });
    await l.postEntry({ date: DATE, memo: result.draft.memo }, result.draft.lines);

    for (const a of result.allocations) {
      expect(await l.balanceOf("OWNER_PURSE_PAYABLE", { partyId: a.partyId })).toBe(a.amount);
    }
    expect(await l.balanceOf("PURSE_REVENUE")).toBe(5000n);
    expect(await l.balanceOf("CASH")).toBe(105000n); // owner-net + trainer cut
  });

  it("PROPERTY: allocations always sum to owner-net and the entry balances", () => {
    const arb = fc.record({
      ownerNet: fc.bigInt({ min: 0n, max: 10n ** 9n }),
      trainerCut: fc.bigInt({ min: 0n, max: 10n ** 7n }),
      ownerWeights: fc.array(fc.integer({ min: 1, max: 400 }), { minLength: 1, maxLength: 5 }),
      members: fc.array(fc.integer({ min: 1, max: 400 }), { minLength: 1, maxLength: 5 }),
    });

    fc.assert(
      fc.property(arb, ({ ownerNet, trainerCut, ownerWeights, members }) => {
        const ownerBps = toBps(ownerWeights);
        const ownership: OwnershipInterval[] = [];
        const memberships: MembershipInterval[] = [];
        const syndicates: string[] = [];

        ownerBps.forEach((bp, i) => {
          const isSynd = i === 0 && members.length > 0; // make the first owner a syndicate
          const partyId = isSynd ? "S" : `O${i}`;
          ownership.push({ horseId: "h", partyId, basisPoints: bp, from: new Date("2019-01-01") });
          if (isSynd) {
            syndicates.push(partyId);
            toBps(members).forEach((mbp, j) => {
              memberships.push({
                syndicateId: partyId,
                memberPartyId: `S_m${j}`,
                basisPoints: mbp,
                from: new Date("2019-01-01"),
              });
            });
          }
        });

        const g = graph(ownership, memberships, syndicates);
        const { allocations, draft } = disburse(g, "h", DATE, cents(ownerNet), cents(trainerCut));

        const allocSum = allocations.reduce((a, b) => a + (b.amount as bigint), 0n);
        expect(allocSum).toBe(ownerNet);

        const debits = draft.lines.reduce((a, l) => a + (l.debit ?? 0n), 0n);
        const credits = draft.lines.reduce((a, l) => a + (l.credit ?? 0n), 0n);
        expect(debits).toBe(credits);
        expect(debits).toBe(ownerNet + trainerCut);
      }),
    );
  });
});
