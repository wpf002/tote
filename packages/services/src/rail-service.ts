import type { PrismaClient } from "@prisma/client";
import type { Cents } from "@tote/core";
import { recordOwnerPayment } from "./payments.js";
import type { RailProvider } from "./rail.js";
import type { ServiceContext } from "./context.js";

/**
 * Start an online payment for an invoice: create a provider intent for the
 * outstanding amount and record it. Nothing settles until the provider posts a
 * verified webhook — Tote never moves the money itself.
 */
export async function createPaymentIntent(
  ctx: ServiceContext,
  input: { invoiceId: string; provider: RailProvider; connectedAccountId?: string },
): Promise<{ providerIntentId: string; clientSecret: string; amountCents: Cents }> {
  const invoice = await ctx.prisma.invoice.findFirst({
    where: { id: input.invoiceId, orgId: ctx.orgId, legalEntityId: ctx.legalEntityId },
    include: { lines: true, paymentApplications: true },
  });
  if (!invoice) throw new Error("Invoice not found");

  const total = invoice.lines.reduce((a, l) => a + l.amountCents, 0n);
  const paid = invoice.paymentApplications.reduce((a, p) => a + p.amountCents, 0n);
  const outstanding = total - paid;
  if (outstanding <= 0n) throw new Error("Invoice has nothing outstanding");

  const intent = await input.provider.createIntent({
    amountCents: outstanding,
    reference: invoice.id,
    ...(input.connectedAccountId ? { connectedAccountId: input.connectedAccountId } : {}),
  });

  await ctx.prisma.paymentIntent.create({
    data: {
      orgId: ctx.orgId,
      legalEntityId: ctx.legalEntityId,
      invoiceId: invoice.id,
      provider: input.provider.name,
      providerIntentId: intent.providerIntentId,
      amountCents: outstanding,
      status: "requires_payment",
    },
  });

  return { ...intent, amountCents: outstanding as Cents };
}

/**
 * Handle a rail webhook: verify the signature, then on success settle the
 * invoice by posting `Dr Cash / Cr Receivable` (funds land in the trainer's
 * connected account; Tote holds nothing). Idempotent — a replayed event that
 * already settled is a no-op. Tenant is derived from the stored intent, so this
 * needs no session.
 */
export async function handleRailWebhook(
  prisma: PrismaClient,
  input: { payload: string; signature: string; secret: string; provider: RailProvider },
): Promise<{ settled: boolean; reason?: string }> {
  if (!input.provider.verifyWebhook(input.payload, input.signature, input.secret)) {
    throw new Error("Invalid webhook signature");
  }
  const event = JSON.parse(input.payload) as {
    type: string;
    providerIntentId: string;
    amountCents: string;
  };

  const intent = await prisma.paymentIntent.findUnique({
    where: { providerIntentId: event.providerIntentId },
  });
  if (!intent) return { settled: false, reason: "unknown intent" };

  if (event.type === "payment_intent.failed") {
    await prisma.paymentIntent.update({ where: { id: intent.id }, data: { status: "failed" } });
    return { settled: false, reason: "failed" };
  }
  if (event.type !== "payment_intent.succeeded") {
    return { settled: false, reason: "ignored" };
  }
  if (intent.status === "succeeded") return { settled: false, reason: "already settled" };
  if (!intent.invoiceId) return { settled: false, reason: "no invoice" };

  const invoice = await prisma.invoice.findUnique({ where: { id: intent.invoiceId } });
  if (!invoice) return { settled: false, reason: "invoice gone" };

  const ctx: ServiceContext = {
    prisma,
    orgId: intent.orgId,
    legalEntityId: intent.legalEntityId,
  };
  const method = input.provider.name.includes("ach") ? "ACH" : "CARD";
  await recordOwnerPayment(ctx, {
    partyId: invoice.ownerPartyId,
    amount: intent.amountCents as Cents,
    method,
    receivedAt: new Date(),
    applications: [{ invoiceId: invoice.id, amount: intent.amountCents as Cents }],
  });

  await prisma.paymentIntent.update({ where: { id: intent.id }, data: { status: "succeeded" } });
  return { settled: true };
}
