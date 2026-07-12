import {
  disburse,
  purseCreditedToInvoice,
  type Cents,
  type PartnerAllocation,
} from "@tote/core";
import { ledgerFor, type ServiceContext } from "./context.js";
import { loadOwnershipGraph } from "./ownership.js";

const ZERO = 0n as Cents;

/**
 * Record a purse and disburse it across the horse's owners as of the result
 * date — walking nested syndicates to leaf partners, penny-exact — then post the
 * balanced `purse received` entry. This is the Phase 2 wedge.
 */
export async function recordAndDisbursePurse(
  ctx: ServiceContext,
  input: { horseId: string; ownerNet: Cents; trainerCut?: Cents; resultDate: Date },
): Promise<{ purseId: string; entryId: string; allocations: PartnerAllocation[] }> {
  if (input.ownerNet <= 0n) throw new Error("Owner-net must be positive");
  const graph = await loadOwnershipGraph(ctx.prisma, ctx.orgId);
  const { allocations, draft } = disburse(
    graph,
    input.horseId,
    input.resultDate,
    input.ownerNet,
    input.trainerCut ?? ZERO,
  );

  const ledger = ledgerFor(ctx);
  const entry = await ledger.postEntry({ date: input.resultDate, memo: draft.memo }, draft.lines);

  const purse = await ctx.prisma.purse.create({
    data: {
      orgId: ctx.orgId,
      legalEntityId: ctx.legalEntityId,
      horseId: input.horseId,
      resultDate: input.resultDate,
      grossCents: ((input.ownerNet as bigint) + ((input.trainerCut ?? ZERO) as bigint)) as bigint,
      netToOwnerCents: input.ownerNet as bigint,
      journalEntryId: entry.id,
      allocations: { create: allocations.map((a) => ({ partyId: a.partyId, amountCents: a.amount })) },
    },
  });

  return { purseId: purse.id, entryId: entry.id, allocations };
}

/**
 * Net a partner's purse credit against what they owe. Applies their available
 * `OWNER_PURSE_PAYABLE` to their outstanding invoices (oldest first), posting
 * `Dr Owner Purse Payable / Cr Accounts Receivable` and marking settled invoices
 * PAID. Applies at most `min(purse payable, total outstanding)`.
 */
export async function applyPurseCreditToInvoices(
  ctx: ServiceContext,
  input: { partyId: string },
): Promise<{ applied: Cents; entryId: string | null; invoicesSettled: number }> {
  const { prisma, orgId, legalEntityId } = ctx;
  const ledger = ledgerFor(ctx);

  const available = await ledger.balanceOf("OWNER_PURSE_PAYABLE", { partyId: input.partyId });
  if (available <= 0n) return { applied: ZERO, entryId: null, invoicesSettled: 0 };

  const invoices = await prisma.invoice.findMany({
    where: { orgId, legalEntityId, ownerPartyId: input.partyId, status: "FINALIZED" },
    include: { lines: true, paymentApplications: true },
    orderBy: { createdAt: "asc" },
  });

  let remaining = available as bigint;
  const applications: Array<{ invoiceId: string; amount: bigint; settles: boolean }> = [];
  for (const inv of invoices) {
    if (remaining <= 0n) break;
    const total = inv.lines.reduce((a, l) => a + l.amountCents, 0n);
    const paid = inv.paymentApplications.reduce((a, p) => a + p.amountCents, 0n);
    const outstanding = total - paid;
    if (outstanding <= 0n) continue;
    const apply = outstanding < remaining ? outstanding : remaining;
    applications.push({ invoiceId: inv.id, amount: apply, settles: apply >= outstanding });
    remaining -= apply;
  }

  const applied = ((available as bigint) - remaining) as Cents;
  if (applied <= 0n) return { applied: ZERO, entryId: null, invoicesSettled: 0 };

  const draft = purseCreditedToInvoice({ partyId: input.partyId, amount: applied });
  const entry = await ledger.postEntry({ date: new Date(), memo: draft.memo }, draft.lines);

  // Record the credit as a PURSE_CREDIT payment with its applications.
  await prisma.payment.create({
    data: {
      orgId,
      legalEntityId,
      partyId: input.partyId,
      direction: "IN",
      method: "PURSE_CREDIT",
      amountCents: applied,
      receivedAt: new Date(),
      journalEntryId: entry.id,
      applications: {
        create: applications.map((a) => ({ invoiceId: a.invoiceId, amountCents: a.amount })),
      },
    },
  });

  const settled = applications.filter((a) => a.settles).map((a) => a.invoiceId);
  if (settled.length > 0) {
    await prisma.invoice.updateMany({ where: { id: { in: settled } }, data: { status: "PAID" } });
  }

  return { applied, entryId: entry.id, invoicesSettled: settled.length };
}
