"use server";

import { revalidatePath } from "next/cache";
import { importBankTransactions, proposeReconciliation, commitMatches } from "@tote/services";
import { prisma } from "@/lib/db";
import { getTenant } from "@/lib/tenant";
import { getServiceContext } from "@/lib/services";

async function ensureBankAccount(): Promise<string> {
  const { orgId, legalEntityId } = await getTenant();
  const existing = await prisma.bankAccount.findFirst({ where: { orgId, legalEntityId } });
  if (existing) return existing.id;
  const created = await prisma.bankAccount.create({
    data: { orgId, legalEntityId, name: "Operating Account" },
  });
  return created.id;
}

export async function importBank(formData: FormData): Promise<void> {
  const csv = String(formData.get("csv") ?? "");
  if (!csv.trim()) throw new Error("Paste bank CSV first");
  const bankAccountId = await ensureBankAccount();
  const ctx = await getServiceContext();
  await importBankTransactions(ctx, bankAccountId, csv, {
    date: "Date",
    amount: "Amount",
    description: "Description",
  });
  revalidatePath("/reconcile");
}

export async function commitAllMatches(): Promise<void> {
  const bankAccountId = await ensureBankAccount();
  const ctx = await getServiceContext();
  const proposal = await proposeReconciliation(ctx, bankAccountId, { windowDays: 90 });
  await commitMatches(
    ctx,
    proposal.matches.map((m) => ({ bankTransactionId: m.bankTransactionId, entryId: m.entryId })),
  );
  revalidatePath("/reconcile");
}
