import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { Ledger, cents } from "@tote/core";
import { PrismaLedgerStore } from "@tote/db";
import {
  recordHorsePurchase,
  recordHorseSale,
  depreciationSchedule,
  generate1099,
  ownerTaxPack,
  approveVendorBill,
  recordAndDisbursePurse,
  type ServiceContext,
} from "../src/index.js";

const HAS_DB = Boolean(process.env.DATABASE_URL);
const ORG = "org_asset";
const LE = "le_asset";
const FROM = new Date("2025-01-01T00:00:00Z");

let prisma: PrismaClient;
let ctx: ServiceContext;

async function reset() {
  await prisma.horseTransaction.deleteMany({ where: { orgId: ORG } });
  await prisma.purse.deleteMany({ where: { orgId: ORG } });
  await prisma.vendorBill.deleteMany({ where: { orgId: ORG } });
  await prisma.journalEntry.deleteMany({ where: { orgId: ORG } });
  await prisma.ownership.deleteMany({ where: { orgId: ORG } });
  await prisma.horse.deleteMany({ where: { orgId: ORG } });
  await prisma.party.deleteMany({ where: { orgId: ORG } });
}

async function seed() {
  await reset();
  await prisma.org.upsert({ where: { id: ORG }, create: { id: ORG, name: "Asset" }, update: {} });
  await prisma.legalEntity.upsert({
    where: { id: LE },
    create: { id: LE, orgId: ORG, name: "Asset LE" },
    update: {},
  });
  await prisma.party.createMany({
    data: [
      { id: "aown", orgId: ORG, type: "INDIVIDUAL", name: "Owner" },
      { id: "avend", orgId: ORG, type: "VENDOR", name: "Vendor" },
    ],
  });
  await prisma.horse.create({ data: { id: "ahorse", orgId: ORG, name: "Asset Horse" } });
  await prisma.ownership.create({
    data: { orgId: ORG, horseId: "ahorse", partyId: "aown", basisPoints: 10000, from: FROM },
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

describe("depreciation schedule (pure)", () => {
  it("splits basis penny-exact over the life; Section 179 front-loads", () => {
    const three = depreciationSchedule(cents(100000n), "racehorse3", 2026);
    expect(three).toHaveLength(3);
    expect(three.reduce((a, x) => a + (x.amountCents as bigint), 0n)).toBe(100000n);
    const s179 = depreciationSchedule(cents(100000n), "section179", 2026);
    expect(s179).toEqual([{ year: 2026, amountCents: 100000n }]);
  });
});

describe.skipIf(!HAS_DB)("asset & tax (Phase 6 DoD)", () => {
  it("capitalizes a purchase and posts gain on sale", async () => {
    await recordHorsePurchase(ctx, {
      horseId: "ahorse",
      costCents: cents(5_000_000n), // $50k basis
      date: new Date("2026-01-10T00:00:00Z"),
    });
    const l = ledger();
    expect(await l.balanceOf("HORSE_ASSET", { horseId: "ahorse" })).toBe(5_000_000n);

    const sale = await recordHorseSale(ctx, {
      horseId: "ahorse",
      saleCents: cents(8_000_000n), // $80k
      date: new Date("2026-11-01T00:00:00Z"),
    });
    expect(sale.basisCents).toBe(5_000_000n);
    expect(sale.gainCents).toBe(3_000_000n);
    expect(await l.balanceOf("HORSE_ASSET", { horseId: "ahorse" })).toBe(0n); // removed at basis
    expect(await l.balanceOf("OPERATING_INCOME", { horseId: "ahorse" })).toBe(3_000_000n);
  });

  it("posts a loss when the sale is below basis", async () => {
    await recordHorsePurchase(ctx, {
      horseId: "ahorse",
      costCents: cents(5_000_000n),
      date: new Date("2026-01-10T00:00:00Z"),
    });
    const sale = await recordHorseSale(ctx, {
      horseId: "ahorse",
      saleCents: cents(2_000_000n),
      date: new Date("2026-11-01T00:00:00Z"),
    });
    expect(sale.gainCents).toBe(-3_000_000n);
    const l = ledger();
    expect(await l.balanceOf("HORSE_ASSET", { horseId: "ahorse" })).toBe(0n);
    expect(await l.balanceOf("OPERATING_EXPENSE", { horseId: "ahorse" })).toBe(3_000_000n); // loss
  });

  it("generates 1099s over the reporting threshold", async () => {
    // Bill + pay the vendor $1000 in 2026.
    const bill = await approveVendorBill(ctx, {
      vendorPartyId: "avend",
      amount: cents(100000n),
      billDate: new Date("2026-03-01T00:00:00Z"),
    });
    const l = ledger();
    // Pay it: Dr AP / Cr Cash.
    await l.postEntry({ date: new Date("2026-03-15T00:00:00Z"), memo: "Pay vendor" }, [
      { accountKind: "ACCOUNTS_PAYABLE", debit: cents(100000n), partyId: "avend" },
      { accountKind: "CASH", credit: cents(100000n) },
    ]);
    void bill;

    const forms = await generate1099(ctx, 2026);
    expect(forms).toHaveLength(1);
    expect(forms[0]).toMatchObject({ vendorPartyId: "avend", amountCents: 100000n });

    // Below-threshold vendors are excluded.
    const highThreshold = await generate1099(ctx, 2026, 200000n);
    expect(highThreshold).toHaveLength(0);
  });

  it("builds an owner year-end tax pack (purse income minus charges)", async () => {
    // Owner billed $2000 of charges, earns a $10000 purse.
    await ledger().postEntry({ date: new Date("2026-05-01T00:00:00Z"), memo: "Charge" }, [
      { accountKind: "ACCOUNTS_RECEIVABLE", debit: cents(200000n), partyId: "aown" },
      { accountKind: "OPERATING_INCOME", credit: cents(200000n) },
    ]);
    await recordAndDisbursePurse(ctx, {
      horseId: "ahorse",
      ownerNet: cents(1_000_000n),
      resultDate: new Date("2026-07-01T00:00:00Z"),
    });

    const pack = await ownerTaxPack(ctx, 2026, "aown");
    expect(pack.chargesCents).toBe(200000n);
    expect(pack.purseIncomeCents).toBe(1_000_000n);
    expect(pack.netCents).toBe(800000n);
  });
});
