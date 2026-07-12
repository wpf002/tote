import { format, type AccountKind, type Cents } from "@tote/core";
import { ledgerFor, loadOwnershipGraph, type ServiceContext } from "@tote/services";
import { resolveEffectiveOwnership } from "@tote/core";

/**
 * Read-only ledger tools the model can call to answer questions. Every figure a
 * grounded answer cites comes from one of these — the model never invents a
 * number. Nothing here mutates the ledger; the AI can read the books, not write
 * them.
 */
export interface ToolDef {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties: false;
  };
}

const fmt = (c: Cents | bigint) => format(c as Cents);

async function resolveParty(ctx: ServiceContext, name: string) {
  const parties = await ctx.prisma.party.findMany({ where: { orgId: ctx.orgId } });
  const q = name.trim().toLowerCase();
  return (
    parties.find((p) => p.name.toLowerCase() === q) ??
    parties.find((p) => p.name.toLowerCase().includes(q)) ??
    null
  );
}

async function resolveHorse(ctx: ServiceContext, name: string) {
  const horses = await ctx.prisma.horse.findMany({ where: { orgId: ctx.orgId } });
  const q = name.trim().toLowerCase();
  return (
    horses.find((h) => h.name.toLowerCase() === q) ??
    horses.find((h) => h.name.toLowerCase().includes(q)) ??
    null
  );
}

export const TOOL_DEFS: ToolDef[] = [
  {
    name: "get_barn_balances",
    description:
      "Top-level derived balances for the active legal entity: cash, receivable, payable, purse payable, income, expense. Use for 'how much cash', 'what do we owe', overall financial position.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "list_owners",
    description:
      "List all owners and syndicates with their receivable, purse payable, and net position. Use to answer questions about who owes what or who is owed.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "owner_summary",
    description: "Financial summary for one owner/syndicate by name: receivable, purse payable, net position.",
    input_schema: {
      type: "object",
      properties: { name: { type: "string", description: "Owner or syndicate name (fuzzy match)" } },
      required: ["name"],
      additionalProperties: false,
    },
  },
  {
    name: "list_horses",
    description: "List all horses with their current effective owners and shares.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "horse_summary",
    description:
      "Financials for one horse by name: total expense and income tagged to that horse, plus effective owners. Use for 'how much have we spent on <horse>' or 'is <horse> profitable'.",
    input_schema: {
      type: "object",
      properties: { name: { type: "string", description: "Horse name (fuzzy match)" } },
      required: ["name"],
      additionalProperties: false,
    },
  },
  {
    name: "recent_activity",
    description: "Most recent journal entries (date, memo, total amount). Use for 'what happened recently' / 'last transactions'.",
    input_schema: {
      type: "object",
      properties: { limit: { type: "integer", description: "How many entries (default 10, max 30)" } },
      additionalProperties: false,
    },
  },
];

type ToolInput = Record<string, unknown>;

/** Execute a tool call and return a compact JSON string result. */
export async function runTool(ctx: ServiceContext, name: string, input: ToolInput): Promise<string> {
  const ledger = ledgerFor(ctx);
  const { prisma, orgId } = ctx;

  switch (name) {
    case "get_barn_balances": {
      const [cash, ar, ap, purse, income, expense] = await Promise.all([
        ledger.balanceOf("CASH"),
        ledger.balanceOf("ACCOUNTS_RECEIVABLE"),
        ledger.balanceOf("ACCOUNTS_PAYABLE"),
        ledger.balanceOf("OWNER_PURSE_PAYABLE"),
        ledger.balanceOf("OPERATING_INCOME"),
        ledger.balanceOf("OPERATING_EXPENSE"),
      ]);
      return JSON.stringify({
        cash: fmt(cash),
        receivable: fmt(ar),
        payable: fmt(ap),
        purse_payable: fmt(purse),
        income: fmt(income),
        expense: fmt(expense),
        net_income: fmt((income - expense) as Cents),
      });
    }

    case "list_owners": {
      const owners = await prisma.party.findMany({
        where: { orgId, type: { in: ["INDIVIDUAL", "SYNDICATE"] } },
        orderBy: { name: "asc" },
      });
      const rows = await Promise.all(
        owners.map(async (o) => ({
          name: o.name,
          type: o.type,
          receivable: fmt(await ledger.balanceOf("ACCOUNTS_RECEIVABLE", { partyId: o.id })),
          purse_payable: fmt(await ledger.balanceOf("OWNER_PURSE_PAYABLE", { partyId: o.id })),
          net_position: fmt(await ledger.netPosition(o.id)),
        })),
      );
      return JSON.stringify(rows);
    }

    case "owner_summary": {
      const party = await resolveParty(ctx, String(input.name ?? ""));
      if (!party) return JSON.stringify({ error: `No owner matching "${input.name}"` });
      return JSON.stringify({
        name: party.name,
        receivable: fmt(await ledger.balanceOf("ACCOUNTS_RECEIVABLE", { partyId: party.id })),
        purse_payable: fmt(await ledger.balanceOf("OWNER_PURSE_PAYABLE", { partyId: party.id })),
        net_position: fmt(await ledger.netPosition(party.id)),
      });
    }

    case "list_horses": {
      const [horses, graph, parties] = await Promise.all([
        prisma.horse.findMany({ where: { orgId }, orderBy: { name: "asc" } }),
        loadOwnershipGraph(prisma, orgId),
        prisma.party.findMany({ where: { orgId }, select: { id: true, name: true } }),
      ]);
      const nameOf = new Map(parties.map((p) => [p.id, p.name]));
      const now = new Date();
      const rows = horses.map((h) => {
        let owners: string[] = [];
        try {
          owners = resolveEffectiveOwnership(graph, h.id, now).map(
            (s) => `${nameOf.get(s.partyId) ?? s.partyId} ${(s.basisPoints / 100).toFixed(1)}%`,
          );
        } catch {
          owners = [];
        }
        return { name: h.name, owners };
      });
      return JSON.stringify(rows);
    }

    case "horse_summary": {
      const horse = await resolveHorse(ctx, String(input.name ?? ""));
      if (!horse) return JSON.stringify({ error: `No horse matching "${input.name}"` });
      const [expense, income, graph, parties] = await Promise.all([
        ledger.balanceOf("OPERATING_EXPENSE", { horseId: horse.id }),
        ledger.balanceOf("OPERATING_INCOME", { horseId: horse.id }),
        loadOwnershipGraph(prisma, orgId),
        prisma.party.findMany({ where: { orgId }, select: { id: true, name: true } }),
      ]);
      const nameOf = new Map(parties.map((p) => [p.id, p.name]));
      let owners: string[] = [];
      try {
        owners = resolveEffectiveOwnership(graph, horse.id, new Date()).map(
          (s) => `${nameOf.get(s.partyId) ?? s.partyId} ${(s.basisPoints / 100).toFixed(1)}%`,
        );
      } catch {
        owners = [];
      }
      return JSON.stringify({
        name: horse.name,
        expense: fmt(expense),
        income: fmt(income),
        net: fmt((income - expense) as Cents),
        owners,
      });
    }

    case "recent_activity": {
      const limit = Math.min(Number(input.limit ?? 10) || 10, 30);
      const entries = await prisma.journalEntry.findMany({
        where: { orgId, legalEntityId: ctx.legalEntityId },
        orderBy: { date: "desc" },
        take: limit,
        include: { lines: true },
      });
      return JSON.stringify(
        entries.map((e) => ({
          date: e.date.toISOString().slice(0, 10),
          memo: e.memo,
          amount: fmt(e.lines.reduce((a, l) => a + l.debit, 0n) as Cents),
        })),
      );
    }

    default:
      return JSON.stringify({ error: `Unknown tool ${name}` });
  }
}
