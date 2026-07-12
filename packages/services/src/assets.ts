import type { Cents } from "@tote/core";
import { ledgerFor, type ServiceContext } from "./context.js";

/** Capitalize a horse purchase: `Dr Horse Asset (cost basis) / Cr Cash`. */
export async function recordHorsePurchase(
  ctx: ServiceContext,
  input: { horseId: string; costCents: Cents; date: Date },
): Promise<{ transactionId: string; entryId: string }> {
  if (input.costCents <= 0n) throw new Error("Cost must be positive");
  const ledger = ledgerFor(ctx);
  const entry = await ledger.postEntry({ date: input.date, memo: "Horse purchase" }, [
    { accountKind: "HORSE_ASSET", debit: input.costCents, horseId: input.horseId },
    { accountKind: "CASH", credit: input.costCents },
  ]);
  const txn = await ctx.prisma.horseTransaction.create({
    data: {
      orgId: ctx.orgId,
      legalEntityId: ctx.legalEntityId,
      horseId: input.horseId,
      kind: "PURCHASE",
      amountCents: input.costCents,
      basisCents: input.costCents,
      date: input.date,
      journalEntryId: entry.id,
    },
  });
  return { transactionId: txn.id, entryId: entry.id };
}

/**
 * Sell a horse and post the gain or loss. Basis is the horse's current
 * `HORSE_ASSET` balance (derived). Gain: `Dr Cash / Cr Horse Asset (basis) +
 * Cr Operating Income (gain)`. Loss: `Dr Cash + Dr Operating Expense (loss) /
 * Cr Horse Asset (basis)`. Either way the asset is removed at basis.
 */
export async function recordHorseSale(
  ctx: ServiceContext,
  input: { horseId: string; saleCents: Cents; date: Date },
): Promise<{ transactionId: string; entryId: string; basisCents: Cents; gainCents: Cents }> {
  if (input.saleCents < 0n) throw new Error("Sale price cannot be negative");
  const ledger = ledgerFor(ctx);
  const basis = (await ledger.balanceOf("HORSE_ASSET", { horseId: input.horseId })) as bigint;
  const sale = input.saleCents as bigint;
  const gain = sale - basis;

  const lines =
    gain >= 0n
      ? [
          { accountKind: "CASH" as const, debit: input.saleCents },
          { accountKind: "HORSE_ASSET" as const, credit: basis as Cents, horseId: input.horseId },
          ...(gain > 0n
            ? [
                {
                  accountKind: "OPERATING_INCOME" as const,
                  credit: gain as Cents,
                  horseId: input.horseId,
                  categoryId: "gain-on-sale",
                },
              ]
            : []),
        ]
      : [
          { accountKind: "CASH" as const, debit: input.saleCents },
          {
            accountKind: "OPERATING_EXPENSE" as const,
            debit: -gain as Cents,
            horseId: input.horseId,
            categoryId: "loss-on-sale",
          },
          { accountKind: "HORSE_ASSET" as const, credit: basis as Cents, horseId: input.horseId },
        ];

  const entry = await ledger.postEntry({ date: input.date, memo: "Horse sale" }, lines);
  const txn = await ctx.prisma.horseTransaction.create({
    data: {
      orgId: ctx.orgId,
      legalEntityId: ctx.legalEntityId,
      horseId: input.horseId,
      kind: "SALE",
      amountCents: input.saleCents,
      basisCents: basis,
      date: input.date,
      journalEntryId: entry.id,
    },
  });
  return {
    transactionId: txn.id,
    entryId: entry.id,
    basisCents: basis as Cents,
    gainCents: gain as Cents,
  };
}
