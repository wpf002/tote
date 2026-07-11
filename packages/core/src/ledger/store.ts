import type { AccountKind, PostedEntry, PostedLine } from "./types.js";

/**
 * Append-only storage the posting engine writes through. The interface exposes
 * no update or delete — invariant #3, the ledger is immutable. The in-memory
 * implementation below and a Postgres-backed one (`@tote/db`) both satisfy it.
 *
 * Reads and writes are async so a real database drops in unchanged. All reads
 * are tenant-scoped; a store must never let a query see lines outside the given
 * (orgId, legalEntityId). Id generation stays synchronous — it never needs a
 * round trip.
 */
export interface LedgerStore {
  /** Persist a fully-formed entry and its lines atomically. */
  append(entry: PostedEntry): Promise<void>;
  /** Fetch one entry within a tenant, or undefined if not visible to it. */
  getEntry(scope: TenantScope, entryId: string): Promise<PostedEntry | undefined>;
  /** All lines matching the scope + optional account/dimension filter. */
  queryLines(scope: TenantScope, filter: LineFilter): Promise<PostedLine[]>;
  /** A fresh id for a new entry/line. */
  nextId(prefix: string): string;
}

export interface TenantScope {
  readonly orgId: string;
  readonly legalEntityId: string;
}

export interface LineFilter {
  readonly accountKind?: AccountKind;
  readonly partyId?: string;
  readonly horseId?: string;
  readonly categoryId?: string;
}

/** Reference in-memory store — used by tests and the property harness. */
export class InMemoryLedgerStore implements LedgerStore {
  private readonly entries = new Map<string, PostedEntry>();
  private readonly counters = new Map<string, number>();

  async append(entry: PostedEntry): Promise<void> {
    if (this.entries.has(entry.id)) {
      throw new Error(`Entry ${entry.id} already exists; the ledger is append-only`);
    }
    this.entries.set(entry.id, entry);
  }

  async getEntry(scope: TenantScope, entryId: string): Promise<PostedEntry | undefined> {
    const entry = this.entries.get(entryId);
    if (!entry) return undefined;
    if (entry.orgId !== scope.orgId || entry.legalEntityId !== scope.legalEntityId) {
      return undefined;
    }
    return entry;
  }

  async queryLines(scope: TenantScope, filter: LineFilter): Promise<PostedLine[]> {
    const out: PostedLine[] = [];
    for (const entry of this.entries.values()) {
      if (entry.orgId !== scope.orgId || entry.legalEntityId !== scope.legalEntityId) continue;
      for (const line of entry.lines) {
        if (filter.accountKind !== undefined && line.accountKind !== filter.accountKind) continue;
        if (filter.partyId !== undefined && line.partyId !== filter.partyId) continue;
        if (filter.horseId !== undefined && line.horseId !== filter.horseId) continue;
        if (filter.categoryId !== undefined && line.categoryId !== filter.categoryId) continue;
        out.push(line);
      }
    }
    return out;
  }

  nextId(prefix: string): string {
    const next = (this.counters.get(prefix) ?? 0) + 1;
    this.counters.set(prefix, next);
    return `${prefix}_${next}`;
  }
}
