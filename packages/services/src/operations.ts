import { splitCents, type Cents, type JournalLineInput } from "@tote/core";
import { ledgerFor, type ServiceContext } from "./context.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const ZERO = 0n as Cents;

/* ------------------------------------------------------------------ payroll */

/** Run payroll: post `Dr Labor Expense / Cr Wages Payable` per employee. */
export async function runPayroll(
  ctx: ServiceContext,
  input: {
    periodStart: Date;
    periodEnd: Date;
    lines: Array<{ employeeId: string; grossCents: Cents }>;
  },
): Promise<{ payrollRunId: string; entryId: string; total: Cents }> {
  if (input.lines.length === 0) throw new Error("Payroll needs at least one line");
  const employees = await ctx.prisma.employee.findMany({
    where: { id: { in: input.lines.map((l) => l.employeeId) }, orgId: ctx.orgId },
  });
  const partyOf = new Map(employees.map((e) => [e.id, e.partyId]));

  const entryLines: JournalLineInput[] = [];
  let total = ZERO;
  for (const l of input.lines) {
    const partyId = partyOf.get(l.employeeId);
    if (!partyId) throw new Error(`Unknown employee ${l.employeeId}`);
    entryLines.push({ accountKind: "OPERATING_EXPENSE", debit: l.grossCents, categoryId: "labor" });
    entryLines.push({ accountKind: "WAGES_PAYABLE", credit: l.grossCents, partyId });
    total = ((total as bigint) + (l.grossCents as bigint)) as Cents;
  }

  const ledger = ledgerFor(ctx);
  const entry = await ledger.postEntry({ date: input.periodEnd, memo: "Payroll run" }, entryLines);

  const run = await ctx.prisma.payrollRun.create({
    data: {
      orgId: ctx.orgId,
      legalEntityId: ctx.legalEntityId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      journalEntryId: entry.id,
      lines: {
        create: input.lines.map((l) => ({ employeeId: l.employeeId, grossCents: l.grossCents })),
      },
    },
  });
  return { payrollRunId: run.id, entryId: entry.id, total };
}

/* --------------------------------------------------------------- AP aging */

export interface ApAgingRow {
  vendorPartyId: string;
  current: bigint;
  d30: bigint;
  d60: bigint;
  d90plus: bigint;
  total: bigint;
}

/**
 * Vendor AP aging as of a date. Each vendor's outstanding payable (derived from
 * the ledger) is aged against their approved bills oldest-first into
 * current / 31-60 / 61-90 / 90+ buckets.
 */
export async function apAging(ctx: ServiceContext, asOf: Date): Promise<ApAgingRow[]> {
  const ledger = ledgerFor(ctx);
  const bills = await ctx.prisma.vendorBill.findMany({
    where: { orgId: ctx.orgId, legalEntityId: ctx.legalEntityId, status: "APPROVED" },
    include: { lines: true },
    orderBy: { billDate: "asc" },
  });

  const byVendor = new Map<string, typeof bills>();
  for (const b of bills) {
    const list = byVendor.get(b.vendorPartyId) ?? [];
    list.push(b);
    byVendor.set(b.vendorPartyId, list);
  }

  const rows: ApAgingRow[] = [];
  for (const [vendorPartyId, vendorBills] of byVendor) {
    let outstanding = (await ledger.balanceOf("ACCOUNTS_PAYABLE", { partyId: vendorPartyId })) as bigint;
    if (outstanding <= 0n) continue;
    const row: ApAgingRow = { vendorPartyId, current: 0n, d30: 0n, d60: 0n, d90plus: 0n, total: outstanding };
    for (const bill of vendorBills) {
      if (outstanding <= 0n) break;
      const billTotal = bill.lines.reduce((a, l) => a + l.amountCents, 0n);
      const applied = billTotal < outstanding ? billTotal : outstanding;
      outstanding -= applied;
      const ageDays = Math.floor((asOf.getTime() - bill.billDate.getTime()) / MS_PER_DAY);
      if (ageDays <= 30) row.current += applied;
      else if (ageDays <= 60) row.d30 += applied;
      else if (ageDays <= 90) row.d60 += applied;
      else row.d90plus += applied;
    }
    rows.push(row);
  }
  return rows;
}

/* ------------------------------------------------------------ transportation */

/** Ship horses, splitting the total cost across them and posting per-horse expense. */
export async function recordShipment(
  ctx: ServiceContext,
  input: { shipDate: Date; fromLoc: string; toLoc: string; totalCents: Cents; horseIds: string[] },
): Promise<{ shipmentId: string; entryId: string; perHorse: Array<{ horseId: string; cost: Cents }> }> {
  if (input.horseIds.length === 0) throw new Error("A shipment needs at least one horse");
  const parts = splitCents(input.totalCents, input.horseIds.map(() => 1));
  const perHorse = input.horseIds.map((horseId, i) => ({ horseId, cost: parts[i]! }));

  const entryLines: JournalLineInput[] = [
    ...perHorse.map((p) => ({
      accountKind: "OPERATING_EXPENSE" as const,
      debit: p.cost,
      horseId: p.horseId,
      categoryId: "transport",
    })),
    { accountKind: "CASH", credit: input.totalCents },
  ];
  const ledger = ledgerFor(ctx);
  const entry = await ledger.postEntry(
    { date: input.shipDate, memo: `Shipment ${input.fromLoc} → ${input.toLoc}` },
    entryLines,
  );

  const shipment = await ctx.prisma.shipment.create({
    data: {
      orgId: ctx.orgId,
      shipDate: input.shipDate,
      fromLoc: input.fromLoc,
      toLoc: input.toLoc,
      totalCents: input.totalCents,
      horses: { create: perHorse.map((p) => ({ horseId: p.horseId, costCents: p.cost })) },
    },
  });
  return { shipmentId: shipment.id, entryId: entry.id, perHorse };
}

/* ---------------------------------------------------------------- insurance */

/** Record an insurance policy, post the premium expense, and remind on renewal. */
export async function recordInsurancePolicy(
  ctx: ServiceContext,
  input: {
    carrier: string;
    premiumCents: Cents;
    startDate: Date;
    endDate: Date;
    horseId?: string;
  },
): Promise<{ policyId: string; entryId: string }> {
  const ledger = ledgerFor(ctx);
  const entry = await ledger.postEntry({ date: input.startDate, memo: `Insurance: ${input.carrier}` }, [
    {
      accountKind: "OPERATING_EXPENSE",
      debit: input.premiumCents,
      categoryId: "insurance",
      ...(input.horseId ? { horseId: input.horseId } : {}),
    },
    { accountKind: "CASH", credit: input.premiumCents },
  ]);

  const policy = await ctx.prisma.insurancePolicy.create({
    data: {
      orgId: ctx.orgId,
      horseId: input.horseId ?? null,
      carrier: input.carrier,
      premiumCents: input.premiumCents,
      startDate: input.startDate,
      endDate: input.endDate,
    },
  });
  await ctx.prisma.reminder.create({
    data: {
      orgId: ctx.orgId,
      entityType: "InsurancePolicy",
      entityId: policy.id,
      dueDate: input.endDate,
      message: `Insurance renewal: ${input.carrier} expires ${input.endDate.toISOString().slice(0, 10)}`,
    },
  });
  return { policyId: policy.id, entryId: entry.id };
}

/** Post an insurance claim recovery as income: `Dr Cash / Cr Operating Income`. */
export async function recordInsuranceClaim(
  ctx: ServiceContext,
  input: { policyId: string; recoveryCents: Cents; filedDate: Date },
): Promise<{ claimId: string; entryId: string }> {
  const policy = await ctx.prisma.insurancePolicy.findFirst({
    where: { id: input.policyId, orgId: ctx.orgId },
  });
  if (!policy) throw new Error("Policy not found");

  const ledger = ledgerFor(ctx);
  const entry = await ledger.postEntry({ date: input.filedDate, memo: "Insurance claim recovery" }, [
    { accountKind: "CASH", debit: input.recoveryCents },
    {
      accountKind: "OPERATING_INCOME",
      credit: input.recoveryCents,
      categoryId: "insurance-recovery",
      ...(policy.horseId ? { horseId: policy.horseId } : {}),
    },
  ]);

  const claim = await ctx.prisma.insuranceClaim.create({
    data: { policyId: policy.id, filedDate: input.filedDate, recoveryCents: input.recoveryCents },
  });
  return { claimId: claim.id, entryId: entry.id };
}
