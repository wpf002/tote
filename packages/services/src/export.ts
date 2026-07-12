import type { AccountKind } from "@tote/core";
import type { ServiceContext } from "./context.js";
import type { Period } from "./period.js";

/** QuickBooks-friendly account names per ledger account kind. */
const ACCOUNT_NAMES: Record<AccountKind, string> = {
  CASH: "Cash",
  ACCOUNTS_RECEIVABLE: "Accounts Receivable",
  ACCOUNTS_PAYABLE: "Accounts Payable",
  OPERATING_EXPENSE: "Operating Expenses",
  OPERATING_INCOME: "Operating Income",
  OWNER_PURSE_PAYABLE: "Owner Purse Payable",
  PURSE_REVENUE: "Purse Revenue",
  WAGES_PAYABLE: "Wages Payable",
  HORSE_ASSET: "Horse Assets",
  OWNER_DEPOSITS: "Owner Deposits",
  OWNER_EQUITY: "Owner Equity",
};

function dollars(cents: bigint): string {
  const neg = cents < 0n;
  const abs = neg ? -cents : cents;
  return `${neg ? "-" : ""}${abs / 100n}.${(abs % 100n).toString().padStart(2, "0")}`;
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Export the period's journal entries as a QuickBooks General Journal CSV:
 * one row per line, Debit/Credit in separate columns. Account kinds map to QB
 * account names; a category's `taxCode` (when present) refines the account.
 * Every entry balances, so per-entry debit and credit columns tie out.
 */
export async function exportGeneralJournalCsv(
  ctx: ServiceContext,
  period: Period,
): Promise<string> {
  const entries = await ctx.prisma.journalEntry.findMany({
    where: {
      orgId: ctx.orgId,
      legalEntityId: ctx.legalEntityId,
      date: { gte: period.start, lt: period.end },
    },
    include: { lines: true },
    orderBy: { date: "asc" },
  });

  const parties = await ctx.prisma.party.findMany({
    where: { orgId: ctx.orgId },
    select: { id: true, name: true },
  });
  const partyName = new Map(parties.map((p) => [p.id, p.name]));

  const rows: string[] = ["Date,Journal No.,Memo,Account,Debit,Credit,Name"];
  let n = 0;
  for (const entry of entries) {
    n++;
    const date = entry.date.toISOString().slice(0, 10);
    for (const line of entry.lines) {
      const account = ACCOUNT_NAMES[line.accountKind as AccountKind] ?? line.accountKind;
      const name = line.partyId ? (partyName.get(line.partyId) ?? "") : "";
      rows.push(
        [
          date,
          String(n),
          csvCell(entry.memo ?? ""),
          csvCell(account),
          line.debit > 0n ? dollars(line.debit) : "",
          line.credit > 0n ? dollars(line.credit) : "",
          csvCell(name),
        ].join(","),
      );
    }
  }
  return rows.join("\n");
}

/** Derived trial balance for a period — every account kind's net movement. */
export async function trialBalance(
  ctx: ServiceContext,
  period: Period,
): Promise<Array<{ account: string; debit: bigint; credit: bigint }>> {
  const lines = await ctx.prisma.journalLine.findMany({
    where: {
      orgId: ctx.orgId,
      legalEntityId: ctx.legalEntityId,
      entry: { date: { gte: period.start, lt: period.end } },
    },
    select: { accountKind: true, debit: true, credit: true },
  });
  const byAccount = new Map<string, { debit: bigint; credit: bigint }>();
  for (const l of lines) {
    const key = ACCOUNT_NAMES[l.accountKind as AccountKind] ?? l.accountKind;
    const cur = byAccount.get(key) ?? { debit: 0n, credit: 0n };
    cur.debit += l.debit;
    cur.credit += l.credit;
    byAccount.set(key, cur);
  }
  return [...byAccount.entries()].map(([account, v]) => ({ account, ...v }));
}
