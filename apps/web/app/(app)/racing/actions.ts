"use server";

import { revalidatePath } from "next/cache";
import { toCents } from "@tote/core";
import {
  createStakesSchedule,
  payStakesInstallment,
  recordRaceResult,
} from "@tote/services";
import { getServiceContext } from "@/lib/services";

export async function addStakesSchedule(formData: FormData): Promise<void> {
  const horseId = String(formData.get("horseId") ?? "");
  const raceName = String(formData.get("raceName") ?? "").trim();
  if (!horseId || !raceName) throw new Error("Horse and race name are required");

  const payments = [] as Array<{ label: string; dueDate: Date; amountCents: ReturnType<typeof toCents> }>;
  for (const n of ["1", "2"]) {
    const label = String(formData.get(`label_${n}`) ?? "").trim();
    const due = String(formData.get(`due_${n}`) ?? "").trim();
    const amount = String(formData.get(`amount_${n}`) ?? "").trim();
    if (label && due && amount) {
      payments.push({ label, dueDate: new Date(due), amountCents: toCents(amount) });
    }
  }
  if (payments.length === 0) throw new Error("Add at least one payment");

  const ctx = await getServiceContext();
  await createStakesSchedule(ctx, { horseId, raceName, payments });
  revalidatePath("/racing");
}

export async function payStakes(formData: FormData): Promise<void> {
  const paymentId = String(formData.get("paymentId") ?? "");
  if (!paymentId) throw new Error("Payment id required");
  const ctx = await getServiceContext();
  await payStakesInstallment(ctx, paymentId);
  revalidatePath("/racing");
  revalidatePath("/dashboard");
}

export async function recordResult(formData: FormData): Promise<void> {
  const horseId = String(formData.get("horseId") ?? "");
  const gross = String(formData.get("gross") ?? "").trim();
  const trainerCut = String(formData.get("trainerCut") ?? "").trim();
  const jockeyPartyId = String(formData.get("jockeyPartyId") ?? "");
  const mountFee = String(formData.get("mountFee") ?? "").trim();
  const winPct = String(formData.get("winPct") ?? "").trim();
  if (!horseId || !gross) throw new Error("Horse and gross are required");

  const ctx = await getServiceContext();
  await recordRaceResult(ctx, {
    horseId,
    gross: toCents(gross),
    resultDate: new Date(String(formData.get("resultDate") || new Date().toISOString().slice(0, 10))),
    ...(trainerCut ? { trainerCut: toCents(trainerCut) } : {}),
    ...(jockeyPartyId && mountFee
      ? {
          jockey: {
            jockeyPartyId,
            mountFeeCents: toCents(mountFee),
            winPctBp: winPct ? Math.round(Number(winPct) * 100) : 0,
          },
        }
      : {}),
  });
  revalidatePath("/racing");
  revalidatePath("/purses");
  revalidatePath("/dashboard");
}
