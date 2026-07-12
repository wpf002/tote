import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { Ledger, cents } from "@tote/core";
import { PrismaLedgerStore } from "@tote/db";
import { auditLedger, type ServiceContext } from "../src/index.js";

const HAS_DB = Boolean(process.env.DATABASE_URL);
const ORG = "org_audit";
const LE = "le_audit";
const DATE = new Date("2026-06-01T00:00:00Z");

let prisma: PrismaClient;
let ctx: ServiceContext;

async function reset() {
  await prisma.journalEntry.deleteMany({ where: { orgId: ORG } });
}
async function seed() {
  await reset();
  await prisma.org.upsert({ where: { id: ORG }, create: { id: ORG, name: "Audit" }, update: {} });
  await prisma.legalEntity.upsert({
    where: { id: LE },
    create: { id: LE, orgId: ORG, name: "Audit LE" },
    update: {},
  });
}
function ledger() {
  return new Ledger(new PrismaLedgerStore(prisma), { orgId: ORG, legalEntityId: LE });
}

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

describe.skipIf(!HAS_DB)("ledger self-audit (the trust surface)", () => {
  it("reports a healthy book when everything balances", async () => {
    const l = ledger();
    await l.postEntry({ date: DATE }, [
      { accountKind: "OPERATING_EXPENSE", debit: cents(5000n) },
      { accountKind: "ACCOUNTS_PAYABLE", credit: cents(5000n) },
    ]);
    const reversal = await l.postEntry({ date: DATE }, [
      { accountKind: "CASH", debit: cents(1000n) },
      { accountKind: "OWNER_EQUITY", credit: cents(1000n) },
    ]);
    await l.reverseEntry(reversal.id, "test correction");

    const report = await auditLedger(ctx);
    expect(report.healthy).toBe(true);
    expect(report.totalDebits).toBe(report.totalCredits);
    expect(report.unbalancedEntryIds).toHaveLength(0);
    expect(report.reversalCount).toBe(1);
    expect(report.checks.every((c) => c.ok)).toBe(true);
  });

  it("detects an unbalanced entry inserted out-of-band", async () => {
    const l = ledger();
    await l.postEntry({ date: DATE }, [
      { accountKind: "CASH", debit: cents(2000n) },
      { accountKind: "OWNER_EQUITY", credit: cents(2000n) },
    ]);
    // Bypass the engine to simulate corruption the audit must catch.
    await prisma.journalEntry.create({
      data: {
        id: "corrupt_1",
        orgId: ORG,
        legalEntityId: LE,
        date: DATE,
        lines: {
          create: [
            { id: "cl1", orgId: ORG, legalEntityId: LE, accountKind: "CASH", debit: 999n, credit: 0n },
            { id: "cl2", orgId: ORG, legalEntityId: LE, accountKind: "OWNER_EQUITY", debit: 0n, credit: 500n },
          ],
        },
      },
    });

    const report = await auditLedger(ctx);
    expect(report.healthy).toBe(false);
    expect(report.unbalancedEntryIds).toContain("corrupt_1");
    expect(report.checks.find((c) => c.name === "Debits equal credits")?.ok).toBe(false);
    expect(report.checks.find((c) => c.name === "Every entry balances")?.ok).toBe(false);
  });
});
