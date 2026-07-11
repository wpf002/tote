import type { Cents } from "../money/cents.js";
import { ZERO } from "../money/cents.js";
import { sum } from "../money/money.js";
import type { JournalLineInput } from "../ledger/types.js";

/**
 * Canonical posting templates. Each is a pure function that produces a balanced
 * set of journal lines ready for `Ledger.postEntry` — the single place the
 * accounting meaning of an event lives. Every template has a golden test
 * asserting it balances and produces the expected debits/credits.
 *
 * Nothing here touches a database; templates describe *what* to post, the ledger
 * decides *how* to persist it.
 */
export interface DraftEntry {
  readonly memo: string;
  readonly lines: JournalLineInput[];
}

/** Vendor bill approved: `Dr OPERATING_EXPENSE (category, horse) / Cr ACCOUNTS_PAYABLE (vendor)`. */
export function vendorBillApproved(input: {
  vendorPartyId: string;
  amount: Cents;
  horseId?: string;
  categoryId?: string;
  memo?: string;
}): DraftEntry {
  return {
    memo: input.memo ?? "Vendor bill approved",
    lines: [
      {
        accountKind: "OPERATING_EXPENSE",
        debit: input.amount,
        ...(input.horseId ? { horseId: input.horseId } : {}),
        ...(input.categoryId ? { categoryId: input.categoryId } : {}),
      },
      { accountKind: "ACCOUNTS_PAYABLE", credit: input.amount, partyId: input.vendorPartyId },
    ],
  };
}

/** Pay a vendor: `Dr ACCOUNTS_PAYABLE (vendor) / Cr CASH`. */
export function payVendor(input: { vendorPartyId: string; amount: Cents; memo?: string }): DraftEntry {
  return {
    memo: input.memo ?? "Vendor payment",
    lines: [
      { accountKind: "ACCOUNTS_PAYABLE", debit: input.amount, partyId: input.vendorPartyId },
      { accountKind: "CASH", credit: input.amount },
    ],
  };
}

/** Training charge on an owner invoice: `Dr ACCOUNTS_RECEIVABLE (owner) / Cr OPERATING_INCOME (Training, horse)`. */
export function trainingCharge(input: {
  ownerPartyId: string;
  amount: Cents;
  horseId?: string;
  categoryId?: string;
  memo?: string;
}): DraftEntry {
  return {
    memo: input.memo ?? "Training charge",
    lines: [
      { accountKind: "ACCOUNTS_RECEIVABLE", debit: input.amount, partyId: input.ownerPartyId },
      {
        accountKind: "OPERATING_INCOME",
        credit: input.amount,
        ...(input.horseId ? { horseId: input.horseId } : {}),
        ...(input.categoryId ? { categoryId: input.categoryId } : {}),
      },
    ],
  };
}

/**
 * Passthrough of a cost to an owner with markup:
 * `Dr ACCOUNTS_RECEIVABLE (owner) / Cr OPERATING_EXPENSE (recover cost) + Cr OPERATING_INCOME (markup)`.
 */
export function passthroughWithMarkup(input: {
  ownerPartyId: string;
  recoverAmount: Cents;
  markupAmount: Cents;
  horseId?: string;
  categoryId?: string;
  memo?: string;
}): DraftEntry {
  const total = sum([input.recoverAmount, input.markupAmount]);
  const dims = {
    ...(input.horseId ? { horseId: input.horseId } : {}),
    ...(input.categoryId ? { categoryId: input.categoryId } : {}),
  };
  const lines: JournalLineInput[] = [
    { accountKind: "ACCOUNTS_RECEIVABLE", debit: total, partyId: input.ownerPartyId },
    { accountKind: "OPERATING_EXPENSE", credit: input.recoverAmount, ...dims },
  ];
  if (input.markupAmount !== ZERO) {
    lines.push({ accountKind: "OPERATING_INCOME", credit: input.markupAmount, ...dims });
  }
  return { memo: input.memo ?? "Passthrough + markup", lines };
}

/** Owner payment received: `Dr CASH / Cr ACCOUNTS_RECEIVABLE (owner)`. */
export function ownerPaymentIn(input: { ownerPartyId: string; amount: Cents; memo?: string }): DraftEntry {
  return {
    memo: input.memo ?? "Owner payment",
    lines: [
      { accountKind: "CASH", debit: input.amount },
      { accountKind: "ACCOUNTS_RECEIVABLE", credit: input.amount, partyId: input.ownerPartyId },
    ],
  };
}

/**
 * Purse received: `Dr CASH / Cr OWNER_PURSE_PAYABLE (per partner) + Cr PURSE_REVENUE (trainer cut)`.
 * Partner allocations must already be split (see the disbursement engine).
 */
export function purseReceived(input: {
  partners: ReadonlyArray<{ partyId: string; amount: Cents }>;
  trainerCut?: Cents;
  horseId?: string;
  memo?: string;
}): DraftEntry {
  const trainerCut = input.trainerCut ?? ZERO;
  const partnerTotal = sum(input.partners.map((p) => p.amount));
  const cash = sum([partnerTotal, trainerCut]);

  const lines: JournalLineInput[] = [
    { accountKind: "CASH", debit: cash, ...(input.horseId ? { horseId: input.horseId } : {}) },
    ...input.partners.map((p) => ({
      accountKind: "OWNER_PURSE_PAYABLE" as const,
      credit: p.amount,
      partyId: p.partyId,
    })),
  ];
  if (trainerCut !== ZERO) {
    lines.push({
      accountKind: "PURSE_REVENUE",
      credit: trainerCut,
      ...(input.horseId ? { horseId: input.horseId } : {}),
    });
  }
  return { memo: input.memo ?? "Purse received", lines };
}

/** Disburse a partner's purse payable in cash: `Dr OWNER_PURSE_PAYABLE (partner) / Cr CASH`. */
export function purseDisbursed(input: { partyId: string; amount: Cents; memo?: string }): DraftEntry {
  return {
    memo: input.memo ?? "Purse disbursed",
    lines: [
      { accountKind: "OWNER_PURSE_PAYABLE", debit: input.amount, partyId: input.partyId },
      { accountKind: "CASH", credit: input.amount },
    ],
  };
}

/** Apply a partner's purse credit against their invoice: `Dr OWNER_PURSE_PAYABLE / Cr ACCOUNTS_RECEIVABLE`. */
export function purseCreditedToInvoice(input: {
  partyId: string;
  amount: Cents;
  memo?: string;
}): DraftEntry {
  return {
    memo: input.memo ?? "Purse credited to invoice",
    lines: [
      { accountKind: "OWNER_PURSE_PAYABLE", debit: input.amount, partyId: input.partyId },
      { accountKind: "ACCOUNTS_RECEIVABLE", credit: input.amount, partyId: input.partyId },
    ],
  };
}
