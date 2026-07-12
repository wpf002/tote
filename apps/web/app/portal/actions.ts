"use server";

import { revalidatePath } from "next/cache";
import { createPaymentIntent, handleRailWebhook } from "@tote/services";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getServiceContext } from "@/lib/services";
import { rail, WEBHOOK_SECRET } from "@/lib/rail";

/**
 * Pay an invoice online. Creates a rail payment intent, then — in the sandbox —
 * simulates the provider's signed settlement webhook. With a live provider the
 * client would confirm the intent and the provider would post the webhook to
 * /api/rail/webhook. Either way, funds settle to the trainer; Tote holds nothing.
 */
export async function payInvoiceOnline(formData: FormData): Promise<void> {
  const invoiceId = String(formData.get("invoiceId") ?? "");
  const user = await getCurrentUser();
  if (!user?.partyId) throw new Error("Not an owner account");

  // An owner may only pay their own invoices.
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, orgId: user.orgId, ownerPartyId: user.partyId },
  });
  if (!invoice) throw new Error("Invoice not found");

  const ctx = await getServiceContext();
  const intent = await createPaymentIntent(ctx, { invoiceId, provider: rail });

  const evt = rail.buildEvent(
    {
      type: "payment_intent.succeeded",
      providerIntentId: intent.providerIntentId,
      amountCents: intent.amountCents.toString(),
    },
    WEBHOOK_SECRET,
  );
  await handleRailWebhook(prisma, { ...evt, secret: WEBHOOK_SECRET, provider: rail });

  revalidatePath("/portal");
}
