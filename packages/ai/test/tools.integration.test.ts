import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { Ledger, cents } from "@tote/core";
import { PrismaLedgerStore } from "@tote/db";
import { runTool, TOOL_DEFS } from "../src/index.js";
import type { ServiceContext } from "@tote/services";

const HAS_DB = Boolean(process.env.DATABASE_URL);
const ORG = "org_ai";
const LE = "le_ai";
const FROM = new Date("2025-01-01T00:00:00Z");

let prisma: PrismaClient;
let ctx: ServiceContext;

async function reset() {
  await prisma.journalEntry.deleteMany({ where: { orgId: ORG } });
  await prisma.ownership.deleteMany({ where: { orgId: ORG } });
  await prisma.horse.deleteMany({ where: { orgId: ORG } });
  await prisma.party.deleteMany({ where: { orgId: ORG } });
}

async function seed() {
  await reset();
  await prisma.org.upsert({ where: { id: ORG }, create: { id: ORG, name: "AI" }, update: {} });
  await prisma.legalEntity.upsert({
    where: { id: LE },
    create: { id: LE, orgId: ORG, name: "AI LE" },
    update: {},
  });
  await prisma.party.createMany({
    data: [
      { id: "ai_bob", orgId: ORG, type: "INDIVIDUAL", name: "Bob Carter" },
      { id: "ai_vend", orgId: ORG, type: "VENDOR", name: "VetCo" },
    ],
  });
  await prisma.horse.create({ data: { id: "ai_h", orgId: ORG, name: "Thunderbolt" } });
  await prisma.ownership.create({
    data: { orgId: ORG, horseId: "ai_h", partyId: "ai_bob", basisPoints: 10000, from: FROM },
  });

  const ledger = new Ledger(new PrismaLedgerStore(prisma), { orgId: ORG, legalEntityId: LE });
  await ledger.postEntry({ date: new Date("2026-06-10T00:00:00Z"), memo: "Vet bill" }, [
    { accountKind: "OPERATING_EXPENSE", debit: cents(45000n), horseId: "ai_h" },
    { accountKind: "ACCOUNTS_PAYABLE", credit: cents(45000n), partyId: "ai_vend" },
  ]);
  await ledger.postEntry({ date: new Date("2026-06-30T00:00:00Z"), memo: "Training" }, [
    { accountKind: "ACCOUNTS_RECEIVABLE", debit: cents(225000n), partyId: "ai_bob" },
    { accountKind: "OPERATING_INCOME", credit: cents(225000n), horseId: "ai_h" },
  ]);
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

describe("AI tool definitions", () => {
  it("declares valid, closed JSON schemas", () => {
    for (const t of TOOL_DEFS) {
      expect(t.name).toMatch(/^[a-z_]+$/);
      expect(t.input_schema.additionalProperties).toBe(false);
    }
  });
});

describe.skipIf(!HAS_DB)("grounded ledger tools (what the AI can cite)", () => {
  it("get_barn_balances returns real derived balances", async () => {
    const out = JSON.parse(await runTool(ctx, "get_barn_balances", {}));
    expect(out.receivable).toBe("$2,250.00");
    expect(out.payable).toBe("$450.00");
    expect(out.income).toBe("$2,250.00");
    expect(out.expense).toBe("$450.00");
    expect(out.net_income).toBe("$1,800.00");
  });

  it("owner_summary fuzzy-matches a name and returns their position", async () => {
    const out = JSON.parse(await runTool(ctx, "owner_summary", { name: "bob" }));
    expect(out.name).toBe("Bob Carter");
    expect(out.receivable).toBe("$2,250.00");
    expect(out.net_position).toBe("-$2,250.00"); // owes the barn
  });

  it("horse_summary returns expense/income and effective owners", async () => {
    const out = JSON.parse(await runTool(ctx, "horse_summary", { name: "Thunder" }));
    expect(out.name).toBe("Thunderbolt");
    expect(out.expense).toBe("$450.00");
    expect(out.income).toBe("$2,250.00");
    expect(out.owners).toContain("Bob Carter 100.0%");
  });

  it("unknown name returns a clean error, never a fabricated figure", async () => {
    const out = JSON.parse(await runTool(ctx, "owner_summary", { name: "Nobody" }));
    expect(out.error).toContain("No owner");
  });

  it("recent_activity lists posted entries", async () => {
    const out = JSON.parse(await runTool(ctx, "recent_activity", { limit: 5 }));
    expect(out.length).toBe(2);
    expect(out[0].memo).toBeDefined();
  });
});
