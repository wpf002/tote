import {
  applyBps,
  splitByOwnership,
  type Cents,
  type JournalLineInput,
} from "@tote/core";
import { ledgerFor, type ServiceContext } from "./context.js";
import { loadOwnershipGraph } from "./ownership.js";

const ZERO = 0n as Cents;

/**
 * Create a stakes nomination/keep-in payment ladder for a horse and schedule a
 * reminder for each firing deadline. The reminders drive the deadline alerts.
 */
export async function createStakesSchedule(
  ctx: ServiceContext,
  input: {
    horseId: string;
    raceName: string;
    payments: Array<{ label: string; dueDate: Date; amountCents: Cents }>;
  },
): Promise<{ scheduleId: string; reminders: number }> {
  const schedule = await ctx.prisma.stakesSchedule.create({
    data: {
      orgId: ctx.orgId,
      horseId: input.horseId,
      raceName: input.raceName,
      payments: {
        create: input.payments.map((p) => ({
          label: p.label,
          dueDate: p.dueDate,
          amountCents: p.amountCents,
        })),
      },
    },
    include: { payments: true },
  });

  for (const p of schedule.payments) {
    await ctx.prisma.reminder.create({
      data: {
        orgId: ctx.orgId,
        entityType: "StakesPayment",
        entityId: p.id,
        dueDate: p.dueDate,
        message: `${input.raceName}: ${p.label} due (${p.dueDate.toISOString().slice(0, 10)})`,
      },
    });
  }

  return { scheduleId: schedule.id, reminders: schedule.payments.length };
}

/** Unresolved stakes deadlines due on or before `by`. */
export async function upcomingStakesDeadlines(
  ctx: ServiceContext,
  by: Date,
): Promise<Array<{ id: string; paymentId: string; dueDate: Date; message: string }>> {
  const reminders = await ctx.prisma.reminder.findMany({
    where: { orgId: ctx.orgId, entityType: "StakesPayment", resolved: false, dueDate: { lte: by } },
    orderBy: { dueDate: "asc" },
  });
  return reminders.map((r) => ({
    id: r.id,
    paymentId: r.entityId,
    dueDate: r.dueDate,
    message: r.message,
  }));
}

/** Pay a stakes installment: post `Dr Operating Expense / Cr Cash` and resolve its reminder. */
export async function payStakesInstallment(
  ctx: ServiceContext,
  stakesPaymentId: string,
): Promise<{ entryId: string }> {
  const payment = await ctx.prisma.stakesPayment.findUnique({
    where: { id: stakesPaymentId },
    include: { schedule: true },
  });
  if (!payment) throw new Error("Stakes payment not found");
  if (payment.schedule.orgId !== ctx.orgId) throw new Error("Wrong tenant");

  const ledger = ledgerFor(ctx);
  const entry = await ledger.postEntry(
    { date: new Date(), memo: `Stakes: ${payment.label}` },
    [
      {
        accountKind: "OPERATING_EXPENSE",
        debit: payment.amountCents as Cents,
        horseId: payment.schedule.horseId,
        categoryId: "stakes",
      },
      { accountKind: "CASH", credit: payment.amountCents as Cents },
    ],
  );

  await ctx.prisma.stakesPayment.update({ where: { id: stakesPaymentId }, data: { paid: true } });
  await ctx.prisma.reminder.updateMany({
    where: { entityType: "StakesPayment", entityId: stakesPaymentId },
    data: { resolved: true },
  });

  return { entryId: entry.id };
}

export interface RaceResultInput {
  horseId: string;
  gross: Cents;
  resultDate: Date;
  trainerCut?: Cents;
  jockey?: { jockeyPartyId: string; mountFeeCents: Cents; winPctBp: number };
}

/**
 * Record a race-result purse with jockey fees flowing into the distribution.
 * From the gross purse: the jockey takes a mount fee + a win percentage
 * (`WAGES_PAYABLE`), the trainer takes their cut (`PURSE_REVENUE`), and the
 * remaining owner-net is split across owners (`OWNER_PURSE_PAYABLE`),
 * penny-exact. Cash in equals gross; the entry balances.
 */
export async function recordRaceResult(
  ctx: ServiceContext,
  input: RaceResultInput,
): Promise<{
  entryId: string;
  jockeyFee: Cents;
  trainerCut: Cents;
  ownerNet: Cents;
  allocations: Array<{ partyId: string; amount: Cents }>;
}> {
  if (input.gross <= 0n) throw new Error("Gross purse must be positive");

  const jockeyFee = input.jockey
    ? ((input.jockey.mountFeeCents as bigint) +
        (applyBps(input.gross, input.jockey.winPctBp) as bigint)) as Cents
    : ZERO;
  const trainerCut = input.trainerCut ?? ZERO;
  const ownerNet = ((input.gross as bigint) - (jockeyFee as bigint) - (trainerCut as bigint)) as Cents;
  if (ownerNet <= 0n) throw new Error("Jockey + trainer cut exceed the purse");

  const graph = await loadOwnershipGraph(ctx.prisma, ctx.orgId);
  const split = splitByOwnership(graph, input.horseId, input.resultDate, ownerNet);
  const allocations = [...split.entries()].map(([partyId, amount]) => ({ partyId, amount }));

  const lines: JournalLineInput[] = [
    { accountKind: "CASH", debit: input.gross, horseId: input.horseId },
    ...allocations.map((a) => ({
      accountKind: "OWNER_PURSE_PAYABLE" as const,
      credit: a.amount,
      partyId: a.partyId,
    })),
  ];
  if (jockeyFee > 0n && input.jockey) {
    lines.push({
      accountKind: "WAGES_PAYABLE",
      credit: jockeyFee,
      partyId: input.jockey.jockeyPartyId,
    });
  }
  if (trainerCut > 0n) {
    lines.push({ accountKind: "PURSE_REVENUE", credit: trainerCut, horseId: input.horseId });
  }

  const ledger = ledgerFor(ctx);
  const entry = await ledger.postEntry(
    { date: input.resultDate, memo: "Race result purse (jockey + trainer deducted)" },
    lines,
  );

  await ctx.prisma.purse.create({
    data: {
      orgId: ctx.orgId,
      legalEntityId: ctx.legalEntityId,
      horseId: input.horseId,
      resultDate: input.resultDate,
      grossCents: input.gross,
      netToOwnerCents: ownerNet,
      journalEntryId: entry.id,
      allocations: { create: allocations.map((a) => ({ partyId: a.partyId, amountCents: a.amount })) },
    },
  });

  return { entryId: entry.id, jockeyFee, trainerCut, ownerNet, allocations };
}
