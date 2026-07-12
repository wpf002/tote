"use server";

import { revalidatePath } from "next/cache";
import { toCents } from "@tote/core";
import { monthPeriod, runMonthlyInvoices, recordOwnerPayment } from "@tote/services";
import { prisma } from "@/lib/db";
import { getServiceContext } from "@/lib/services";

export async function runMonth(formData: FormData): Promise<void> {
  const month = String(formData.get("month") ?? ""); // "YYYY-MM"
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) throw new Error("Pick a month");
  const year = Number(match[1]);
  const m = Number(match[2]);

  const ctx = await getServiceContext();
  await runMonthlyInvoices(ctx, monthPeriod(year, m));

  revalidatePath("/invoices");
  revalidatePath("/dashboard");
  revalidatePath("/owners");
}

export async function payInvoice(formData: FormData): Promise<void> {
  const invoiceId = String(formData.get("invoiceId") ?? "");
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const method = String(formData.get("method") ?? "ACH") as "CASH" | "CHECK" | "ACH" | "CARD";
  if (!invoiceId || !amountRaw) throw new Error("Invoice and amount are required");

  const ctx = await getServiceContext();
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, orgId: ctx.orgId, legalEntityId: ctx.legalEntityId },
  });
  if (!invoice) throw new Error("Invoice not found");

  await recordOwnerPayment(ctx, {
    partyId: invoice.ownerPartyId,
    amount: toCents(amountRaw),
    method,
    receivedAt: new Date(),
    applications: [{ invoiceId, amount: toCents(amountRaw) }],
  });

  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
  revalidatePath("/dashboard");
  revalidatePath("/owners");
}
