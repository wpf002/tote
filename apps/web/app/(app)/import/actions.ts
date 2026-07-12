"use server";

import { revalidatePath } from "next/cache";
import {
  importVendorBills,
  importOwnershipRoster,
  importTrainingRates,
  type VendorBillMapping,
} from "@tote/services";
import { fmt } from "@/lib/money";
import { getServiceContext } from "@/lib/services";

export interface ImportOutcome {
  ok?: boolean;
  summary?: string[];
  warnings?: string[];
  errors?: string[];
  error?: string;
}

export async function importRoster(_prev: ImportOutcome, formData: FormData): Promise<ImportOutcome> {
  const csv = String(formData.get("csv") ?? "");
  if (!csv.trim()) return { error: "Paste CSV first." };
  const mapping = {
    horse: String(formData.get("col_horse") ?? "Horse"),
    owner: String(formData.get("col_owner") ?? "Owner"),
    share: String(formData.get("col_share") ?? "Percent"),
  };
  try {
    const ctx = await getServiceContext();
    const r = await importOwnershipRoster(ctx, csv, mapping, { createMissing: true });
    revalidatePath("/horses");
    revalidatePath("/owners");
    return {
      ok: true,
      summary: [
        `Imported ${r.horsesImported} horses · ${r.stakesCreated} ownership stakes`,
        `Created ${r.horsesCreated} new horses, ${r.ownersCreated} new owners`,
      ],
      warnings: r.warnings,
      errors: r.errors.map((e) => `${e.horse}: ${e.message}`),
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Import failed" };
  }
}

export async function importRates(_prev: ImportOutcome, formData: FormData): Promise<ImportOutcome> {
  const csv = String(formData.get("csv") ?? "");
  if (!csv.trim()) return { error: "Paste CSV first." };
  const mapping = {
    horse: String(formData.get("col_horse") ?? "Horse"),
    dailyRate: String(formData.get("col_dailyRate") ?? "Daily Rate"),
  };
  try {
    const ctx = await getServiceContext();
    const r = await importTrainingRates(ctx, csv, mapping, { createMissing: true });
    revalidatePath("/horses");
    return {
      ok: true,
      summary: [`Imported ${r.imported} training rates · ${r.horsesCreated} new horses`],
      errors: r.errors.map((e) => `Row ${e.row}: ${e.message}`),
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Import failed" };
  }
}

export async function importBills(_prev: ImportOutcome, formData: FormData): Promise<ImportOutcome> {
  const csv = String(formData.get("csv") ?? "");
  if (!csv.trim()) return { error: "Paste CSV first." };
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
    const r = await importVendorBills(ctx, csv, mapping, { createMissing: true });
    revalidatePath("/vendor-bills");
    revalidatePath("/dashboard");
    return {
      ok: true,
      summary: [`Imported ${r.imported} vendor bills · ${fmt(r.total)}`],
      errors: r.errors.map((e) => `Row ${e.row}: ${e.message}`),
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Import failed" };
  }
}
