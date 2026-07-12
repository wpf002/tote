import { toCents, type Cents } from "@tote/core";
import { approveVendorBill } from "./billing.js";
import type { ServiceContext } from "./context.js";

/** Minimal RFC-4180 CSV parser: handles quotes, escaped quotes, and CRLF. */
export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;

  const pushField = () => {
    record.push(field);
    field = "";
  };
  const pushRecord = () => {
    pushField();
    records.push(record);
    record = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      pushField();
    } else if (ch === "\n") {
      pushRecord();
    } else if (ch === "\r") {
      // swallow; \n handles the record break
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || record.length > 0) pushRecord();

  const nonEmpty = records.filter((r) => r.some((c) => c.trim() !== ""));
  if (nonEmpty.length === 0) return { headers: [], rows: [] };

  const headers = nonEmpty[0]!.map((h) => h.trim());
  const rows = nonEmpty.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => (obj[h] = (r[idx] ?? "").trim()));
    return obj;
  });
  return { headers, rows };
}

/** Maps a barn's CSV columns to vendor-bill fields. Values are column headers. */
export interface VendorBillMapping {
  date: string;
  vendor: string;
  amount: string;
  horse?: string;
  category?: string;
  description?: string;
}

export interface ImportResult {
  imported: number;
  errors: Array<{ row: number; message: string }>;
  total: Cents;
}

/**
 * Import a month of vendor bills from a mapped CSV. Vendors/horses/categories
 * are matched by name (case-insensitive) and created on the fly when
 * `createMissing` is set — this is how a barn's first month lands with no manual
 * re-entry. Each row posts through {@link approveVendorBill}.
 */
export async function importVendorBills(
  ctx: ServiceContext,
  csvText: string,
  mapping: VendorBillMapping,
  opts: { createMissing?: boolean } = {},
): Promise<ImportResult> {
  const createMissing = opts.createMissing ?? true;
  const { rows } = parseCsv(csvText);

  const vendors = await nameIndex(ctx, "VENDOR");
  const horses = await horseIndex(ctx);
  const categories = await categoryIndex(ctx);

  const errors: ImportResult["errors"] = [];
  let imported = 0;
  let total = 0n as Cents;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    try {
      const vendorName = row[mapping.vendor]?.trim();
      const amountRaw = row[mapping.amount]?.trim();
      const dateRaw = row[mapping.date]?.trim();
      if (!vendorName) throw new Error("Missing vendor");
      if (!amountRaw) throw new Error("Missing amount");

      const amount = toCents(amountRaw.replace(/[$,]/g, ""));
      if (amount <= 0n) throw new Error(`Non-positive amount "${amountRaw}"`);
      const billDate = dateRaw ? new Date(dateRaw) : new Date();
      if (Number.isNaN(billDate.getTime())) throw new Error(`Bad date "${dateRaw}"`);

      const vendorPartyId = await resolveName(ctx, vendors, vendorName, (name) =>
        createMissing ? createParty(ctx, "VENDOR", name) : null,
      );
      if (!vendorPartyId) throw new Error(`Unknown vendor "${vendorName}"`);

      let horseId: string | undefined;
      const horseName = mapping.horse ? row[mapping.horse]?.trim() : "";
      if (horseName) {
        horseId =
          (await resolveName(ctx, horses, horseName, (name) =>
            createMissing ? createHorse(ctx, name) : null,
          )) ?? undefined;
      }

      let categoryId: string | undefined;
      const categoryName = mapping.category ? row[mapping.category]?.trim() : "";
      if (categoryName) {
        categoryId =
          (await resolveName(ctx, categories, categoryName, (name) =>
            createMissing ? createCategory(ctx, name) : null,
          )) ?? undefined;
      }

      await approveVendorBill(ctx, {
        vendorPartyId,
        amount,
        billDate,
        ...(horseId ? { horseId } : {}),
        ...(categoryId ? { categoryId } : {}),
        description: mapping.description ? (row[mapping.description] ?? "Services") : "Services",
      });
      imported++;
      total = (total + amount) as Cents;
    } catch (err) {
      errors.push({ row: i + 2, message: err instanceof Error ? err.message : String(err) });
    }
  }

  return { imported, errors, total };
}

type Index = Map<string, string>; // lowercased name -> id

async function nameIndex(ctx: ServiceContext, type: "VENDOR"): Promise<Index> {
  const parties = await ctx.prisma.party.findMany({
    where: { orgId: ctx.orgId, type },
    select: { id: true, name: true },
  });
  return new Map(parties.map((p) => [p.name.toLowerCase(), p.id]));
}
async function horseIndex(ctx: ServiceContext): Promise<Index> {
  const horses = await ctx.prisma.horse.findMany({
    where: { orgId: ctx.orgId },
    select: { id: true, name: true },
  });
  return new Map(horses.map((h) => [h.name.toLowerCase(), h.id]));
}
async function categoryIndex(ctx: ServiceContext): Promise<Index> {
  const cats = await ctx.prisma.category.findMany({
    where: { orgId: ctx.orgId },
    select: { id: true, name: true },
  });
  return new Map(cats.map((c) => [c.name.toLowerCase(), c.id]));
}

async function resolveName(
  _ctx: ServiceContext,
  index: Index,
  name: string,
  create: (name: string) => Promise<string> | null,
): Promise<string | null> {
  const key = name.toLowerCase();
  const existing = index.get(key);
  if (existing) return existing;
  const created = create(name);
  if (!created) return null;
  const id = await created;
  index.set(key, id);
  return id;
}

async function createParty(ctx: ServiceContext, type: "VENDOR", name: string): Promise<string> {
  const p = await ctx.prisma.party.create({ data: { orgId: ctx.orgId, type, name } });
  return p.id;
}
async function createHorse(ctx: ServiceContext, name: string): Promise<string> {
  const h = await ctx.prisma.horse.create({ data: { orgId: ctx.orgId, name } });
  return h.id;
}
async function createCategory(ctx: ServiceContext, name: string): Promise<string> {
  const c = await ctx.prisma.category.create({ data: { orgId: ctx.orgId, name } });
  return c.id;
}
