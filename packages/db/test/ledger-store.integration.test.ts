import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import fc from "fast-check";
import { PrismaClient } from "@prisma/client";
import { Ledger, cents, type AccountKind } from "@tote/core";
import { PrismaLedgerStore } from "../src/ledger-store.js";

// These tests require a Postgres reachable at DATABASE_URL with the schema
// migrated. The repo's `pnpm db:test` target spins one up in Docker. Without a
// DATABASE_URL the suite is skipped so plain `pnpm test` still passes.
const HAS_DB = Boolean(process.env.DATABASE_URL);

let prisma: PrismaClient;
let store: PrismaLedgerStore;

const ORG = "org_it";
const DATE = new Date("2026-03-01T00:00:00Z");

function ledger(legalEntityId: string) {
  return new Ledger(store, { orgId: ORG, legalEntityId });
}

async function reset() {
  // Append-only in production; tests truncate to isolate cases.
  await prisma.journalLine.deleteMany({ where: { orgId: ORG } });
  await prisma.journalEntry.deleteMany({ where: { orgId: ORG } });
}

describe.skipIf(!HAS_DB)("PrismaLedgerStore (integration)", () => {
  beforeAll(async () => {
    prisma = new PrismaClient();
    store = new PrismaLedgerStore(prisma);
    // Seed the legal entities the entries reference (FK to legal_entities).
    await prisma.org.upsert({ where: { id: ORG }, create: { id: ORG, name: "IT Org" }, update: {} });
    for (const id of ["le_a", "le_b"]) {
      await prisma.legalEntity.upsert({
        where: { id },
        create: { id, orgId: ORG, name: id },
        update: {},
      });
    }
  });

  afterAll(async () => {
    await reset();
    await prisma.$disconnect();
  });

  beforeEach(reset);

  it("posts, derives balances, and computes net position", async () => {
    const l = ledger("le_a");
    await l.postEntry({ date: DATE, memo: "vendor bill" }, [
      { accountKind: "OPERATING_EXPENSE", debit: cents(5000n), horseId: "h1" },
      { accountKind: "ACCOUNTS_PAYABLE", credit: cents(5000n), partyId: "vendor_1" },
    ]);
    await l.postEntry({ date: DATE }, [
      { accountKind: "CASH", debit: cents(10000n) },
      { accountKind: "OWNER_PURSE_PAYABLE", credit: cents(10000n), partyId: "p1" },
    ]);
    await l.postEntry({ date: DATE }, [
      { accountKind: "ACCOUNTS_RECEIVABLE", debit: cents(4000n), partyId: "p1" },
      { accountKind: "OPERATING_INCOME", credit: cents(4000n) },
    ]);

    expect(await l.balanceOf("OPERATING_EXPENSE", { horseId: "h1" })).toBe(5000n);
    expect(await l.balanceOf("ACCOUNTS_PAYABLE", { partyId: "vendor_1" })).toBe(5000n);
    expect(await l.balanceOf("CASH")).toBe(10000n);
    expect(await l.netPosition("p1")).toBe(6000n);
  });

  it("rejects an unbalanced entry (nothing persists)", async () => {
    const l = ledger("le_a");
    await expect(
      l.postEntry({ date: DATE }, [
        { accountKind: "CASH", debit: cents(1n) },
        { accountKind: "OWNER_EQUITY", credit: cents(2n) },
      ]),
    ).rejects.toThrow(/does not balance/);
    expect(await l.balanceOf("CASH")).toBe(0n);
  });

  it("reversal restores balances to pre-entry state", async () => {
    const l = ledger("le_a");
    const entry = await l.postEntry({ date: DATE }, [
      { accountKind: "OPERATING_EXPENSE", debit: cents(7500n), horseId: "h1" },
      { accountKind: "ACCOUNTS_PAYABLE", credit: cents(7500n), partyId: "v2" },
    ]);
    expect(await l.balanceOf("ACCOUNTS_PAYABLE", { partyId: "v2" })).toBe(7500n);
    const rev = await l.reverseEntry(entry.id, "correction");
    expect(rev.reversalOf).toBe(entry.id);
    expect(await l.balanceOf("ACCOUNTS_PAYABLE", { partyId: "v2" })).toBe(0n);
    expect(await l.balanceOf("OPERATING_EXPENSE", { horseId: "h1" })).toBe(0n);
  });

  it("isolates tenants: one legal entity never sees another's lines", async () => {
    const a = ledger("le_a");
    const b = ledger("le_b");
    await a.postEntry({ date: DATE }, [
      { accountKind: "CASH", debit: cents(9999n) },
      { accountKind: "OWNER_EQUITY", credit: cents(9999n) },
    ]);
    expect(await a.balanceOf("CASH")).toBe(9999n);
    expect(await b.balanceOf("CASH")).toBe(0n);
    // And b cannot reverse a's entry.
    const entry = await a.postEntry({ date: DATE }, [
      { accountKind: "CASH", debit: cents(1n) },
      { accountKind: "OWNER_EQUITY", credit: cents(1n) },
    ]);
    await expect(b.reverseEntry(entry.id, "nope")).rejects.toThrow(/not found in this tenant/);
  });

  it("PROPERTY: derived balance matches hand-summed for any posting sequence", async () => {
    const debitNormal: AccountKind[] = ["CASH", "ACCOUNTS_RECEIVABLE", "OPERATING_EXPENSE"];
    const creditNormal: AccountKind[] = ["ACCOUNTS_PAYABLE", "OPERATING_INCOME", "OWNER_EQUITY"];
    const entryArb = fc.record({
      debitKind: fc.constantFrom(...debitNormal),
      creditKind: fc.constantFrom(...creditNormal),
      amount: fc.bigInt({ min: 1n, max: 10n ** 7n }),
    });

    await fc.assert(
      fc.asyncProperty(fc.array(entryArb, { minLength: 1, maxLength: 12 }), async (entries) => {
        await reset();
        const l = ledger("le_a");
        const expected = new Map<AccountKind, bigint>();
        for (const e of entries) {
          await l.postEntry({ date: DATE }, [
            { accountKind: e.debitKind, debit: cents(e.amount) },
            { accountKind: e.creditKind, credit: cents(e.amount) },
          ]);
          expected.set(e.debitKind, (expected.get(e.debitKind) ?? 0n) + e.amount);
          expected.set(e.creditKind, (expected.get(e.creditKind) ?? 0n) + e.amount);
        }
        for (const k of [...debitNormal, ...creditNormal]) {
          expect(await l.balanceOf(k)).toBe(expected.get(k) ?? 0n);
        }
      }),
      { numRuns: 15 },
    );
  });
});
