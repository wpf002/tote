import Anthropic from "@anthropic-ai/sdk";
import { format, type Cents } from "@tote/core";
import { ledgerFor, type ServiceContext } from "@tote/services";
import { isConfigured } from "./ask.js";

const MODEL = "claude-opus-4-8";
const fmt = (c: Cents | bigint) => format(c as Cents);

export interface Insight {
  title: string;
  detail: string;
  severity: "info" | "watch" | "risk";
}

/** Gather the ledger-derived facts the insight model reasons over. */
async function snapshot(ctx: ServiceContext) {
  const ledger = ledgerFor(ctx);
  const { prisma, orgId } = ctx;

  const [cash, ar, ap, purse, income, expense, horses, owners] = await Promise.all([
    ledger.balanceOf("CASH"),
    ledger.balanceOf("ACCOUNTS_RECEIVABLE"),
    ledger.balanceOf("ACCOUNTS_PAYABLE"),
    ledger.balanceOf("OWNER_PURSE_PAYABLE"),
    ledger.balanceOf("OPERATING_INCOME"),
    ledger.balanceOf("OPERATING_EXPENSE"),
    prisma.horse.findMany({ where: { orgId }, orderBy: { name: "asc" } }),
    prisma.party.findMany({ where: { orgId, type: { in: ["INDIVIDUAL", "SYNDICATE"] } } }),
  ]);

  const horseRows = await Promise.all(
    horses.map(async (h) => ({
      horse: h.name,
      expense: fmt(await ledger.balanceOf("OPERATING_EXPENSE", { horseId: h.id })),
      income: fmt(await ledger.balanceOf("OPERATING_INCOME", { horseId: h.id })),
    })),
  );
  const ownerRows = await Promise.all(
    owners.map(async (o) => ({
      owner: o.name,
      receivable: fmt(await ledger.balanceOf("ACCOUNTS_RECEIVABLE", { partyId: o.id })),
      net_position: fmt(await ledger.netPosition(o.id)),
    })),
  );

  return {
    barn: {
      cash: fmt(cash),
      receivable: fmt(ar),
      payable: fmt(ap),
      purse_payable: fmt(purse),
      income: fmt(income),
      expense: fmt(expense),
      net_income: fmt((income - expense) as Cents),
    },
    horses: horseRows,
    owners: ownerRows,
  };
}

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    insights: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          detail: { type: "string" },
          severity: { type: "string", enum: ["info", "watch", "risk"] },
        },
        required: ["title", "detail", "severity"],
        additionalProperties: false,
      },
    },
  },
  required: ["insights"],
  additionalProperties: false,
} as const;

/**
 * Proactively surface risks and opportunities from the books — horses burning
 * cash with no earnings, overdue receivables, thin margins. Grounded in the
 * snapshot; the model reasons, it does not fetch its own numbers.
 */
export async function generateInsights(ctx: ServiceContext): Promise<Insight[]> {
  if (!isConfigured()) {
    throw new Error("ANTHROPIC_API_KEY is not set; insights are unavailable.");
  }
  const data = await snapshot(ctx);
  const client = new Anthropic();

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    output_config: { format: { type: "json_schema", schema: OUTPUT_SCHEMA } } as never,
    system:
      "You are a sharp racing-barn CFO. Given a ledger snapshot, surface at most 5 concrete, specific insights a trainer should act on — horses with high cost and no income, owners who owe a lot, thin or negative margins, cash risk. Reference actual horse/owner names and the figures from the data. Do not invent numbers; only use what is given. Severity: 'risk' for money-losing or cash problems, 'watch' for things to monitor, 'info' otherwise.",
    messages: [{ role: "user", content: `Ledger snapshot:\n${JSON.stringify(data, null, 2)}` }],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  try {
    const parsed = JSON.parse(text) as { insights: Insight[] };
    return parsed.insights.slice(0, 5);
  } catch {
    return [];
  }
}
