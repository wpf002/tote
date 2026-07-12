import { ownerPaymentIn, type Cents } from "@tote/core";
import { ledgerFor, type ServiceContext } from "./context.js";

export interface PaymentApplicationInput {
  invoiceId: string;
  amount: Cents;
}

/**
 * Record an owner payment: post `Dr Cash / Cr Receivable`, store the payment and
 * its applications, and mark fully-settled invoices PAID. The applied amounts
 * must not exceed the payment.
 */
export async function recordOwnerPayment(
  ctx: ServiceContext,
  input: {
    partyId: string;
    amount: Cents;
    method: "CASH" | "CHECK" | "ACH" | "CARD";
    receivedAt: Date;
    applications?: PaymentApplicationInput[];
  },
): Promise<{ paymentId: string; entryId: string }> {
  if (input.amount <= 0n) throw new Error("Payment amount must be positive");
  const applications = input.applications ?? [];
  const applied = applications.reduce((a, x) => a + (x.amount as bigint), 0n);
  if (applied > (input.amount as bigint)) {
    throw new Error("Applied amount exceeds the payment total");
  }

  const ledger = ledgerFor(ctx);
  const draft = ownerPaymentIn({ ownerPartyId: input.partyId, amount: input.amount });
  const entry = await ledger.postEntry({ date: input.receivedAt, memo: draft.memo }, draft.lines);

  const payment = await ctx.prisma.payment.create({
    data: {
      orgId: ctx.orgId,
      legalEntityId: ctx.legalEntityId,
      partyId: input.partyId,
      direction: "IN",
      method: input.method,
      amountCents: input.amount,
      receivedAt: input.receivedAt,
      journalEntryId: entry.id,
      applications: {
        create: applications.map((a) => ({ invoiceId: a.invoiceId, amountCents: a.amount })),
      },
    },
  });

  // Mark invoices PAID when their applied total covers their invoice total.
  for (const app of applications) {
    const invoice = await ctx.prisma.invoice.findUnique({
      where: { id: app.invoiceId },
      include: { lines: true, paymentApplications: true },
    });
    if (!invoice) continue;
    const invoiceTotal = invoice.lines.reduce((a, l) => a + l.amountCents, 0n);
    const paidTotal = invoice.paymentApplications.reduce((a, p) => a + p.amountCents, 0n);
    if (paidTotal >= invoiceTotal && invoiceTotal > 0n) {
      await ctx.prisma.invoice.update({ where: { id: invoice.id }, data: { status: "PAID" } });
    }
  }

  return { paymentId: payment.id, entryId: entry.id };
}
