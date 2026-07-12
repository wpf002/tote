"use server";

import { draftReceipt, type ReceiptDraft } from "@/lib/intelligence";

export interface DraftState {
  draft?: ReceiptDraft;
  error?: string;
}

export async function draftFromReceipt(_prev: DraftState, formData: FormData): Promise<DraftState> {
  const text = String(formData.get("text") ?? "");
  if (!text.trim()) return { error: "Paste receipt text first." };
  const draft = await draftReceipt(text);
  if (!draft) return { error: "Intelligence service is offline." };
  return { draft };
}
