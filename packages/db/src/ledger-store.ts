import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type {
  AccountKind,
  Cents,
  LedgerStore,
  LineFilter,
  PostedEntry,
  PostedLine,
  TenantScope,
} from "@tote/core";

type PrismaLineRow = {
  id: string;
  entryId: string;
  orgId: string;
  legalEntityId: string;
  accountKind: string;
  debit: bigint;
  credit: bigint;
  partyId: string | null;
  horseId: string | null;
  categoryId: string | null;
};

type PrismaEntryRow = {
  id: string;
  orgId: string;
  legalEntityId: string;
  date: Date;
  memo: string | null;
  reversalOf: string | null;
  lines: PrismaLineRow[];
};

/**
 * Postgres-backed {@link LedgerStore}. Satisfies the exact same contract as the
 * in-memory store, so the `Ledger` posting engine — and every property test
 * that runs against it — is unchanged. Append-only: no update or delete paths.
 *
 * Reads are always filtered by (orgId, legalEntityId); there is no code path
 * that returns another tenant's rows (invariant #6).
 */
export class PrismaLedgerStore implements LedgerStore {
  constructor(private readonly prisma: PrismaClient) {}

  async append(entry: PostedEntry): Promise<void> {
    await this.prisma.journalEntry.create({
      data: {
        id: entry.id,
        orgId: entry.orgId,
        legalEntityId: entry.legalEntityId,
        date: entry.date,
        memo: entry.memo,
        reversalOf: entry.reversalOf,
        lines: {
          create: entry.lines.map((line) => ({
            id: line.id,
            orgId: line.orgId,
            legalEntityId: line.legalEntityId,
            accountKind: line.accountKind,
            debit: line.debit,
            credit: line.credit,
            partyId: line.partyId ?? null,
            horseId: line.horseId ?? null,
            categoryId: line.categoryId ?? null,
          })),
        },
      },
    });
  }

  async getEntry(scope: TenantScope, entryId: string): Promise<PostedEntry | undefined> {
    const row = (await this.prisma.journalEntry.findFirst({
      where: { id: entryId, orgId: scope.orgId, legalEntityId: scope.legalEntityId },
      include: { lines: true },
    })) as PrismaEntryRow | null;
    return row ? toPostedEntry(row) : undefined;
  }

  async queryLines(scope: TenantScope, filter: LineFilter): Promise<PostedLine[]> {
    const rows = (await this.prisma.journalLine.findMany({
      where: {
        orgId: scope.orgId,
        legalEntityId: scope.legalEntityId,
        ...(filter.accountKind ? { accountKind: filter.accountKind } : {}),
        ...(filter.partyId !== undefined ? { partyId: filter.partyId } : {}),
        ...(filter.horseId !== undefined ? { horseId: filter.horseId } : {}),
        ...(filter.categoryId !== undefined ? { categoryId: filter.categoryId } : {}),
      },
    })) as PrismaLineRow[];
    return rows.map(toPostedLine);
  }

  nextId(prefix: string): string {
    return `${prefix}_${randomUUID()}`;
  }
}

function toPostedLine(row: PrismaLineRow): PostedLine {
  const line: PostedLine = {
    id: row.id,
    entryId: row.entryId,
    orgId: row.orgId,
    legalEntityId: row.legalEntityId,
    accountKind: row.accountKind as AccountKind,
    debit: row.debit as Cents,
    credit: row.credit as Cents,
    ...(row.partyId !== null ? { partyId: row.partyId } : {}),
    ...(row.horseId !== null ? { horseId: row.horseId } : {}),
    ...(row.categoryId !== null ? { categoryId: row.categoryId } : {}),
  };
  return line;
}

function toPostedEntry(row: PrismaEntryRow): PostedEntry {
  return {
    id: row.id,
    orgId: row.orgId,
    legalEntityId: row.legalEntityId,
    date: row.date,
    memo: row.memo,
    reversalOf: row.reversalOf,
    lines: row.lines.map(toPostedLine),
  };
}
