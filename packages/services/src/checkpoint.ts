import { NORMAL_SIDE, type AccountKind, type Cents, type Dimensions } from "@tote/core";
import type { ServiceContext } from "./context.js";

/**
 * Create a balance checkpoint: snapshot summed debits/credits per
 * (account, dimension) for everything posted so far, boundaried by insertion
 * time (`createdAt`) so back-dated entries can never fall through a gap. This is
 * a pure performance aid — `balanceOf` still equals checkpoint + replay of lines
 * posted after it, and a checkpoint can always be rebuilt from the ledger.
 */
export async function createCheckpoint(ctx: ServiceContext): Promise<{ checkpointId: string; groups: number }> {
  const boundary = new Date();
  const groups = await ctx.prisma.journalLine.groupBy({
    by: ["accountKind", "partyId", "horseId", "categoryId"],
    where: {
      orgId: ctx.orgId,
      legalEntityId: ctx.legalEntityId,
      entry: { createdAt: { lte: boundary } },
    },
    _sum: { debit: true, credit: true },
  });

  const checkpoint = await ctx.prisma.ledgerCheckpoint.create({
    data: { orgId: ctx.orgId, legalEntityId: ctx.legalEntityId, throughDate: boundary },
  });
  if (groups.length > 0) {
    await ctx.prisma.checkpointBalance.createMany({
      data: groups.map((g) => ({
        checkpointId: checkpoint.id,
        accountKind: g.accountKind,
        partyId: g.partyId,
        horseId: g.horseId,
        categoryId: g.categoryId,
        debit: g._sum.debit ?? 0n,
        credit: g._sum.credit ?? 0n,
      })),
    });
  }
  return { checkpointId: checkpoint.id, groups: groups.length };
}

/**
 * Derived balance accelerated by the latest checkpoint: the checkpoint's summed
 * rows for the account/dimension plus a replay of only the lines posted after
 * it. Equals {@link @tote/core!Ledger.balanceOf} exactly, but scans far fewer
 * rows on a multi-year book.
 */
export async function balanceOfAt(
  ctx: ServiceContext,
  accountKind: AccountKind,
  dimensions: Dimensions = {},
): Promise<Cents> {
  const dimFilter = {
    ...(dimensions.partyId !== undefined ? { partyId: dimensions.partyId } : {}),
    ...(dimensions.horseId !== undefined ? { horseId: dimensions.horseId } : {}),
    ...(dimensions.categoryId !== undefined ? { categoryId: dimensions.categoryId } : {}),
  };

  const checkpoint = await ctx.prisma.ledgerCheckpoint.findFirst({
    where: { orgId: ctx.orgId, legalEntityId: ctx.legalEntityId },
    orderBy: { throughDate: "desc" },
  });

  let debit = 0n;
  let credit = 0n;

  if (checkpoint) {
    const snap = await ctx.prisma.checkpointBalance.findMany({
      where: { checkpointId: checkpoint.id, accountKind, ...dimFilter },
    });
    for (const s of snap) {
      debit += s.debit;
      credit += s.credit;
    }
  }

  const lines = await ctx.prisma.journalLine.findMany({
    where: {
      orgId: ctx.orgId,
      legalEntityId: ctx.legalEntityId,
      accountKind,
      ...dimFilter,
      ...(checkpoint ? { entry: { createdAt: { gt: checkpoint.throughDate } } } : {}),
    },
    select: { debit: true, credit: true },
  });
  for (const l of lines) {
    debit += l.debit;
    credit += l.credit;
  }

  return (NORMAL_SIDE[accountKind] === "DEBIT" ? debit - credit : credit - debit) as Cents;
}
