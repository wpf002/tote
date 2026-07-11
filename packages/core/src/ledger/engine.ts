import type { Cents } from "../money/cents.js";
import { ZERO } from "../money/cents.js";
import { sub } from "../money/money.js";
import type { LedgerStore, LineFilter, TenantScope } from "./store.js";
import {
  NORMAL_SIDE,
  type AccountKind,
  type Dimensions,
  type JournalEntryInput,
  type JournalLineInput,
  type PostedEntry,
  type PostedLine,
  type TenantContext,
} from "./types.js";

/**
 * The posting engine — the heart of the product. Every operation is bound to a
 * single (orgId, legalEntityId): invariant #6, tenant isolation is absolute, and
 * there is no API surface that can read or write across the boundary.
 *
 * Balances are never stored (invariant #2); `balanceOf` derives them by summing
 * ledger lines on every call. The store is append-only (invariant #3).
 */
export class Ledger {
  private readonly scope: TenantScope;

  constructor(
    private readonly store: LedgerStore,
    context: TenantContext,
  ) {
    this.scope = { orgId: context.orgId, legalEntityId: context.legalEntityId };
  }

  /**
   * Post a balanced journal entry atomically. Rejects unless
   * `sum(debits) === sum(credits)` (invariant #4) and every line carries exactly
   * one non-negative side. Returns the immutable posted entry.
   */
  postEntry(entry: JournalEntryInput, lines: ReadonlyArray<JournalLineInput>): PostedEntry {
    if (lines.length === 0) {
      throw new Error("A journal entry must have at least one line");
    }

    let debits = ZERO;
    let credits = ZERO;
    for (const line of lines) {
      const { debit, credit } = normalizeSides(line);
      debits = (debits + debit) as Cents;
      credits = (credits + credit) as Cents;
    }
    if (debits !== credits) {
      throw new Error(
        `Journal entry does not balance: debits ${debits} != credits ${credits}`,
      );
    }

    const entryId = this.store.nextId("je");
    const postedLines: PostedLine[] = lines.map((line) => {
      const { debit, credit } = normalizeSides(line);
      return {
        id: this.store.nextId("jl"),
        entryId,
        orgId: this.scope.orgId,
        legalEntityId: this.scope.legalEntityId,
        accountKind: line.accountKind,
        debit,
        credit,
        ...pickDimensions(line),
      };
    });

    const posted: PostedEntry = {
      id: entryId,
      orgId: this.scope.orgId,
      legalEntityId: this.scope.legalEntityId,
      date: entry.date,
      memo: entry.memo ?? null,
      reversalOf: entry.reversalOf ?? null,
      lines: postedLines,
    };

    this.store.append(posted);
    return posted;
  }

  /**
   * Derived, dimensional balance for an account kind. Returned in the account's
   * natural direction: a debit-normal kind reports `debits - credits`, a
   * credit-normal kind reports `credits - debits`. Optional dimensions filter
   * the lines (AND-combined); omitted dimensions aggregate across.
   */
  balanceOf(accountKind: AccountKind, dimensions: Dimensions = {}): Cents {
    const filter: LineFilter = { accountKind, ...pickDimensions(dimensions) };
    const lines = this.store.queryLines(this.scope, filter);

    let debits = ZERO;
    let credits = ZERO;
    for (const line of lines) {
      debits = (debits + line.debit) as Cents;
      credits = (credits + line.credit) as Cents;
    }
    return NORMAL_SIDE[accountKind] === "DEBIT" ? sub(debits, credits) : sub(credits, debits);
  }

  /**
   * Post the mirror of an existing entry (debits and credits swapped), returning
   * balances to their pre-entry state. Corrections are reversals — nothing is
   * edited or deleted. The original must belong to this tenant.
   */
  reverseEntry(entryId: string, reason: string): PostedEntry {
    const original = this.store.getEntry(this.scope, entryId);
    if (!original) {
      throw new Error(`Cannot reverse ${entryId}: not found in this tenant`);
    }

    const reversedLines: JournalLineInput[] = original.lines.map((line) => ({
      accountKind: line.accountKind,
      debit: line.credit,
      credit: line.debit,
      ...pickDimensions(line),
    }));

    return this.postEntry(
      { date: original.date, memo: reason, reversalOf: original.id },
      reversedLines,
    );
  }

  /**
   * Net position of a party: what we owe them on purses minus what they owe us
   * on invoices. Positive means Tote's books owe the party.
   */
  netPosition(partyId: string): Cents {
    const payable = this.balanceOf("OWNER_PURSE_PAYABLE", { partyId });
    const receivable = this.balanceOf("ACCOUNTS_RECEIVABLE", { partyId });
    return sub(payable, receivable);
  }
}

function normalizeSides(line: JournalLineInput): { debit: Cents; credit: Cents } {
  const debit = line.debit ?? ZERO;
  const credit = line.credit ?? ZERO;
  if (debit < 0n || credit < 0n) {
    throw new Error("Journal line amounts must be non-negative");
  }
  if (debit !== 0n && credit !== 0n) {
    throw new Error("A journal line cannot be both a debit and a credit");
  }
  return { debit, credit };
}

function pickDimensions(source: Dimensions): Dimensions {
  const out: { partyId?: string; horseId?: string; categoryId?: string } = {};
  if (source.partyId !== undefined) out.partyId = source.partyId;
  if (source.horseId !== undefined) out.horseId = source.horseId;
  if (source.categoryId !== undefined) out.categoryId = source.categoryId;
  return out;
}
