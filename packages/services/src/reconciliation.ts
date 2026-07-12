import { toCents } from "@tote/core";
import { parseCsv } from "./import.js";
import type { ServiceContext } from "./context.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface BankCsvMapping {
  date: string;
  amount: string;
  description: string;
}

/** Import bank transactions from a mapped CSV into a bank account. */
export async function importBankTransactions(
  ctx: ServiceContext,
  bankAccountId: string,
  csvText: string,
  mapping: BankCsvMapping,
): Promise<{ imported: number; errors: Array<{ row: number; message: string }> }> {
  const { rows } = parseCsv(csvText);
  const errors: Array<{ row: number; message: string }> = [];
  let imported = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    try {
      const amount = toCents((row[mapping.amount] ?? "").replace(/[$,]/g, ""));
      const postedAt = new Date(row[mapping.date] ?? "");
      if (Number.isNaN(postedAt.getTime())) throw new Error("Bad date");
      await ctx.prisma.bankTransaction.create({
        data: {
          bankAccountId,
          postedAt,
          amountCents: amount,
          description: row[mapping.description] ?? "",
        },
      });
      imported++;
    } catch (err) {
      errors.push({ row: i + 2, message: err instanceof Error ? err.message : String(err) });
    }
  }
  return { imported, errors };
}

export interface ReconMatch {
  bankTransactionId: string;
  entryId: string;
  amountCents: bigint;
  description: string;
  postedAt: Date;
}

/**
 * Auto-match unmatched bank transactions to ledger CASH movements by signed
 * amount within a date window. A bank credit (+) matches a cash debit; a bank
 * debit (−) matches a cash credit. Returns proposed matches and the leftovers
 * on each side — nothing is committed until {@link commitMatch}.
 */
export async function proposeReconciliation(
  ctx: ServiceContext,
  bankAccountId: string,
  opts: { windowDays?: number } = {},
): Promise<{
  matches: ReconMatch[];
  unmatchedBank: Array<{ id: string; amountCents: bigint; description: string; postedAt: Date }>;
  unmatchedLedger: number;
}> {
  const windowMs = (opts.windowDays ?? 5) * MS_PER_DAY;

  const bankTxns = await ctx.prisma.bankTransaction.findMany({
    where: { bankAccountId, matchedEntryId: null },
    orderBy: { postedAt: "asc" },
  });

  const cashLines = await ctx.prisma.journalLine.findMany({
    where: { orgId: ctx.orgId, legalEntityId: ctx.legalEntityId, accountKind: "CASH" },
    include: { entry: true },
  });
  // Net cash movement per entry (debit positive, credit negative).
  const entryNet = new Map<string, { net: bigint; date: Date }>();
  for (const l of cashLines) {
    const cur = entryNet.get(l.entryId) ?? { net: 0n, date: l.entry.date };
    cur.net += l.debit - l.credit;
    entryNet.set(l.entryId, cur);
  }

  const alreadyMatched = new Set(
    (
      await ctx.prisma.bankTransaction.findMany({
        where: { bankAccountId, matchedEntryId: { not: null } },
        select: { matchedEntryId: true },
      })
    ).map((t) => t.matchedEntryId),
  );

  const matches: ReconMatch[] = [];
  const usedEntries = new Set<string>(alreadyMatched as Set<string>);
  const unmatchedBank: Array<{ id: string; amountCents: bigint; description: string; postedAt: Date }> = [];

  for (const txn of bankTxns) {
    let matchedEntryId: string | null = null;
    for (const [entryId, info] of entryNet) {
      if (usedEntries.has(entryId)) continue;
      if (info.net !== txn.amountCents) continue;
      if (Math.abs(info.date.getTime() - txn.postedAt.getTime()) > windowMs) continue;
      matchedEntryId = entryId;
      break;
    }
    if (matchedEntryId) {
      usedEntries.add(matchedEntryId);
      matches.push({
        bankTransactionId: txn.id,
        entryId: matchedEntryId,
        amountCents: txn.amountCents,
        description: txn.description,
        postedAt: txn.postedAt,
      });
    } else {
      unmatchedBank.push({
        id: txn.id,
        amountCents: txn.amountCents,
        description: txn.description,
        postedAt: txn.postedAt,
      });
    }
  }

  return { matches, unmatchedBank, unmatchedLedger: entryNet.size - usedEntries.size };
}

/** Commit a set of proposed matches, tagging each bank transaction. */
export async function commitMatches(
  ctx: ServiceContext,
  matches: Array<{ bankTransactionId: string; entryId: string }>,
): Promise<number> {
  let n = 0;
  for (const m of matches) {
    await ctx.prisma.bankTransaction.update({
      where: { id: m.bankTransactionId },
      data: { matchedEntryId: m.entryId },
    });
    n++;
  }
  return n;
}
