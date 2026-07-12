"use server";

import { revalidatePath } from "next/cache";
import { importVendorBills, type VendorBillMapping } from "@tote/services";
import { fmt } from "@/lib/money";
import { getServiceContext } from "@/lib/services";

export interface ImportState {
  ok?: boolean;
  imported?: number;
  total?: string;
  errors?: string[];
  error?: string;
}

export async function importBills(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const csv = String(formData.get("csv") ?? "");
  if (!csv.trim()) return { error: "Paste some CSV first." };

  const mapping: VendorBillMapping = {
    date: String(formData.get("col_date") ?? "Date"),
    vendor: String(formData.get("col_vendor") ?? "Vendor"),
    amount: String(formData.get("col_amount") ?? "Amount"),
    horse: String(formData.get("col_horse") ?? "Horse") || undefined,
    category: String(formData.get("col_category") ?? "Category") || undefined,
    description: String(formData.get("col_description") ?? "Memo") || undefined,
  };

  try {
    const ctx = await getServiceContext();
    const result = await importVendorBills(ctx, csv, mapping, { createMissing: true });
    revalidatePath("/vendor-bills");
    revalidatePath("/dashboard");
    return {
      ok: true,
      imported: result.imported,
      total: fmt(result.total),
      errors: result.errors.map((e) => `Row ${e.row}: ${e.message}`),
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Import failed" };
  }
}
