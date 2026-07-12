import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { Ledger, cents } from "@tote/core";
import { PrismaLedgerStore } from "@tote/db";
import {
  recordAndDisbursePurse,
  applyPurseCreditToInvoices,
  runMonthlyInvoices,
  monthPeriod,
  type ServiceContext,
} from "../src/index.js";

const HAS_DB = Boolean(process.env.DATABASE_URL);
const ORG = "org_purse";
const LE = "le_purse";
const FROM = new Date("2025-01-01T00:00:00Z");

let prisma: PrismaClient;
let ctx: ServiceContext;

async function reset() {
  await prisma.payment.deleteMany({ where: { orgId: ORG } });
  await prisma.invoice.deleteMany({ where: { orgId: ORG } });
  await prisma.purse.deleteMany({ where: { orgId: ORG } });
  await prisma.journalEntry.deleteMany({ where: { orgId: ORG } });
  await prisma.ownership.deleteMany({ where: { orgId: ORG } });
  await prisma.syndicateMembership.deleteMany({ where: { orgId: ORG } });
  await prisma.trainingRate.deleteMany({ where: { orgId: ORG } });
  await prisma.horse.deleteMany({ where: { orgId: ORG } });
  await prisma.party.deleteMany({ where: { orgId: ORG } });
}

async function seed() {
  await reset();
  await prisma.org.upsert({ where: { id: ORG }, create: { id: ORG, name: "P" }, update: {} });
  await prisma.legalEntity.upsert({
    where: { id: LE },
    create: { id: LE, orgId: ORG, name: "P LE" },
    update: {},
  });
  await prisma.party.createMany({
    data: [
      { id: "psyn", orgId: ORG, type: "SYNDICATE", name: "Syn" },
      { id: "pa", orgId: ORG, type: "INDIVIDUAL", name: "A" },
      { id: "pb", orgId: ORG, type: "INDIVIDUAL", name: "B" },
      { id: "pc", orgId: ORG, type: "INDIVIDUAL", name: "C" },
    ],
  });
  await prisma.syndicateMembership.createMany({
    data: [
      { orgId: ORG, syndicateId: "psyn", memberPartyId: "pa", basisPoints: 6000, from: FROM },
      { orgId: ORG, syndicateId: "psyn", memberPartyId: "pb", basisPoints: 4000, from: FROM },
    ],
  });
  await prisma.horse.create({ data: { id: "ph", orgId: ORG, name: "P Horse" } });
  await prisma.ownership.createMany({
    data: [
      { orgId: ORG, horseId: "ph", partyId: "psyn", basisPoints: 5000, from: FROM },
      { orgId: ORG, horseId: "ph", partyId: "pc", basisPoints: 5000, from: FROM },
    ],
  });
  await prisma.trainingRate.create({
    data: { orgId: ORG, horseId: "ph", dailyRateCents: 10000n, from: FROM },
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

describe.skipIf(!HAS_DB)("purse disbursement + net-against-invoice (Phase 2 DoD)", () => {
  it("disburses a purse penny-exact to nested syndicate leaves", async () => {
    const { allocations } = await recordAndDisbursePurse(ctx, {
      horseId: "ph",
      ownerNet: cents(1_000_000n), // $10,000
      trainerCut: cents(100_000n),
      resultDate: new Date("2026-07-05T00:00:00Z"),
    });

    const byParty = Object.fromEntries(allocations.map((a) => [a.partyId, a.amount]));
    // pc 50% = 500000; syn 50% -> pa 30% = 300000, pb 20% = 200000
    expect(byParty).toEqual({ pc: 500000n, pa: 300000n, pb: 200000n });
    const sum = allocations.reduce((a, x) => a + (x.amount as bigint), 0n);
    expect(sum).toBe(1_000_000n);

    const l = ledger();
    expect(await l.balanceOf("OWNER_PURSE_PAYABLE", { partyId: "pa" })).toBe(300000n);
    expect(await l.balanceOf("PURSE_REVENUE")).toBe(100000n);
  });

  it("nets a partner's purse credit against their invoices, settling them", async () => {
    // Bill June training: 30 * $100 = $3000, split pc 50% / pa 30% / pb 20%.
    await runMonthlyInvoices(ctx, monthPeriod(2026, 6));
    const l = ledger();
    expect(await l.balanceOf("ACCOUNTS_RECEIVABLE", { partyId: "pa" })).toBe(90000n); // $900

    // A purse pays out; pa's payable is $3000.
    await recordAndDisbursePurse(ctx, {
      horseId: "ph",
      ownerNet: cents(1_000_000n),
      resultDate: new Date("2026-07-05T00:00:00Z"),
    });
    expect(await l.balanceOf("OWNER_PURSE_PAYABLE", { partyId: "pa" })).toBe(300000n);

    // Net pa's purse credit against what they owe.
    const result = await applyPurseCreditToInvoices(ctx, { partyId: "pa" });
    expect(result.applied).toBe(90000n); // only what was owed
    expect(result.invoicesSettled).toBe(1);

    // AR cleared; purse payable reduced by the applied amount.
    expect(await l.balanceOf("ACCOUNTS_RECEIVABLE", { partyId: "pa" })).toBe(0n);
    expect(await l.balanceOf("OWNER_PURSE_PAYABLE", { partyId: "pa" })).toBe(210000n); // 3000 - 900

    // Net position unchanged by the internal transfer: still owed 2100.
    expect(await l.netPosition("pa")).toBe(210000n);

    const invoice = await prisma.invoice.findFirst({ where: { orgId: ORG, ownerPartyId: "pa" } });
    expect(invoice?.status).toBe("PAID");
  });
});
