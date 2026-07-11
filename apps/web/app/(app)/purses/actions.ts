"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { toCents, cents, disburse } from "@tote/core";
import { prisma } from "@/lib/db";
import { getLedger, getTenant } from "@/lib/tenant";
import { loadOwnershipGraph } from "@/lib/ownership";

export async function recordPurse(formData: FormData): Promise<void> {
  const { orgId, legalEntityId } = await getTenant();

  const horseId = String(formData.get("horseId") ?? "");
  const ownerNetRaw = String(formData.get("ownerNet") ?? "").trim();
  const trainerCutRaw = String(formData.get("trainerCut") ?? "").trim();
  const resultDate = new Date(String(formData.get("resultDate") || new Date().toISOString().slice(0, 10)));

  if (!horseId || !ownerNetRaw) throw new Error("Horse and owner-net are required");
  const ownerNet = toCents(ownerNetRaw);
  const trainerCut = trainerCutRaw ? toCents(trainerCutRaw) : cents(0n);
  if (ownerNet <= 0n) throw new Error("Owner-net must be positive");

  // Resolve ownership as of the result date and split across leaf partners.
  const graph = await loadOwnershipGraph(orgId);
  const { allocations, draft } = disburse(graph, horseId, resultDate, ownerNet, trainerCut);

  const ledger = await getLedger();
  const entry = await ledger.postEntry({ date: resultDate, memo: draft.memo }, draft.lines);

  await prisma.purse.create({
    data: {
      orgId,
      legalEntityId,
      horseId,
      resultDate,
      grossCents: (ownerNet + trainerCut) as bigint,
      netToOwnerCents: ownerNet as bigint,
      journalEntryId: entry.id,
      allocations: {
        create: allocations.map((a) => ({ partyId: a.partyId, amountCents: a.amount })),
      },
    },
  });

  revalidatePath("/purses");
  revalidatePath("/dashboard");
  redirect("/purses");
}
