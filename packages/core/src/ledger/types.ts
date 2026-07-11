import type { Cents } from "../money/cents.js";

/**
 * Chart-of-accounts kinds used by the posting engine. This is the minimal set
 * the Phase 0/1/2 posting templates need; more kinds are added as later phases
 * pull for them. Each kind has a fixed normal balance side (see {@link NORMAL_SIDE}).
 */
export type AccountKind =
  | "CASH"
  | "ACCOUNTS_RECEIVABLE"
  | "ACCOUNTS_PAYABLE"
  | "OPERATING_EXPENSE"
  | "OPERATING_INCOME"
  | "OWNER_PURSE_PAYABLE"
  | "PURSE_REVENUE"
  | "WAGES_PAYABLE"
  | "HORSE_ASSET"
  | "OWNER_DEPOSITS"
  | "OWNER_EQUITY";

export type NormalSide = "DEBIT" | "CREDIT";

/** The side on which each account kind carries a positive balance. */
export const NORMAL_SIDE: Readonly<Record<AccountKind, NormalSide>> = {
  CASH: "DEBIT",
  ACCOUNTS_RECEIVABLE: "DEBIT",
  OPERATING_EXPENSE: "DEBIT",
  HORSE_ASSET: "DEBIT",
  ACCOUNTS_PAYABLE: "CREDIT",
  OPERATING_INCOME: "CREDIT",
  OWNER_PURSE_PAYABLE: "CREDIT",
  PURSE_REVENUE: "CREDIT",
  WAGES_PAYABLE: "CREDIT",
  OWNER_DEPOSITS: "CREDIT",
  OWNER_EQUITY: "CREDIT",
};

/** Dimensions a line can be tagged with, for dimensional balance queries. */
export interface Dimensions {
  readonly partyId?: string;
  readonly horseId?: string;
  readonly categoryId?: string;
}

/** A single debit or credit within a journal entry. Exactly one side is set. */
export interface JournalLineInput extends Dimensions {
  readonly accountKind: AccountKind;
  readonly debit?: Cents;
  readonly credit?: Cents;
}

/** Header fields for a journal entry. Tenant fields are stamped by the ledger. */
export interface JournalEntryInput {
  readonly date: Date;
  readonly memo?: string;
  /** Set by {@link Ledger.reverseEntry}; do not set directly. */
  readonly reversalOf?: string;
}

/** An immutable, posted journal line. */
export interface PostedLine extends Dimensions {
  readonly id: string;
  readonly entryId: string;
  readonly orgId: string;
  readonly legalEntityId: string;
  readonly accountKind: AccountKind;
  readonly debit: Cents;
  readonly credit: Cents;
}

/** An immutable, posted journal entry. Corrections post a reversal — never edit. */
export interface PostedEntry {
  readonly id: string;
  readonly orgId: string;
  readonly legalEntityId: string;
  readonly date: Date;
  readonly memo: string | null;
  readonly reversalOf: string | null;
  readonly lines: ReadonlyArray<PostedLine>;
}

/** Tenant context every ledger operation is bound to. */
export interface TenantContext {
  readonly orgId: string;
  readonly legalEntityId: string;
}
