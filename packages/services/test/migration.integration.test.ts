import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { resolveEffectiveOwnership } from "@tote/core";
import {
  importOwnershipRoster,
  importTrainingRates,
  saveImportTemplate,
  listImportTemplates,
  type ServiceContext,
} from "../src/index.js";

const HAS_DB = Boolean(process.env.DATABASE_URL);
const ORG = "org_mig";
const LE = "le_mig";

let prisma: PrismaClient;
let ctx: ServiceContext;

async function reset() {
  await prisma.importTemplate.deleteMany({ where: { orgId: ORG } });
  await prisma.trainingRate.deleteMany({ where: { orgId: ORG } });
  await prisma.ownership.deleteMany({ where: { orgId: ORG } });
  await prisma.horse.deleteMany({ where: { orgId: ORG } });
  await prisma.party.deleteMany({ where: { orgId: ORG } });
}

async function seed() {
  await reset();
  await prisma.org.upsert({ where: { id: ORG }, create: { id: ORG, name: "Mig" }, update: {} });
  await prisma.legalEntity.upsert({
    where: { id: LE },
    create: { id: LE, orgId: ORG, name: "Mig LE" },
    update: {},
  });
}

function graphFromDb(ownership: { horseId: string; partyId: string; basisPoints: number; from: Date }[]) {
  return {
    ownership: ownership.map((o) => ({ ...o, to: null })),
    memberships: [],
    isSyndicate: () => false,
  };
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

describe.skipIf(!HAS_DB)("full-catalog migration (the account-winning wedge)", () => {
  it("imports an ownership roster, creating horses/owners and normalizing shares to 100%", async () => {
    // Messy real-world data: a syndicate name, thirds that sum to 99.99%, and a
    // horse whose shares are genuinely off (should warn).
    const csv = [
      "Horse,Owner,Percent",
      "Thunderbolt,Bob Carter,60",
      "Thunderbolt,Carol Diaz,40",
      "Silk Road,Blue Silks Syndicate,33.33",
      "Silk Road,Dan Ellis,33.33",
      "Silk Road,Erin Ford,33.33",
      "Lopsided,Owner X,50",
      "Lopsided,Owner Y,30",
    ].join("\n");

    const result = await importOwnershipRoster(ctx, csv, {
      horse: "Horse",
      owner: "Owner",
      share: "Percent",
    });

    expect(result.horsesCreated).toBe(3);
    expect(result.ownersCreated).toBe(7);
    expect(result.stakesCreated).toBe(7);
    // 33.33 x3 = 99.99% is within tolerance (no warning); 50+30 = 80% warns.
    expect(result.warnings.some((w) => w.includes("Lopsided"))).toBe(true);
    expect(result.warnings.some((w) => w.includes("Silk Road"))).toBe(false);

    // Silk Road shares sum to exactly 10000 bp despite the imperfect input.
    const silk = await prisma.horse.findFirst({ where: { orgId: ORG, name: "Silk Road" } });
    const owners = await prisma.ownership.findMany({ where: { orgId: ORG, horseId: silk!.id } });
    expect(owners.reduce((a, o) => a + o.basisPoints, 0)).toBe(10000);

    // The resolver accepts it and the effective ownership is valid.
    const shares = resolveEffectiveOwnership(
      graphFromDb(owners.map((o) => ({ ...o, from: o.from }))),
      silk!.id,
      new Date("2026-01-01"),
    );
    expect(shares.reduce((a, s) => a + s.basisPoints, 0)).toBe(10000);

    // The syndicate name was classified as a SYNDICATE party.
    const synd = await prisma.party.findFirst({ where: { orgId: ORG, name: "Blue Silks Syndicate" } });
    expect(synd?.type).toBe("SYNDICATE");
  });

  it("normalizes any share format (percent, fraction, bps) identically", async () => {
    const csv = "Horse,Owner,Percent\nH,A,0.6\nH,B,0.4"; // fractions
    await importOwnershipRoster(ctx, csv, { horse: "Horse", owner: "Owner", share: "Percent" });
    const h = await prisma.horse.findFirst({ where: { orgId: ORG, name: "H" } });
    const owners = await prisma.ownership.findMany({ where: { orgId: ORG, horseId: h!.id }, orderBy: { basisPoints: "desc" } });
    expect(owners.map((o) => o.basisPoints)).toEqual([6000, 4000]);
  });

  it("does not clobber a horse that already has ownership", async () => {
    const csv = "Horse,Owner,Percent\nSolo,Owner One,100";
    await importOwnershipRoster(ctx, csv, { horse: "Horse", owner: "Owner", share: "Percent" });
    const second = await importOwnershipRoster(ctx, csv, { horse: "Horse", owner: "Owner", share: "Percent" });
    expect(second.horsesImported).toBe(0);
    expect(second.warnings.some((w) => w.includes("already has ownership"))).toBe(true);
    const solo = await prisma.horse.findFirst({ where: { orgId: ORG, name: "Solo" } });
    expect(await prisma.ownership.count({ where: { horseId: solo!.id } })).toBe(1);
  });

  it("imports training rates from dollars/day", async () => {
    const csv = "Horse,Daily Rate\nThunderbolt,\"$75.00\"\nSilk Road,85";
    const result = await importTrainingRates(ctx, csv, { horse: "Horse", dailyRate: "Daily Rate" });
    expect(result.imported).toBe(2);
    const thunder = await prisma.horse.findFirst({ where: { orgId: ORG, name: "Thunderbolt" } });
    const rate = await prisma.trainingRate.findFirst({ where: { horseId: thunder!.id } });
    expect(rate?.dailyRateCents).toBe(7500n);
  });

  it("saves and lists per-barn import templates", async () => {
    await saveImportTemplate(ctx, "Meadowbrook roster", "ownership", {
      horse: "Horse Name",
      owner: "Owner Name",
      share: "Share %",
    });
    const templates = await listImportTemplates(ctx);
    expect(templates).toHaveLength(1);
    expect(templates[0]).toMatchObject({ name: "Meadowbrook roster", kind: "ownership" });
    expect(templates[0]!.mapping.horse).toBe("Horse Name");
  });
});
