"use server";

import { revalidatePath } from "next/cache";
import { applyPurseCreditToInvoices } from "@tote/services";
import { getServiceContext } from "@/lib/services";

export async function applyCredit(formData: FormData): Promise<void> {
  const partyId = String(formData.get("partyId") ?? "");
  if (!partyId) throw new Error("Party is required");

  const ctx = await getServiceContext();
  await applyPurseCreditToInvoices(ctx, { partyId });

  revalidatePath(`/owners/${partyId}`);
  revalidatePath("/owners");
  revalidatePath("/invoices");
  revalidatePath("/dashboard");
}
