import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { Ledger, cents } from "@tote/core";
import { PrismaLedgerStore } from "@tote/db";
import {
  approveVendorBill,
  runMonthlyInvoices,
  recordOwnerPayment,
  importVendorBills,
  monthPeriod,
  type ServiceContext,
} from "../src/index.js";

const HAS_DB = Boolean(process.env.DATABASE_URL);
const ORG = "org_svc";
const LE = "le_svc";

let prisma: PrismaClient;
let ctx: ServiceContext;

async function reset() {
  await prisma.payment.deleteMany({ where: { orgId: ORG } });
  await prisma.invoice.deleteMany({ where: { orgId: ORG } });
  await prisma.vendorBill.deleteMany({ where: { orgId: ORG } });
  await prisma.journalEntry.deleteMany({ where: { orgId: ORG } });
  await prisma.ownership.deleteMany({ where: { orgId: ORG } });
  await prisma.syndicateMembership.deleteMany({ where: { orgId: ORG } });
  await prisma.trainingRate.deleteMany({ where: { orgId: ORG } });
  await prisma.category.deleteMany({ where: { orgId: ORG } });
  await prisma.horse.deleteMany({ where: { orgId: ORG } });
  await prisma.party.deleteMany({ where: { orgId: ORG } });
}

const FROM = new Date("2025-01-01T00:00:00Z");

async function seed() {
  await reset();
  await prisma.org.upsert({ where: { id: ORG }, create: { id: ORG, name: "Svc" }, update: {} });
  await prisma.legalEntity.upsert({
    where: { id: LE },
    create: { id: LE, orgId: ORG, name: "Svc LE" },
    update: {},
  });
  // Horse owned by a syndicate (50%) + individual (50%); syndicate has 2 members.
  await prisma.party.createMany({
    data: [
      { id: "syn", orgId: ORG, type: "SYNDICATE", name: "Syn" },
      { id: "m1", orgId: ORG, type: "INDIVIDUAL", name: "M1" },
      { id: "m2", orgId: ORG, type: "INDIVIDUAL", name: "M2" },
      { id: "ind", orgId: ORG, type: "INDIVIDUAL", name: "Ind" },
      { id: "vend", orgId: ORG, type: "VENDOR", name: "VetCo" },
    ],
  });
  await prisma.syndicateMembership.createMany({
    data: [
      { orgId: ORG, syndicateId: "syn", memberPartyId: "m1", basisPoints: 6000, from: FROM },
      { orgId: ORG, syndicateId: "syn", memberPartyId: "m2", basisPoints: 4000, from: FROM },
    ],
  });
  await prisma.horse.create({ data: { id: "h1", orgId: ORG, name: "Runner" } });
  await prisma.ownership.createMany({
    data: [
      { orgId: ORG, horseId: "h1", partyId: "syn", basisPoints: 5000, from: FROM },
      { orgId: ORG, horseId: "h1", partyId: "ind", basisPoints: 5000, from: FROM },
    ],
  });
  await prisma.trainingRate.create({
    data: { orgId: ORG, horseId: "h1", dailyRateCents: 10000n, from: FROM }, // $100/day
  });
  await prisma.category.create({
    data: { id: "svc_transport", orgId: ORG, name: "Transport", markupBp: 1000 }, // 10%
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

describe.skipIf(!HAS_DB)("monthly invoice run (Phase 1 DoD)", () => {
  it("bills training + passthrough, split by ownership, reconciling to the penny", async () => {
    // A $500 transport bill on the horse, 10% markup -> $550 passed through.
    await approveVendorBill(ctx, {
      vendorPartyId: "vend",
      amount: cents(50000n),
      billDate: new Date("2026-06-10T00:00:00Z"),
      horseId: "h1",
      categoryId: "svc_transport",
    });

    const june = monthPeriod(2026, 6); // 30 days
    const result = await runMonthlyInvoices(ctx, june);

    // Training: 30 * $100 = $3000. Passthrough: $500 + $50 markup = $550.
    // Leaf owners: ind 50%, m1 30%, m2 20%.
    expect(result.invoicesCreated).toBe(3);
    expect(result.totalBilled).toBe(355000n); // $3000 + $550

    const l = ledger();
    // Each owner's AR equals their share of (3000 + 550).
    expect(await l.balanceOf("ACCOUNTS_RECEIVABLE", { partyId: "ind" })).toBe(177500n); // 50%
    expect(await l.balanceOf("ACCOUNTS_RECEIVABLE", { partyId: "m1" })).toBe(106500n); // 30%
    expect(await l.balanceOf("ACCOUNTS_RECEIVABLE", { partyId: "m2" })).toBe(71000n); // 20%

    // AR across owners sums exactly to what was billed.
    const arTotal = 177500n + 106500n + 71000n;
    expect(arTotal).toBe(355000n);

    // Passthrough fully recovers the expense; only markup + training remain as income.
    expect(await l.balanceOf("OPERATING_EXPENSE", { horseId: "h1" })).toBe(0n);
    expect(await l.balanceOf("OPERATING_INCOME", { horseId: "h1" })).toBe(305000n); // 3000 training + 50 markup
  });

  it("is idempotent — re-running does not double-post", async () => {
    await approveVendorBill(ctx, {
      vendorPartyId: "vend",
      amount: cents(50000n),
      billDate: new Date("2026-06-10T00:00:00Z"),
      horseId: "h1",
      categoryId: "svc_transport",
    });
    const june = monthPeriod(2026, 6);

    const first = await runMonthlyInvoices(ctx, june);
    const l = ledger();
    const arAfterFirst = await l.balanceOf("ACCOUNTS_RECEIVABLE", { partyId: "ind" });

    const second = await runMonthlyInvoices(ctx, june);
    expect(second.invoicesCreated).toBe(0);
    expect(second.skipped).toBe(true);
    expect(await l.balanceOf("ACCOUNTS_RECEIVABLE", { partyId: "ind" })).toBe(arAfterFirst);

    const invoices = await prisma.invoice.count({ where: { orgId: ORG, runKey: first.runKey } });
    expect(invoices).toBe(3); // still 3, not 6
  });

  it("records a payment that settles an owner's balance", async () => {
    const june = monthPeriod(2026, 6);
    await runMonthlyInvoices(ctx, june);
    const l = ledger();
    const owed = await l.balanceOf("ACCOUNTS_RECEIVABLE", { partyId: "ind" }); // 150000 (training only)
    expect(owed).toBe(150000n);

    const invoice = await prisma.invoice.findFirst({
      where: { orgId: ORG, ownerPartyId: "ind", runKey: "2026-06" },
    });
    await recordOwnerPayment(ctx, {
      partyId: "ind",
      amount: cents(150000n),
      method: "ACH",
      receivedAt: new Date("2026-07-02T00:00:00Z"),
      applications: [{ invoiceId: invoice!.id, amount: cents(150000n) }],
    });

    expect(await l.balanceOf("ACCOUNTS_RECEIVABLE", { partyId: "ind" })).toBe(0n);
    const settled = await prisma.invoice.findUnique({ where: { id: invoice!.id } });
    expect(settled?.status).toBe("PAID");
  });

  it("imports vendor bills from a mapped CSV, creating missing entities", async () => {
    const csv = [
      "Date,Vendor,Horse,Category,Memo,Amount",
      "2026-06-03,VetCo,Runner,Veterinary,Lameness exam,\"$1,250.00\"",
      "2026-06-05,New Farrier,Runner,Farrier,Trim,180",
    ].join("\n");

    const result = await importVendorBills(
      ctx,
      csv,
      { date: "Date", vendor: "Vendor", horse: "Horse", category: "Category", description: "Memo", amount: "Amount" },
      { createMissing: true },
    );
    expect(result.imported).toBe(2);
    expect(result.errors).toHaveLength(0);
    expect(result.total).toBe(143000n); // $1250 + $180

    // The new farrier vendor was created.
    const farrier = await prisma.party.findFirst({ where: { orgId: ORG, name: "New Farrier" } });
    expect(farrier).not.toBeNull();
    const l = ledger();
    expect(await l.balanceOf("ACCOUNTS_PAYABLE", { partyId: "vend" })).toBe(125000n);
  });
});
