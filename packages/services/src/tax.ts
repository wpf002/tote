import { splitCents, type Cents } from "@tote/core";
import type { ServiceContext } from "./context.js";

export type DepreciationMethod = "racehorse3" | "other7" | "section179";

/**
 * Derived depreciation schedule for a horse's cost basis (never stored).
 * `racehorse3`/`other7` use straight-line over 3/7 years (penny-exact via
 * largest remainder); `section179` expenses the whole basis in year one.
 */
export function depreciationSchedule(
  costCents: Cents,
  method: DepreciationMethod,
  placedInServiceYear: number,
): Array<{ year: number; amountCents: Cents }> {
  if (method === "section179") {
    return [{ year: placedInServiceYear, amountCents: costCents }];
  }
  const years = method === "racehorse3" ? 3 : 7;
  const parts = splitCents(costCents, Array.from({ length: years }, () => 1));
  return parts.map((amountCents, i) => ({ year: placedInServiceYear + i, amountCents }));
}

const yearRange = (taxYear: number) => ({
  start: new Date(Date.UTC(taxYear, 0, 1)),
  end: new Date(Date.UTC(taxYear + 1, 0, 1)),
});

/**
 * 1099-NEC data: total paid to each vendor/contractor in the tax year (ledger
 * `Dr Accounts Payable` = cash out to the vendor), filtered to the $600
 * reporting threshold.
 */
export async function generate1099(
  ctx: ServiceContext,
  taxYear: number,
  thresholdCents = 60000n,
): Promise<Array<{ vendorPartyId: string; name: string; amountCents: bigint }>> {
  const { start, end } = yearRange(taxYear);
  const lines = await ctx.prisma.journalLine.findMany({
    where: {
      orgId: ctx.orgId,
      legalEntityId: ctx.legalEntityId,
      accountKind: "ACCOUNTS_PAYABLE",
      partyId: { not: null },
      entry: { date: { gte: start, lt: end } },
    },
  });
  const paid = new Map<string, bigint>();
  for (const l of lines) {
    // A debit to AP is a payment out to the vendor.
    if (l.debit > 0n && l.partyId) paid.set(l.partyId, (paid.get(l.partyId) ?? 0n) + l.debit);
  }

  const parties = await ctx.prisma.party.findMany({
    where: { orgId: ctx.orgId, id: { in: [...paid.keys()] } },
    select: { id: true, name: true },
  });
  const name = new Map(parties.map((p) => [p.id, p.name]));

  return [...paid.entries()]
    .filter(([, amt]) => amt >= thresholdCents)
    .map(([vendorPartyId, amountCents]) => ({
      vendorPartyId,
      name: name.get(vendorPartyId) ?? vendorPartyId,
      amountCents,
    }))
    .sort((a, b) => Number(b.amountCents - a.amountCents));
}

/**
 * Year-end owner tax pack: the owner's billed charges (AR debits), purse income
 * (purse payable credits), and net for the year — the numbers behind their
 * Schedule and year-end statement.
 */
export async function ownerTaxPack(
  ctx: ServiceContext,
  taxYear: number,
  ownerPartyId: string,
): Promise<{ ownerPartyId: string; taxYear: number; chargesCents: bigint; purseIncomeCents: bigint; netCents: bigint }> {
  const { start, end } = yearRange(taxYear);
  const lines = await ctx.prisma.journalLine.findMany({
    where: {
      orgId: ctx.orgId,
      legalEntityId: ctx.legalEntityId,
      partyId: ownerPartyId,
      entry: { date: { gte: start, lt: end } },
    },
  });
  let charges = 0n;
  let purse = 0n;
  for (const l of lines) {
    if (l.accountKind === "ACCOUNTS_RECEIVABLE") charges += l.debit - l.credit;
    if (l.accountKind === "OWNER_PURSE_PAYABLE") purse += l.credit - l.debit;
  }
  return {
    ownerPartyId,
    taxYear,
    chargesCents: charges,
    purseIncomeCents: purse,
    netCents: purse - charges,
  };
}
