import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { cents, type Cents } from "../src/money/index.js";
import {
  Ledger,
  InMemoryLedgerStore,
  type AccountKind,
  type JournalLineInput,
} from "../src/ledger/index.js";

const ORG = "org_1";
const ENTITY = "le_1";
const DATE = new Date("2026-02-01T00:00:00Z");

function makeLedger(orgId = ORG, legalEntityId = ENTITY) {
  const store = new InMemoryLedgerStore();
  return { store, ledger: new Ledger(store, { orgId, legalEntityId }) };
}

describe("postEntry balancing (invariant #4)", () => {
  it("posts a balanced entry", () => {
    const { ledger } = makeLedger();
    const entry = ledger.postEntry({ date: DATE, memo: "vendor bill" }, [
      { accountKind: "OPERATING_EXPENSE", debit: cents(5000n), horseId: "h1", categoryId: "vet" },
      { accountKind: "ACCOUNTS_PAYABLE", credit: cents(5000n), partyId: "vendor_1" },
    ]);
    expect(entry.lines).toHaveLength(2);
    expect(entry.reversalOf).toBeNull();
  });

  it("rejects an unbalanced entry", () => {
    const { ledger } = makeLedger();
    expect(() =>
      ledger.postEntry({ date: DATE }, [
        { accountKind: "OPERATING_EXPENSE", debit: cents(5000n) },
        { accountKind: "ACCOUNTS_PAYABLE", credit: cents(4000n) },
      ]),
    ).toThrow(/does not balance/);
  });

  it("rejects a line with both sides or a negative amount", () => {
    const { ledger } = makeLedger();
    expect(() =>
      ledger.postEntry({ date: DATE }, [
        { accountKind: "CASH", debit: cents(1n), credit: cents(1n) },
      ]),
    ).toThrow();
    expect(() =>
      ledger.postEntry({ date: DATE }, [{ accountKind: "CASH", debit: cents(-1n) }]),
    ).toThrow();
  });
});

describe("balanceOf (derived, dimensional — invariant #2)", () => {
  it("reports natural-direction balances for the core templates", () => {
    const { ledger } = makeLedger();
    // Vendor bill approved: Dr expense / Cr AP
    ledger.postEntry({ date: DATE }, [
      { accountKind: "OPERATING_EXPENSE", debit: cents(5000n), horseId: "h1" },
      { accountKind: "ACCOUNTS_PAYABLE", credit: cents(5000n), partyId: "vendor_1" },
    ]);
    // Owner invoice (training): Dr AR / Cr income
    ledger.postEntry({ date: DATE }, [
      { accountKind: "ACCOUNTS_RECEIVABLE", debit: cents(8000n), partyId: "owner_1" },
      { accountKind: "OPERATING_INCOME", credit: cents(8000n), horseId: "h1" },
    ]);
    // Owner pays: Dr cash / Cr AR
    ledger.postEntry({ date: DATE }, [
      { accountKind: "CASH", debit: cents(3000n) },
      { accountKind: "ACCOUNTS_RECEIVABLE", credit: cents(3000n), partyId: "owner_1" },
    ]);

    expect(ledger.balanceOf("OPERATING_EXPENSE")).toBe(5000n);
    expect(ledger.balanceOf("OPERATING_EXPENSE", { horseId: "h1" })).toBe(5000n);
    expect(ledger.balanceOf("ACCOUNTS_PAYABLE", { partyId: "vendor_1" })).toBe(5000n);
    expect(ledger.balanceOf("ACCOUNTS_RECEIVABLE", { partyId: "owner_1" })).toBe(5000n);
    expect(ledger.balanceOf("CASH")).toBe(3000n);
    // A horse dimension that never appears yields zero.
    expect(ledger.balanceOf("OPERATING_EXPENSE", { horseId: "h2" })).toBe(0n);
  });

  it("computes net position (purse payable minus receivable)", () => {
    const { ledger } = makeLedger();
    ledger.postEntry({ date: DATE }, [
      { accountKind: "CASH", debit: cents(10000n) },
      { accountKind: "OWNER_PURSE_PAYABLE", credit: cents(10000n), partyId: "p1" },
    ]);
    ledger.postEntry({ date: DATE }, [
      { accountKind: "ACCOUNTS_RECEIVABLE", debit: cents(4000n), partyId: "p1" },
      { accountKind: "OPERATING_INCOME", credit: cents(4000n) },
    ]);
    expect(ledger.netPosition("p1")).toBe(6000n); // owed 10000, owes 4000
  });
});

describe("reverseEntry (invariant #3 — corrections are reversals)", () => {
  it("returns balances to their pre-entry state", () => {
    const { ledger } = makeLedger();
    const before = ledger.balanceOf("ACCOUNTS_PAYABLE", { partyId: "vendor_1" });
    const entry = ledger.postEntry({ date: DATE }, [
      { accountKind: "OPERATING_EXPENSE", debit: cents(5000n), horseId: "h1" },
      { accountKind: "ACCOUNTS_PAYABLE", credit: cents(5000n), partyId: "vendor_1" },
    ]);
    expect(ledger.balanceOf("ACCOUNTS_PAYABLE", { partyId: "vendor_1" })).toBe(5000n);

    const reversal = ledger.reverseEntry(entry.id, "entered in error");
    expect(reversal.reversalOf).toBe(entry.id);
    expect(ledger.balanceOf("ACCOUNTS_PAYABLE", { partyId: "vendor_1" })).toBe(before);
    expect(ledger.balanceOf("OPERATING_EXPENSE", { horseId: "h1" })).toBe(0n);
  });
});

describe("tenant isolation (invariant #6)", () => {
  it("never returns another legal entity's lines", () => {
    const store = new InMemoryLedgerStore();
    const a = new Ledger(store, { orgId: ORG, legalEntityId: "le_a" });
    const b = new Ledger(store, { orgId: ORG, legalEntityId: "le_b" });

    a.postEntry({ date: DATE }, [
      { accountKind: "CASH", debit: cents(9999n) },
      { accountKind: "OWNER_EQUITY", credit: cents(9999n), partyId: "p1" },
    ]);

    expect(a.balanceOf("CASH")).toBe(9999n);
    expect(b.balanceOf("CASH")).toBe(0n); // isolated
  });

  it("cannot reverse an entry from another tenant", () => {
    const store = new InMemoryLedgerStore();
    const a = new Ledger(store, { orgId: ORG, legalEntityId: "le_a" });
    const b = new Ledger(store, { orgId: ORG, legalEntityId: "le_b" });
    const entry = a.postEntry({ date: DATE }, [
      { accountKind: "CASH", debit: cents(1n) },
      { accountKind: "OWNER_EQUITY", credit: cents(1n) },
    ]);
    expect(() => b.reverseEntry(entry.id, "nope")).toThrow(/not found in this tenant/);
  });
});

describe("PROPERTY: postings and balances", () => {
  const debitNormal: AccountKind[] = [
    "CASH",
    "ACCOUNTS_RECEIVABLE",
    "OPERATING_EXPENSE",
    "HORSE_ASSET",
  ];
  const creditNormal: AccountKind[] = ["ACCOUNTS_PAYABLE", "OPERATING_INCOME", "OWNER_EQUITY"];

  it("balanceOf equals the hand-summed expected for any posting sequence", () => {
    const entryArb = fc.record({
      debitKind: fc.constantFrom(...debitNormal),
      creditKind: fc.constantFrom(...creditNormal),
      amount: fc.bigInt({ min: 1n, max: 10n ** 9n }),
    });

    fc.assert(
      fc.property(fc.array(entryArb, { maxLength: 40 }), (entries) => {
        const { ledger } = makeLedger();
        const expected = new Map<AccountKind, bigint>();
        const bump = (k: AccountKind, delta: bigint) =>
          expected.set(k, (expected.get(k) ?? 0n) + delta);

        for (const e of entries) {
          ledger.postEntry({ date: DATE }, [
            { accountKind: e.debitKind, debit: cents(e.amount) },
            { accountKind: e.creditKind, credit: cents(e.amount) },
          ]);
          bump(e.debitKind, e.amount); // debit-normal: +debit
          bump(e.creditKind, e.amount); // credit-normal: +credit
        }

        for (const k of [...debitNormal, ...creditNormal]) {
          expect(ledger.balanceOf(k)).toBe(expected.get(k) ?? 0n);
        }
      }),
    );
  });

  it("a reversal always restores every affected balance", () => {
    const lineArb = fc.record({
      debitKind: fc.constantFrom(...debitNormal),
      creditKind: fc.constantFrom(...creditNormal),
      amount: fc.bigInt({ min: 1n, max: 10n ** 9n }),
    });

    fc.assert(
      fc.property(fc.array(lineArb, { maxLength: 20 }), lineArb, (preface, target) => {
        const { ledger } = makeLedger();
        for (const e of preface) {
          ledger.postEntry({ date: DATE }, [
            { accountKind: e.debitKind, debit: cents(e.amount) },
            { accountKind: e.creditKind, credit: cents(e.amount) },
          ]);
        }
        const snapshot = (): Record<string, bigint> => {
          const out: Record<string, bigint> = {};
          for (const k of [...debitNormal, ...creditNormal]) out[k] = ledger.balanceOf(k) as bigint;
          return out;
        };
        const before = snapshot();
        const lines: JournalLineInput[] = [
          { accountKind: target.debitKind, debit: cents(target.amount) },
          { accountKind: target.creditKind, credit: cents(target.amount) },
        ];
        const entry = ledger.postEntry({ date: DATE }, lines);
        ledger.reverseEntry(entry.id, "revert");
        expect(snapshot()).toEqual(before);
      }),
    );
  });
});
