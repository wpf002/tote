import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { Ledger, cents } from "@tote/core";
import { PrismaLedgerStore } from "@tote/db";
import {
  createStakesSchedule,
  upcomingStakesDeadlines,
  payStakesInstallment,
  recordRaceResult,
  type ServiceContext,
} from "../src/index.js";

const HAS_DB = Boolean(process.env.DATABASE_URL);
const ORG = "org_race";
const LE = "le_race";
const FROM = new Date("2025-01-01T00:00:00Z");

let prisma: PrismaClient;
let ctx: ServiceContext;

async function reset() {
  await prisma.reminder.deleteMany({ where: { orgId: ORG } });
  await prisma.stakesSchedule.deleteMany({ where: { orgId: ORG } });
  await prisma.purse.deleteMany({ where: { orgId: ORG } });
  await prisma.journalEntry.deleteMany({ where: { orgId: ORG } });
  await prisma.ownership.deleteMany({ where: { orgId: ORG } });
  await prisma.syndicateMembership.deleteMany({ where: { orgId: ORG } });
  await prisma.horse.deleteMany({ where: { orgId: ORG } });
  await prisma.party.deleteMany({ where: { orgId: ORG } });
}

async function seed() {
  await reset();
  await prisma.org.upsert({ where: { id: ORG }, create: { id: ORG, name: "Race" }, update: {} });
  await prisma.legalEntity.upsert({
    where: { id: LE },
    create: { id: LE, orgId: ORG, name: "Race LE" },
    update: {},
  });
  await prisma.party.createMany({
    data: [
      { id: "ro1", orgId: ORG, type: "INDIVIDUAL", name: "RO1" },
      { id: "ro2", orgId: ORG, type: "INDIVIDUAL", name: "RO2" },
      { id: "jock", orgId: ORG, type: "JOCKEY", name: "Jockey" },
    ],
  });
  await prisma.horse.create({ data: { id: "rhorse", orgId: ORG, name: "Stakes Horse" } });
  await prisma.ownership.createMany({
    data: [
      { orgId: ORG, horseId: "rhorse", partyId: "ro1", basisPoints: 6000, from: FROM },
      { orgId: ORG, horseId: "rhorse", partyId: "ro2", basisPoints: 4000, from: FROM },
    ],
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

describe.skipIf(!HAS_DB)("racing depth (Phase 4 DoD)", () => {
  it("tracks a stakes ladder with firing-deadline reminders and posts on payment", async () => {
    const { reminders } = await createStakesSchedule(ctx, {
      horseId: "rhorse",
      raceName: "Spring Derby",
      payments: [
        { label: "Nomination", dueDate: new Date("2026-02-15T00:00:00Z"), amountCents: cents(60000n) },
        { label: "Keep-in", dueDate: new Date("2026-04-01T00:00:00Z"), amountCents: cents(150000n) },
      ],
    });
    expect(reminders).toBe(2);

    // Only the nomination deadline is due by March 1.
    const due = await upcomingStakesDeadlines(ctx, new Date("2026-03-01T00:00:00Z"));
    expect(due).toHaveLength(1);
    expect(due[0]!.message).toContain("Nomination");

    // Pay the nomination -> expense posts and the reminder resolves.
    const nomination = await prisma.stakesPayment.findFirst({ where: { label: "Nomination" } });
    await payStakesInstallment(ctx, nomination!.id);
    expect(await ledger().balanceOf("OPERATING_EXPENSE", { horseId: "rhorse" })).toBe(60000n);
    const dueAfter = await upcomingStakesDeadlines(ctx, new Date("2026-05-01T00:00:00Z"));
    expect(dueAfter.map((d) => d.message).some((m) => m.includes("Nomination"))).toBe(false);
  });

  it("flows jockey fees into the purse distribution, penny-exact and balanced", async () => {
    // Gross $50,000; jockey $500 mount + 10% win = $500 + $5,000 = $5,500;
    // trainer cut $2,000; owner-net = $42,500 split 60/40.
    const result = await recordRaceResult(ctx, {
      horseId: "rhorse",
      gross: cents(5_000_000n),
      resultDate: new Date("2026-06-20T00:00:00Z"),
      trainerCut: cents(200_000n),
      jockey: { jockeyPartyId: "jock", mountFeeCents: cents(50_000n), winPctBp: 1000 },
    });

    expect(result.jockeyFee).toBe(550_000n);
    expect(result.ownerNet).toBe(4_250_000n);
    const allocSum = result.allocations.reduce((a, x) => a + (x.amount as bigint), 0n);
    expect(allocSum).toBe(4_250_000n);

    const l = ledger();
    expect(await l.balanceOf("OWNER_PURSE_PAYABLE", { partyId: "ro1" })).toBe(2_550_000n); // 60%
    expect(await l.balanceOf("OWNER_PURSE_PAYABLE", { partyId: "ro2" })).toBe(1_700_000n); // 40%
    expect(await l.balanceOf("WAGES_PAYABLE", { partyId: "jock" })).toBe(550_000n);
    expect(await l.balanceOf("PURSE_REVENUE")).toBe(200_000n);
    expect(await l.balanceOf("CASH")).toBe(5_000_000n);

    // Every dollar accounted for: jockey + trainer + owners = gross.
    expect(550_000n + 200_000n + allocSum).toBe(5_000_000n);
  });
});
