"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { toCents, vendorBillApproved } from "@tote/core";
import { prisma } from "@/lib/db";
import { getLedger, getTenant } from "@/lib/tenant";

export async function createVendorBill(formData: FormData): Promise<void> {
  const { orgId, legalEntityId } = await getTenant();

  const vendorPartyId = String(formData.get("vendorPartyId") ?? "");
  const horseId = String(formData.get("horseId") ?? "") || undefined;
  const categoryId = String(formData.get("categoryId") ?? "") || undefined;
  const description = String(formData.get("description") ?? "").trim() || "Services";
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const billDate = new Date(String(formData.get("billDate") || new Date().toISOString().slice(0, 10)));

  if (!vendorPartyId || !amountRaw) throw new Error("Vendor and amount are required");
  const amount = toCents(amountRaw);
  if (amount <= 0n) throw new Error("Amount must be positive");

  // Post the balanced entry, then record the bill linked to it.
  const ledger = await getLedger();
  const draft = vendorBillApproved({
    vendorPartyId,
    amount,
    ...(horseId ? { horseId } : {}),
    ...(categoryId ? { categoryId } : {}),
  });
  const entry = await ledger.postEntry({ date: billDate, memo: draft.memo }, draft.lines);

  await prisma.vendorBill.create({
    data: {
      orgId,
      legalEntityId,
      vendorPartyId,
      horseId: horseId ?? null,
      status: "APPROVED",
      billDate,
      journalEntryId: entry.id,
      lines: { create: [{ categoryId: categoryId ?? null, description, amountCents: amount }] },
    },
  });

  revalidatePath("/vendor-bills");
  revalidatePath("/dashboard");
  redirect("/vendor-bills");
}
