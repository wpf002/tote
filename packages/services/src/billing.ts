import {
  applyBps,
  cents,
  splitByOwnership,
  vendorBillApproved,
  type Cents,
  type JournalLineInput,
} from "@tote/core";
import { ledgerFor, type ServiceContext } from "./context.js";
import { loadOwnershipGraph } from "./ownership.js";
import { overlapDays, runKeyFor, type Period } from "./period.js";

const ZERO = 0n as Cents;

/** Approve a vendor bill: record it and post `Dr Expense / Cr Payable`. */
export async function approveVendorBill(
  ctx: ServiceContext,
  input: {
    vendorPartyId: string;
    amount: Cents;
    billDate: Date;
    horseId?: string;
    categoryId?: string;
    description?: string;
  },
): Promise<{ billId: string; entryId: string }> {
  if (input.amount <= 0n) throw new Error("Bill amount must be positive");
  const ledger = ledgerFor(ctx);
  const draft = vendorBillApproved({
    vendorPartyId: input.vendorPartyId,
    amount: input.amount,
    ...(input.horseId ? { horseId: input.horseId } : {}),
    ...(input.categoryId ? { categoryId: input.categoryId } : {}),
  });
  const entry = await ledger.postEntry({ date: input.billDate, memo: draft.memo }, draft.lines);
  const bill = await ctx.prisma.vendorBill.create({
    data: {
      orgId: ctx.orgId,
      legalEntityId: ctx.legalEntityId,
      vendorPartyId: input.vendorPartyId,
      horseId: input.horseId ?? null,
      status: "APPROVED",
      billDate: input.billDate,
      journalEntryId: entry.id,
      lines: {
        create: [
          {
            categoryId: input.categoryId ?? null,
            description: input.description ?? "Services",
            amountCents: input.amount,
          },
        ],
      },
    },
  });
  return { billId: bill.id, entryId: entry.id };
}

interface DraftLine {
  ownerPartyId: string;
  horseId: string;
  kind: "TRAINING" | "PASSTHROUGH";
  categoryId: string | null;
  description: string;
  amount: Cents;
  recover: Cents;
  markup: Cents;
}

export interface MonthlyRunResult {
  runKey: string;
  invoicesCreated: number;
  ownersBilled: string[];
  totalBilled: Cents;
  skipped: boolean;
}

/**
 * The monthly invoice run — the heart of Phase 1. Generates one owner invoice
 * per party from (a) training charges (rate × days-in-period, split by
 * ownership) and (b) passthrough of horse-attached vendor bills in the period
 * (cost + category markup, split by ownership). Finalizing each invoice posts a
 * single balanced entry.
 *
 * Idempotent: the run key is the period's month. An owner already invoiced for
 * that key is skipped, and a vendor bill already passed through (its
 * `invoicedRunKey` set) is not billed again. Re-running is a no-op.
 */
export async function runMonthlyInvoices(
  ctx: ServiceContext,
  period: Period,
): Promise<MonthlyRunResult> {
  const runKey = runKeyFor(period);
  const { prisma, orgId, legalEntityId } = ctx;

  const existing = await prisma.invoice.findMany({
    where: { orgId, legalEntityId, runKey },
    select: { ownerPartyId: true },
  });
  const alreadyBilled = new Set(existing.map((i) => i.ownerPartyId));

  const graph = await loadOwnershipGraph(prisma, orgId);
  const asOf = new Date(period.end.getTime() - 1); // last instant of the period

  const draftLines: DraftLine[] = [];

  // (a) Training charges.
  const horses = await prisma.horse.findMany({
    where: { orgId },
    include: { trainingRates: true },
  });
  for (const horse of horses) {
    let horseTotal = ZERO;
    for (const rate of horse.trainingRates) {
      const days = overlapDays(period, rate.from, rate.to);
      if (days > 0) horseTotal = (horseTotal + rate.dailyRateCents * BigInt(days)) as Cents;
    }
    if (horseTotal <= 0n) continue;
    let split: Map<string, Cents>;
    try {
      split = splitByOwnership(graph, horse.id, asOf, horseTotal);
    } catch {
      continue; // no valid ownership on the date
    }
    for (const [ownerPartyId, amount] of split) {
      if (amount === 0n) continue;
      draftLines.push({
        ownerPartyId,
        horseId: horse.id,
        kind: "TRAINING",
        categoryId: null,
        description: `Training — ${horse.name}`,
        amount,
        recover: ZERO,
        markup: ZERO,
      });
    }
  }

  // (b) Passthrough of horse-attached vendor bills not yet invoiced.
  const bills = await prisma.vendorBill.findMany({
    where: {
      orgId,
      legalEntityId,
      status: "APPROVED",
      invoicedRunKey: null,
      horseId: { not: null },
      billDate: { gte: period.start, lt: period.end },
    },
    include: { lines: true },
  });
  const categories = await prisma.category.findMany({ where: { orgId } });
  const markupByCategory = new Map(categories.map((c) => [c.id, c.markupBp]));
  const passedBills: string[] = [];

  for (const bill of bills) {
    const horseId = bill.horseId!;
    for (const line of bill.lines) {
      const cost = line.amountCents as Cents;
      if (cost <= 0n) continue;
      const markupBp = (line.categoryId && markupByCategory.get(line.categoryId)) || 0;
      const markupTotal = applyBps(cost, markupBp);

      let recoverSplit: Map<string, Cents>;
      let markupSplit: Map<string, Cents>;
      try {
        recoverSplit = splitByOwnership(graph, horseId, bill.billDate, cost);
        markupSplit = splitByOwnership(graph, horseId, bill.billDate, markupTotal);
      } catch {
        continue;
      }
      for (const [ownerPartyId, recover] of recoverSplit) {
        const markup = markupSplit.get(ownerPartyId) ?? ZERO;
        const amount = (recover + markup) as Cents;
        if (amount === 0n) continue;
        draftLines.push({
          ownerPartyId,
          horseId,
          kind: "PASSTHROUGH",
          categoryId: line.categoryId,
          description: line.description,
          amount,
          recover,
          markup,
        });
      }
    }
    passedBills.push(bill.id);
  }

  // Group by owner and create one invoice + one balanced entry each.
  const byOwner = new Map<string, DraftLine[]>();
  for (const l of draftLines) {
    if (alreadyBilled.has(l.ownerPartyId)) continue;
    const list = byOwner.get(l.ownerPartyId) ?? [];
    list.push(l);
    byOwner.set(l.ownerPartyId, list);
  }

  const ledger = ledgerFor(ctx);
  const ownersBilled: string[] = [];
  let totalBilled = ZERO;

  for (const [ownerPartyId, lines] of byOwner) {
    const invoiceTotal = lines.reduce((a, l) => (a + l.amount) as Cents, ZERO);
    if (invoiceTotal === 0n) continue;

    const entryLines: JournalLineInput[] = [
      { accountKind: "ACCOUNTS_RECEIVABLE", debit: invoiceTotal, partyId: ownerPartyId },
    ];
    for (const l of lines) {
      if (l.kind === "TRAINING") {
        entryLines.push({
          accountKind: "OPERATING_INCOME",
          credit: l.amount,
          horseId: l.horseId,
          categoryId: "training",
        });
      } else {
        if (l.recover > 0n) {
          entryLines.push({
            accountKind: "OPERATING_EXPENSE",
            credit: l.recover,
            horseId: l.horseId,
            ...(l.categoryId ? { categoryId: l.categoryId } : {}),
          });
        }
        if (l.markup > 0n) {
          entryLines.push({
            accountKind: "OPERATING_INCOME",
            credit: l.markup,
            horseId: l.horseId,
            ...(l.categoryId ? { categoryId: l.categoryId } : {}),
          });
        }
      }
    }

    const entry = await ledger.postEntry(
      { date: asOf, memo: `Owner invoice ${runKey}` },
      entryLines,
    );

    await prisma.invoice.create({
      data: {
        orgId,
        legalEntityId,
        ownerPartyId,
        periodStart: period.start,
        periodEnd: period.end,
        status: "FINALIZED",
        runKey,
        journalEntryId: entry.id,
        lines: {
          create: lines.map((l) => ({
            horseId: l.horseId,
            categoryId: l.categoryId,
            kind: l.kind,
            description: l.description,
            amountCents: l.amount,
            recoverCents: l.recover,
            markupCents: l.markup,
          })),
        },
      },
    });

    ownersBilled.push(ownerPartyId);
    totalBilled = (totalBilled + invoiceTotal) as Cents;
  }

  // Mark the passed-through bills so a re-run skips them.
  if (passedBills.length > 0) {
    await prisma.vendorBill.updateMany({
      where: { id: { in: passedBills } },
      data: { invoicedRunKey: runKey },
    });
  }

  return {
    runKey,
    invoicesCreated: ownersBilled.length,
    ownersBilled,
    totalBilled,
    skipped: ownersBilled.length === 0 && alreadyBilled.size > 0,
  };
}

export { cents };
