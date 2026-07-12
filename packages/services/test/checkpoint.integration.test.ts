import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import fc from "fast-check";
import { PrismaClient } from "@prisma/client";
import { Ledger, cents, type AccountKind } from "@tote/core";
import { PrismaLedgerStore } from "@tote/db";
import { createCheckpoint, balanceOfAt, type ServiceContext } from "../src/index.js";

const HAS_DB = Boolean(process.env.DATABASE_URL);
const ORG = "org_ckpt";
const LE = "le_ckpt";

let prisma: PrismaClient;
let ctx: ServiceContext;

async function reset() {
  await prisma.checkpointBalance.deleteMany({ where: { checkpoint: { orgId: ORG } } });
  await prisma.ledgerCheckpoint.deleteMany({ where: { orgId: ORG } });
  await prisma.journalEntry.deleteMany({ where: { orgId: ORG } });
}

async function seed() {
  await reset();
  await prisma.org.upsert({ where: { id: ORG }, create: { id: ORG, name: "Ckpt" }, update: {} });
  await prisma.legalEntity.upsert({
    where: { id: LE },
    create: { id: LE, orgId: ORG, name: "Ckpt LE" },
    update: {},
  });
}

function ledger() {
  return new Ledger(new PrismaLedgerStore(prisma), { orgId: ORG, legalEntityId: LE });
}
const DATE = new Date("2026-01-01T00:00:00Z");

beforeAll(async () => {
  if (!HAS_DB) return;
  prisma = new PrismaClient();
  ctx = { prisma, orgId: ORG, legalEntityId: LE };
});
afterAll(async () => {
  if (!HAS_DB) return;
  await reset();
  await prisma.$disconnect();
});
beforeEach(async () => {
  if (HAS_DB) await seed();
});

describe.skipIf(!HAS_DB)("balance checkpoints (Phase 8 — derived truth preserved)", () => {
  it("checkpoint + replay equals full derivation across dimensions", async () => {
    const l = ledger();
    // Pre-checkpoint activity.
    await l.postEntry({ date: DATE }, [
      { accountKind: "OPERATING_EXPENSE", debit: cents(5000n), horseId: "h1" },
      { accountKind: "ACCOUNTS_PAYABLE", credit: cents(5000n), partyId: "v1" },
    ]);
    await l.postEntry({ date: DATE }, [
      { accountKind: "ACCOUNTS_RECEIVABLE", debit: cents(8000n), partyId: "o1" },
      { accountKind: "OPERATING_INCOME", credit: cents(8000n), horseId: "h1" },
    ]);

    const { groups } = await createCheckpoint(ctx);
    expect(groups).toBeGreaterThan(0);

    // Post-checkpoint activity — must be replayed forward.
    await l.postEntry({ date: DATE }, [
      { accountKind: "CASH", debit: cents(3000n) },
      { accountKind: "ACCOUNTS_RECEIVABLE", credit: cents(3000n), partyId: "o1" },
    ]);

    for (const [kind, dims] of [
      ["OPERATING_EXPENSE", {}],
      ["OPERATING_EXPENSE", { horseId: "h1" }],
      ["ACCOUNTS_RECEIVABLE", { partyId: "o1" }],
      ["ACCOUNTS_PAYABLE", { partyId: "v1" }],
      ["CASH", {}],
      ["OPERATING_INCOME", { horseId: "h1" }],
    ] as Array<[AccountKind, Record<string, string>]>) {
      const full = await l.balanceOf(kind, dims);
      const accelerated = await balanceOfAt(ctx, kind, dims);
      expect(accelerated).toBe(full);
    }
  });

  it("PROPERTY: matches full derivation for any split of postings around a checkpoint", async () => {
    const debitKinds: AccountKind[] = ["CASH", "ACCOUNTS_RECEIVABLE", "OPERATING_EXPENSE"];
    const creditKinds: AccountKind[] = ["ACCOUNTS_PAYABLE", "OPERATING_INCOME", "OWNER_EQUITY"];
    const entryArb = fc.record({
      d: fc.constantFrom(...debitKinds),
      c: fc.constantFrom(...creditKinds),
      amt: fc.bigInt({ min: 1n, max: 10n ** 7n }),
    });

    await fc.assert(
      fc.asyncProperty(
        fc.array(entryArb, { minLength: 1, maxLength: 8 }),
        fc.array(entryArb, { maxLength: 8 }),
        async (before, after) => {
          await reset();
          await prisma.org.upsert({ where: { id: ORG }, create: { id: ORG, name: "Ckpt" }, update: {} });
          await prisma.legalEntity.upsert({
            where: { id: LE },
            create: { id: LE, orgId: ORG, name: "Ckpt LE" },
            update: {},
          });
          const l = ledger();
          for (const e of before) {
            await l.postEntry({ date: DATE }, [
              { accountKind: e.d, debit: cents(e.amt) },
              { accountKind: e.c, credit: cents(e.amt) },
            ]);
          }
          await createCheckpoint(ctx);
          for (const e of after) {
            await l.postEntry({ date: DATE }, [
              { accountKind: e.d, debit: cents(e.amt) },
              { accountKind: e.c, credit: cents(e.amt) },
            ]);
          }
          for (const k of [...debitKinds, ...creditKinds]) {
            expect(await balanceOfAt(ctx, k)).toBe(await l.balanceOf(k));
          }
        },
      ),
      { numRuns: 8 },
    );
  });
});
