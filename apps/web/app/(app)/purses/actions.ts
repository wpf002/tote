"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { toCents, cents } from "@tote/core";
import { recordAndDisbursePurse } from "@tote/services";
import { getServiceContext } from "@/lib/services";

export async function recordPurse(formData: FormData): Promise<void> {
  const horseId = String(formData.get("horseId") ?? "");
  const ownerNetRaw = String(formData.get("ownerNet") ?? "").trim();
  const trainerCutRaw = String(formData.get("trainerCut") ?? "").trim();
  const resultDate = new Date(String(formData.get("resultDate") || new Date().toISOString().slice(0, 10)));

  if (!horseId || !ownerNetRaw) throw new Error("Horse and owner-net are required");

  const ctx = await getServiceContext();
  await recordAndDisbursePurse(ctx, {
    horseId,
    ownerNet: toCents(ownerNetRaw),
    trainerCut: trainerCutRaw ? toCents(trainerCutRaw) : cents(0n),
    resultDate,
  });

  revalidatePath("/purses");
  revalidatePath("/dashboard");
  revalidatePath("/owners");
  redirect("/purses");
}
