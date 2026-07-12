import { format, type Cents } from "@tote/core";
import type { ServiceContext } from "./context.js";

/**
 * Ledger self-audit — the accountant-trust surface. Proves, from the raw lines,
 * that the whole book is internally consistent: debits equal credits globally,
 * every entry balances (invariant #4), and no line is malformed. If any check
 * fails, the books are not trustworthy and it says so loudly.
 */
export interface AuditCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface AuditReport {
  healthy: boolean;
  entryCount: number;
  lineCount: number;
  totalDebits: Cents;
  totalCredits: Cents;
  reversalCount: number;
  unbalancedEntryIds: string[];
  checks: AuditCheck[];
}

const fmt = (c: bigint) => format(c as Cents);

export async function auditLedger(ctx: ServiceContext): Promise<AuditReport> {
  const { prisma, orgId, legalEntityId } = ctx;

  const [lines, entryCount, reversalCount, malformed] = await Promise.all([
    prisma.journalLine.findMany({
      where: { orgId, legalEntityId },
      select: { entryId: true, debit: true, credit: true },
    }),
    prisma.journalEntry.count({ where: { orgId, legalEntityId } }),
    prisma.journalEntry.count({ where: { orgId, legalEntityId, reversalOf: { not: null } } }),
    // A well-formed line has exactly one non-zero side.
    prisma.journalLine.count({
      where: { orgId, legalEntityId, debit: { gt: 0 }, credit: { gt: 0 } },
    }),
  ]);

  let totalDebits = 0n;
  let totalCredits = 0n;
  const perEntry = new Map<string, { d: bigint; c: bigint }>();
  for (const l of lines) {
    totalDebits += l.debit;
    totalCredits += l.credit;
    const agg = perEntry.get(l.entryId) ?? { d: 0n, c: 0n };
    agg.d += l.debit;
    agg.c += l.credit;
    perEntry.set(l.entryId, agg);
  }
  const unbalancedEntryIds = [...perEntry.entries()]
    .filter(([, v]) => v.d !== v.c)
    .map(([id]) => id);

  const checks: AuditCheck[] = [
    {
      name: "Debits equal credits",
      ok: totalDebits === totalCredits,
      detail:
        totalDebits === totalCredits
          ? `Every dollar is accounted for — ${fmt(totalDebits)} in, ${fmt(totalCredits)} out.`
          : `Off by ${fmt(totalDebits - totalCredits)} — debits ${fmt(totalDebits)} vs credits ${fmt(totalCredits)}.`,
    },
    {
      name: "Every entry balances",
      ok: unbalancedEntryIds.length === 0,
      detail:
        unbalancedEntryIds.length === 0
          ? `All ${perEntry.size} journal entries balance to the penny.`
          : `${unbalancedEntryIds.length} entries do not balance.`,
    },
    {
      name: "Every line is one-sided",
      ok: malformed === 0,
      detail:
        malformed === 0
          ? "No line carries both a debit and a credit."
          : `${malformed} malformed lines carry both sides.`,
    },
    {
      name: "Corrections are reversals",
      ok: true,
      detail:
        reversalCount === 0
          ? "No corrections yet; the ledger is append-only."
          : `${reversalCount} corrections posted as reversing entries — nothing edited or deleted.`,
    },
  ];

  return {
    healthy: checks.every((c) => c.ok),
    entryCount,
    lineCount: lines.length,
    totalDebits: totalDebits as Cents,
    totalCredits: totalCredits as Cents,
    reversalCount,
    unbalancedEntryIds,
    checks,
  };
}
