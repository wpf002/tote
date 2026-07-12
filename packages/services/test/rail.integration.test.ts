import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { Ledger, cents } from "@tote/core";
import { PrismaLedgerStore } from "@tote/db";
import {
  approveVendorBill,
  runMonthlyInvoices,
  monthPeriod,
  createPaymentIntent,
  handleRailWebhook,
  exportGeneralJournalCsv,
  importBankTransactions,
  proposeReconciliation,
  commitMatches,
  SandboxRail,
  type ServiceContext,
} from "../src/index.js";

const HAS_DB = Boolean(process.env.DATABASE_URL);
const ORG = "org_rail";
const LE = "le_rail";
const FROM = new Date("2025-01-01T00:00:00Z");
const SECRET = "whsec_test";

let prisma: PrismaClient;
let ctx: ServiceContext;
const rail = new SandboxRail();

async function reset() {
  await prisma.bankTransaction.deleteMany({ where: { bankAccount: { orgId: ORG } } });
  await prisma.bankAccount.deleteMany({ where: { orgId: ORG } });
  await prisma.paymentIntent.deleteMany({ where: { orgId: ORG } });
  await prisma.payment.deleteMany({ where: { orgId: ORG } });
  await prisma.invoice.deleteMany({ where: { orgId: ORG } });
  await prisma.vendorBill.deleteMany({ where: { orgId: ORG } });
  await prisma.journalEntry.deleteMany({ where: { orgId: ORG } });
  await prisma.ownership.deleteMany({ where: { orgId: ORG } });
  await prisma.trainingRate.deleteMany({ where: { orgId: ORG } });
  await prisma.horse.deleteMany({ where: { orgId: ORG } });
  await prisma.party.deleteMany({ where: { orgId: ORG } });
}

async function seed() {
  await reset();
  await prisma.org.upsert({ where: { id: ORG }, create: { id: ORG, name: "R" }, update: {} });
  await prisma.legalEntity.upsert({
    where: { id: LE },
    create: { id: LE, orgId: ORG, name: "R LE" },
    update: {},
  });
  await prisma.party.create({ data: { id: "own", orgId: ORG, type: "INDIVIDUAL", name: "Owner" } });
  await prisma.horse.create({ data: { id: "rh", orgId: ORG, name: "R Horse" } });
  await prisma.ownership.create({
    data: { orgId: ORG, horseId: "rh", partyId: "own", basisPoints: 10000, from: FROM },
  });
  await prisma.trainingRate.create({
    data: { orgId: ORG, horseId: "rh", dailyRateCents: 10000n, from: FROM },
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

describe.skipIf(!HAS_DB)("payment rail + GL export + reconciliation (Phase 3 DoD)", () => {
  it("settles an invoice online via a verified webhook — Tote holds nothing", async () => {
    await runMonthlyInvoices(ctx, monthPeriod(2026, 6)); // $3000 to Owner
    const invoice = await prisma.invoice.findFirst({ where: { orgId: ORG, ownerPartyId: "own" } });

    const intent = await createPaymentIntent(ctx, { invoiceId: invoice!.id, provider: rail });
    expect(intent.amountCents).toBe(300000n);

    // The provider posts a signed success webhook.
    const { payload, signature } = rail.buildEvent(
      { type: "payment_intent.succeeded", providerIntentId: intent.providerIntentId, amountCents: "300000" },
      SECRET,
    );
    const result = await handleRailWebhook(prisma, { payload, signature, secret: SECRET, provider: rail });
    expect(result.settled).toBe(true);

    const l = ledger();
    expect(await l.balanceOf("ACCOUNTS_RECEIVABLE", { partyId: "own" })).toBe(0n);
    expect(await l.balanceOf("CASH")).toBe(300000n); // landed in the trainer's account
    const settled = await prisma.invoice.findUnique({ where: { id: invoice!.id } });
    expect(settled?.status).toBe("PAID");
  });

  it("rejects a webhook with a bad signature and is idempotent on replay", async () => {
    await runMonthlyInvoices(ctx, monthPeriod(2026, 6));
    const invoice = await prisma.invoice.findFirst({ where: { orgId: ORG, ownerPartyId: "own" } });
    const intent = await createPaymentIntent(ctx, { invoiceId: invoice!.id, provider: rail });
    const evt = rail.buildEvent(
      { type: "payment_intent.succeeded", providerIntentId: intent.providerIntentId, amountCents: "300000" },
      SECRET,
    );

    await expect(
      handleRailWebhook(prisma, { payload: evt.payload, signature: "deadbeef", secret: SECRET, provider: rail }),
    ).rejects.toThrow(/signature/);

    const first = await handleRailWebhook(prisma, { ...evt, secret: SECRET, provider: rail });
    const second = await handleRailWebhook(prisma, { ...evt, secret: SECRET, provider: rail });
    expect(first.settled).toBe(true);
    expect(second.settled).toBe(false); // already settled — no double post
    expect(await ledger().balanceOf("CASH")).toBe(300000n);
  });

  it("exports a balanced QuickBooks general journal for the period", async () => {
    await approveVendorBill(ctx, {
      vendorPartyId: "own",
      amount: cents(20000n),
      billDate: new Date("2026-06-05T00:00:00Z"),
      horseId: "rh",
    });
    const csv = await exportGeneralJournalCsv(ctx, monthPeriod(2026, 6));
    const lines = csv.trim().split("\n");
    expect(lines[0]).toContain("Date,Journal No.,Memo,Account,Debit,Credit,Name");
    // Debits equal credits across the whole export.
    let debit = 0;
    let credit = 0;
    for (const row of lines.slice(1)) {
      const cols = row.split(",");
      debit += Number(cols[4] || 0);
      credit += Number(cols[5] || 0);
    }
    expect(debit).toBeCloseTo(credit, 2);
    expect(debit).toBeGreaterThan(0);
  });

  it("reconciles bank transactions against ledger cash movements", async () => {
    await runMonthlyInvoices(ctx, monthPeriod(2026, 6));
    const invoice = await prisma.invoice.findFirst({ where: { orgId: ORG, ownerPartyId: "own" } });
    const intent = await createPaymentIntent(ctx, { invoiceId: invoice!.id, provider: rail });
    const evt = rail.buildEvent(
      { type: "payment_intent.succeeded", providerIntentId: intent.providerIntentId, amountCents: "300000" },
      SECRET,
    );
    await handleRailWebhook(prisma, { ...evt, secret: SECRET, provider: rail }); // Dr Cash 300000

    const bank = await prisma.bankAccount.create({
      data: { orgId: ORG, legalEntityId: LE, name: "Operating" },
    });
    const bankCsv = "Date,Amount,Description\n2026-07-01,3000.00,Owner ACH\n2026-07-01,99.99,Bank fee";
    const imp = await importBankTransactions(ctx, bank.id, bankCsv, {
      date: "Date",
      amount: "Amount",
      description: "Description",
    });
    expect(imp.imported).toBe(2);

    const proposal = await proposeReconciliation(ctx, bank.id, { windowDays: 40 });
    expect(proposal.matches).toHaveLength(1); // the $3000 ACH matches the cash debit
    expect(proposal.unmatchedBank).toHaveLength(1); // the $99.99 fee has no ledger match

    const committed = await commitMatches(
      ctx,
      proposal.matches.map((m) => ({ bankTransactionId: m.bankTransactionId, entryId: m.entryId })),
    );
    expect(committed).toBe(1);
    const again = await proposeReconciliation(ctx, bank.id, { windowDays: 40 });
    expect(again.matches).toHaveLength(0); // already matched
  });
});
