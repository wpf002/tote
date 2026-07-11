import { describe, it, expect } from "vitest";
import {
  cents,
  Ledger,
  InMemoryLedgerStore,
  vendorBillApproved,
  payVendor,
  trainingCharge,
  passthroughWithMarkup,
  ownerPaymentIn,
  purseReceived,
  purseDisbursed,
  purseCreditedToInvoice,
  type DraftEntry,
  type JournalLineInput,
} from "../src/index.js";

const DATE = new Date("2026-04-01T00:00:00Z");

function ledger() {
  return new Ledger(new InMemoryLedgerStore(), { orgId: "o", legalEntityId: "e" });
}

/** Golden invariant every template must satisfy: sum(debits) === sum(credits). */
function assertBalanced(draft: DraftEntry) {
  const total = (side: (l: JournalLineInput) => bigint | undefined) =>
    draft.lines.reduce((a, l) => a + (side(l) ?? 0n), 0n);
  expect(total((l) => l.debit)).toBe(total((l) => l.credit));
}

describe("posting templates — golden (each balances, invariant #4)", () => {
  it("vendorBillApproved: Dr expense / Cr AP", () => {
    const draft = vendorBillApproved({
      vendorPartyId: "v1",
      amount: cents(5000n),
      horseId: "h1",
      categoryId: "vet",
    });
    assertBalanced(draft);
    expect(draft.lines).toEqual([
      { accountKind: "OPERATING_EXPENSE", debit: 5000n, horseId: "h1", categoryId: "vet" },
      { accountKind: "ACCOUNTS_PAYABLE", credit: 5000n, partyId: "v1" },
    ]);
  });

  it("payVendor: Dr AP / Cr cash", () => {
    const draft = payVendor({ vendorPartyId: "v1", amount: cents(5000n) });
    assertBalanced(draft);
    expect(draft.lines.map((l) => l.accountKind)).toEqual(["ACCOUNTS_PAYABLE", "CASH"]);
  });

  it("trainingCharge: Dr AR / Cr income", () => {
    const draft = trainingCharge({ ownerPartyId: "o1", amount: cents(8000n), horseId: "h1" });
    assertBalanced(draft);
  });

  it("passthroughWithMarkup: Dr AR total / Cr expense recover + Cr income markup", () => {
    const draft = passthroughWithMarkup({
      ownerPartyId: "o1",
      recoverAmount: cents(5000n),
      markupAmount: cents(750n),
      horseId: "h1",
    });
    assertBalanced(draft);
    expect(draft.lines[0]).toMatchObject({ accountKind: "ACCOUNTS_RECEIVABLE", debit: 5750n });
    expect(draft.lines).toHaveLength(3);
  });

  it("passthroughWithMarkup: omits the income line when markup is zero", () => {
    const draft = passthroughWithMarkup({
      ownerPartyId: "o1",
      recoverAmount: cents(5000n),
      markupAmount: cents(0n),
    });
    assertBalanced(draft);
    expect(draft.lines).toHaveLength(2);
  });

  it("ownerPaymentIn: Dr cash / Cr AR", () => {
    assertBalanced(ownerPaymentIn({ ownerPartyId: "o1", amount: cents(3000n) }));
  });

  it("purseReceived: Dr cash / Cr per-partner payable + Cr trainer revenue", () => {
    const draft = purseReceived({
      partners: [
        { partyId: "p1", amount: cents(6000n) },
        { partyId: "p2", amount: cents(4000n) },
      ],
      trainerCut: cents(1000n),
      horseId: "h1",
    });
    assertBalanced(draft);
    expect(draft.lines[0]).toMatchObject({ accountKind: "CASH", debit: 11000n });
    expect(draft.lines.filter((l) => l.accountKind === "OWNER_PURSE_PAYABLE")).toHaveLength(2);
    expect(draft.lines.some((l) => l.accountKind === "PURSE_REVENUE")).toBe(true);
  });

  it("purseDisbursed / purseCreditedToInvoice both balance", () => {
    assertBalanced(purseDisbursed({ partyId: "p1", amount: cents(6000n) }));
    assertBalanced(purseCreditedToInvoice({ partyId: "p1", amount: cents(2000n) }));
  });
});

describe("end-to-end billing scenario reconciles to the penny", () => {
  it("vendor bill -> passthrough invoice -> owner pays leaves AR at zero", async () => {
    const l = ledger();
    // Vendor bills the barn $50 of vet for horse h1.
    const bill = vendorBillApproved({ vendorPartyId: "v1", amount: cents(5000n), horseId: "h1" });
    await l.postEntry({ date: DATE, memo: bill.memo }, bill.lines);

    // Barn passes it through to the owner with $7.50 markup.
    const invoice = passthroughWithMarkup({
      ownerPartyId: "o1",
      recoverAmount: cents(5000n),
      markupAmount: cents(750n),
      horseId: "h1",
    });
    await l.postEntry({ date: DATE, memo: invoice.memo }, invoice.lines);
    expect(await l.balanceOf("ACCOUNTS_RECEIVABLE", { partyId: "o1" })).toBe(5750n);

    // Owner pays in full.
    const pay = ownerPaymentIn({ ownerPartyId: "o1", amount: cents(5750n) });
    await l.postEntry({ date: DATE, memo: pay.memo }, pay.lines);

    expect(await l.balanceOf("ACCOUNTS_RECEIVABLE", { partyId: "o1" })).toBe(0n);
    // Expense fully recovered; markup recognised as income.
    expect(await l.balanceOf("OPERATING_EXPENSE", { horseId: "h1" })).toBe(0n);
    expect(await l.balanceOf("OPERATING_INCOME", { horseId: "h1" })).toBe(750n);
    // Cash up by the owner's payment; AP still owed to the vendor.
    expect(await l.balanceOf("CASH")).toBe(5750n);
    expect(await l.balanceOf("ACCOUNTS_PAYABLE", { partyId: "v1" })).toBe(5000n);
  });
});
