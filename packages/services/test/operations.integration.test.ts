import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { Ledger, cents } from "@tote/core";
import { PrismaLedgerStore } from "@tote/db";
import {
  runPayroll,
  apAging,
  recordShipment,
  recordInsurancePolicy,
  recordInsuranceClaim,
  approveVendorBill,
  type ServiceContext,
} from "../src/index.js";

const HAS_DB = Boolean(process.env.DATABASE_URL);
const ORG = "org_ops";
const LE = "le_ops";

let prisma: PrismaClient;
let ctx: ServiceContext;

async function reset() {
  await prisma.reminder.deleteMany({ where: { orgId: ORG } });
  await prisma.insuranceClaim.deleteMany({ where: { policy: { orgId: ORG } } });
  await prisma.insurancePolicy.deleteMany({ where: { orgId: ORG } });
  await prisma.shipmentHorse.deleteMany({ where: { shipment: { orgId: ORG } } });
  await prisma.shipment.deleteMany({ where: { orgId: ORG } });
  await prisma.payrollLine.deleteMany({ where: { run: { orgId: ORG } } });
  await prisma.payrollRun.deleteMany({ where: { orgId: ORG } });
  await prisma.employee.deleteMany({ where: { orgId: ORG } });
  await prisma.vendorBill.deleteMany({ where: { orgId: ORG } });
  await prisma.journalEntry.deleteMany({ where: { orgId: ORG } });
  await prisma.horse.deleteMany({ where: { orgId: ORG } });
  await prisma.party.deleteMany({ where: { orgId: ORG } });
}

async function seed() {
  await reset();
  await prisma.org.upsert({ where: { id: ORG }, create: { id: ORG, name: "Ops" }, update: {} });
  await prisma.legalEntity.upsert({
    where: { id: LE },
    create: { id: LE, orgId: ORG, name: "Ops LE" },
    update: {},
  });
  await prisma.party.createMany({
    data: [
      { id: "emp1p", orgId: ORG, type: "EMPLOYEE", name: "Groom" },
      { id: "vend1", orgId: ORG, type: "VENDOR", name: "Vendor" },
    ],
  });
  await prisma.horse.createMany({
    data: [
      { id: "oh1", orgId: ORG, name: "Horse 1" },
      { id: "oh2", orgId: ORG, name: "Horse 2" },
    ],
  });
  await prisma.employee.create({ data: { id: "emp1", orgId: ORG, partyId: "emp1p", isW2: true } });
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

describe.skipIf(!HAS_DB)("operational breadth (Phase 5 DoD)", () => {
  it("runs payroll to the ledger", async () => {
    const { total } = await runPayroll(ctx, {
      periodStart: new Date("2026-06-01T00:00:00Z"),
      periodEnd: new Date("2026-06-15T00:00:00Z"),
      lines: [{ employeeId: "emp1", grossCents: cents(180000n) }],
    });
    expect(total).toBe(180000n);
    const l = ledger();
    expect(await l.balanceOf("WAGES_PAYABLE", { partyId: "emp1p" })).toBe(180000n);
    expect(await l.balanceOf("OPERATING_EXPENSE")).toBe(180000n);
  });

  it("produces an AP aging report bucketed by bill age", async () => {
    const now = new Date("2026-07-01T00:00:00Z");
    await approveVendorBill(ctx, {
      vendorPartyId: "vend1",
      amount: cents(100000n),
      billDate: new Date("2026-06-20T00:00:00Z"), // ~11 days -> current
    });
    await approveVendorBill(ctx, {
      vendorPartyId: "vend1",
      amount: cents(50000n),
      billDate: new Date("2026-04-01T00:00:00Z"), // ~91 days -> 90+
    });
    const rows = await apAging(ctx, now);
    const row = rows.find((r) => r.vendorPartyId === "vend1")!;
    expect(row.total).toBe(150000n);
    expect(row.current).toBe(100000n);
    expect(row.d90plus).toBe(50000n);
  });

  it("ships a horse with cost split across owners/horses", async () => {
    const { perHorse } = await recordShipment(ctx, {
      shipDate: new Date("2026-06-10T00:00:00Z"),
      fromLoc: "Belmont",
      toLoc: "Saratoga",
      totalCents: cents(90001n), // odd cent -> largest remainder
      horseIds: ["oh1", "oh2"],
    });
    const sum = perHorse.reduce((a, p) => a + (p.cost as bigint), 0n);
    expect(sum).toBe(90001n);
    const l = ledger();
    expect(await l.balanceOf("OPERATING_EXPENSE", { horseId: "oh1" })).toBe(45001n);
    expect(await l.balanceOf("OPERATING_EXPENSE", { horseId: "oh2" })).toBe(45000n);
  });

  it("fires an insurance renewal reminder and posts a claim recovery as income", async () => {
    const { policyId } = await recordInsurancePolicy(ctx, {
      carrier: "Bluegrass Mutual",
      premiumCents: cents(300000n),
      startDate: new Date("2026-01-01T00:00:00Z"),
      endDate: new Date("2026-12-31T00:00:00Z"),
      horseId: "oh1",
    });
    const reminder = await prisma.reminder.findFirst({
      where: { orgId: ORG, entityType: "InsurancePolicy", entityId: policyId },
    });
    expect(reminder?.message).toContain("renewal");

    const l = ledger();
    expect(await l.balanceOf("OPERATING_EXPENSE", { horseId: "oh1" })).toBe(300000n);

    await recordInsuranceClaim(ctx, {
      policyId,
      recoveryCents: cents(120000n),
      filedDate: new Date("2026-08-01T00:00:00Z"),
    });
    expect(await l.balanceOf("OPERATING_INCOME", { horseId: "oh1" })).toBe(120000n);
    expect(await l.balanceOf("CASH")).toBe((-300000n + 120000n) as bigint);
  });
});
