"use server";

import { revalidatePath } from "next/cache";
import { toCents } from "@tote/core";
import { recordHorsePurchase, recordHorseSale } from "@tote/services";
import { getServiceContext } from "@/lib/services";

export async function purchaseHorse(formData: FormData): Promise<void> {
  const horseId = String(formData.get("horseId") ?? "");
  const cost = String(formData.get("cost") ?? "").trim();
  if (!horseId || !cost) throw new Error("Horse and cost are required");
  const ctx = await getServiceContext();
  await recordHorsePurchase(ctx, {
    horseId,
    costCents: toCents(cost),
    date: new Date(String(formData.get("date") || new Date().toISOString().slice(0, 10))),
  });
  revalidatePath("/tax");
  revalidatePath("/dashboard");
}

export async function sellHorse(formData: FormData): Promise<void> {
  const horseId = String(formData.get("horseId") ?? "");
  const sale = String(formData.get("sale") ?? "").trim();
  if (!horseId || !sale) throw new Error("Horse and sale price are required");
  const ctx = await getServiceContext();
  await recordHorseSale(ctx, {
    horseId,
    saleCents: toCents(sale),
    date: new Date(String(formData.get("date") || new Date().toISOString().slice(0, 10))),
  });
  revalidatePath("/tax");
  revalidatePath("/dashboard");
}
