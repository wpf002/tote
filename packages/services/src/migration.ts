import { cents, splitCents } from "@tote/core";
import { parseCsv } from "./import.js";
import type { ServiceContext } from "./context.js";

/**
 * Full-catalog migration — the go-to-market wedge. Import a barn's entire back
 * catalog (ownership roster, training rates) from its existing spreadsheet with
 * no manual re-entry, forgiving of the messy real-world data those exports
 * carry: any percent format, rounding that doesn't quite sum to 100, missing
 * horses/owners created on the fly. Ownership always normalizes to exactly
 * 10000 bp (penny-exact, invariant #5).
 */

const DEFAULT_FROM = new Date("2020-01-01T00:00:00Z");

/** Column mapping for a horse/owner/share roster (long format, one row per stake). */
export interface OwnershipMapping {
  horse: string;
  owner: string;
  share: string;
}

/** Column mapping for a per-horse training rate. */
export interface TrainingRateMapping {
  horse: string;
  dailyRate: string;
}

/** Column presets for common exports. Adjust to a specific barn's headers as needed. */
export const IMPORT_PRESETS = {
  ownership: {
    generic: { horse: "Horse", owner: "Owner", share: "Percent" },
    horsebills: { horse: "Horse", owner: "Owner", share: "Ownership %" },
    quickbooks: { horse: "Class", owner: "Customer", share: "Percentage" },
  },
  trainingRate: {
    generic: { horse: "Horse", dailyRate: "Daily Rate" },
    horsebills: { horse: "Horse", dailyRate: "Day Rate" },
  },
} as const;

const SYNDICATE_RE = /syndicate|partners|partnership|stable|racing llc|racing group|group$/i;

function classifyParty(name: string): "INDIVIDUAL" | "SYNDICATE" {
  return SYNDICATE_RE.test(name) ? "SYNDICATE" : "INDIVIDUAL";
}

function parseWeight(raw: string): number {
  // Accept "60", "60%", "0.6", "33.33%" — scale to integer hundredths so
  // largest-remainder can normalize any format to exactly 10000 bp.
  const n = Number(raw.replace(/[%\s,]/g, ""));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

export interface OwnershipImportResult {
  horsesCreated: number;
  ownersCreated: number;
  horsesImported: number;
  stakesCreated: number;
  errors: Array<{ horse: string; message: string }>;
  warnings: string[];
}

/**
 * Import an ownership roster. Rows are grouped by horse; each horse's owner
 * shares are normalized to 10000 bp (largest-remainder), so a spreadsheet with
 * `33.33 / 33.33 / 33.34` lands penny-exact. Missing horses and owners are
 * created; a horse that already has ownership is skipped (never clobbered).
 */
export async function importOwnershipRoster(
  ctx: ServiceContext,
  csvText: string,
  mapping: OwnershipMapping,
  opts: { createMissing?: boolean; effectiveDate?: Date } = {},
): Promise<OwnershipImportResult> {
  const createMissing = opts.createMissing ?? true;
  const from = opts.effectiveDate ?? DEFAULT_FROM;
  const { rows } = parseCsv(csvText);
  const { prisma, orgId } = ctx;

  // Group rows by horse.
  const byHorse = new Map<string, Array<{ owner: string; weight: number }>>();
  for (const row of rows) {
    const horse = (row[mapping.horse] ?? "").trim();
    const owner = (row[mapping.owner] ?? "").trim();
    if (!horse || !owner) continue;
    const weight = parseWeight(row[mapping.share] ?? "");
    const list = byHorse.get(horse) ?? [];
    list.push({ owner, weight });
    byHorse.set(horse, list);
  }

  const horseIndex = new Map(
    (await prisma.horse.findMany({ where: { orgId }, select: { id: true, name: true } })).map((h) => [
      h.name.toLowerCase(),
      h.id,
    ]),
  );
  const partyIndex = new Map(
    (await prisma.party.findMany({ where: { orgId }, select: { id: true, name: true } })).map((p) => [
      p.name.toLowerCase(),
      p.id,
    ]),
  );

  const result: OwnershipImportResult = {
    horsesCreated: 0,
    ownersCreated: 0,
    horsesImported: 0,
    stakesCreated: 0,
    errors: [],
    warnings: [],
  };

  for (const [horseName, stakes] of byHorse) {
    try {
      const valid = stakes.filter((s) => s.weight > 0);
      if (valid.length === 0) {
        result.errors.push({ horse: horseName, message: "No positive shares" });
        continue;
      }

      // Resolve / create the horse.
      let horseId = horseIndex.get(horseName.toLowerCase());
      if (!horseId) {
        if (!createMissing) {
          result.errors.push({ horse: horseName, message: "Unknown horse" });
          continue;
        }
        const created = await prisma.horse.create({ data: { orgId, name: horseName } });
        horseId = created.id;
        horseIndex.set(horseName.toLowerCase(), horseId);
        result.horsesCreated++;
      }

      // Don't clobber an existing roster.
      const existing = await prisma.ownership.count({ where: { orgId, horseId } });
      if (existing > 0) {
        result.warnings.push(`${horseName}: already has ownership — skipped`);
        continue;
      }

      // Normalize shares to exactly 10000 bp.
      const bps = splitCents(cents(10000n), valid.map((s) => s.weight)).map(Number);
      const rawSum = valid.reduce((a, s) => a + s.weight, 0) / 100;
      if (Math.abs(rawSum - 100) > 1) {
        result.warnings.push(
          `${horseName}: shares summed to ${rawSum.toFixed(1)}% — normalized to 100%`,
        );
      }

      for (let i = 0; i < valid.length; i++) {
        const ownerName = valid[i]!.owner;
        let partyId = partyIndex.get(ownerName.toLowerCase());
        if (!partyId) {
          const party = await prisma.party.create({
            data: { orgId, type: classifyParty(ownerName), name: ownerName },
          });
          partyId = party.id;
          partyIndex.set(ownerName.toLowerCase(), partyId);
          result.ownersCreated++;
        }
        await prisma.ownership.create({
          data: { orgId, horseId, partyId, basisPoints: bps[i]!, from },
        });
        result.stakesCreated++;
      }
      result.horsesImported++;
    } catch (err) {
      result.errors.push({
        horse: horseName,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}

export interface TrainingRateImportResult {
  imported: number;
  horsesCreated: number;
  errors: Array<{ row: number; message: string }>;
}

/** Import per-horse training rates (dollars/day → cents). Creates missing horses. */
export async function importTrainingRates(
  ctx: ServiceContext,
  csvText: string,
  mapping: TrainingRateMapping,
  opts: { createMissing?: boolean; effectiveDate?: Date } = {},
): Promise<TrainingRateImportResult> {
  const createMissing = opts.createMissing ?? true;
  const from = opts.effectiveDate ?? DEFAULT_FROM;
  const { rows } = parseCsv(csvText);
  const { prisma, orgId } = ctx;

  const horseIndex = new Map(
    (await prisma.horse.findMany({ where: { orgId }, select: { id: true, name: true } })).map((h) => [
      h.name.toLowerCase(),
      h.id,
    ]),
  );

  const result: TrainingRateImportResult = { imported: 0, horsesCreated: 0, errors: [] };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    try {
      const horseName = (row[mapping.horse] ?? "").trim();
      const rateRaw = (row[mapping.dailyRate] ?? "").replace(/[$,\s]/g, "");
      if (!horseName) throw new Error("Missing horse");
      const dollars = Number(rateRaw);
      if (!Number.isFinite(dollars) || dollars <= 0) throw new Error(`Bad rate "${rateRaw}"`);

      let horseId = horseIndex.get(horseName.toLowerCase());
      if (!horseId) {
        if (!createMissing) throw new Error(`Unknown horse "${horseName}"`);
        const created = await prisma.horse.create({ data: { orgId, name: horseName } });
        horseId = created.id;
        horseIndex.set(horseName.toLowerCase(), horseId);
        result.horsesCreated++;
      }

      await prisma.trainingRate.create({
        data: { orgId, horseId, dailyRateCents: BigInt(Math.round(dollars * 100)), from },
      });
      result.imported++;
    } catch (err) {
      result.errors.push({ row: i + 2, message: err instanceof Error ? err.message : String(err) });
    }
  }

  return result;
}

/* ---- saved import templates (per-barn column mappings) ---- */

export async function saveImportTemplate(
  ctx: ServiceContext,
  name: string,
  kind: string,
  mapping: Record<string, string>,
): Promise<{ id: string }> {
  const tpl = await ctx.prisma.importTemplate.create({
    data: { orgId: ctx.orgId, name, mapping: { kind, mapping } },
  });
  return { id: tpl.id };
}

export async function listImportTemplates(
  ctx: ServiceContext,
): Promise<Array<{ id: string; name: string; kind: string; mapping: Record<string, string> }>> {
  const rows = await ctx.prisma.importTemplate.findMany({
    where: { orgId: ctx.orgId },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((r) => {
    const m = r.mapping as { kind?: string; mapping?: Record<string, string> };
    return { id: r.id, name: r.name, kind: m.kind ?? "unknown", mapping: m.mapping ?? {} };
  });
}
