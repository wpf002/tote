import type { Cents } from "../money/cents.js";
import { splitByOwnership } from "../ownership/resolver.js";
import type { OwnershipGraph } from "../ownership/types.js";
import { purseReceived, type DraftEntry } from "./templates.js";

export interface PartnerAllocation {
  readonly partyId: string;
  readonly amount: Cents;
}

export interface DisbursementResult {
  /** Per-leaf-party split of the owner net, penny-exact and summing to it. */
  readonly allocations: PartnerAllocation[];
  /** The `purse received` posting for the ledger, including any trainer cut. */
  readonly draft: DraftEntry;
}

/**
 * The Phase 2 wedge: split a purse's owner-net across the parties that own the
 * horse as of the result date, walking nested syndicate membership down to leaf
 * parties. The split is penny-exact (largest-remainder over exact ownership
 * weights) and always sums to `ownerNet`.
 *
 * `trainerCut` is the entity's own cut, recorded as PURSE_REVENUE — it is not
 * part of the owner split.
 */
export function disburse(
  graph: OwnershipGraph,
  horseId: string,
  resultDate: Date,
  ownerNet: Cents,
  trainerCut?: Cents,
): DisbursementResult {
  const split = splitByOwnership(graph, horseId, resultDate, ownerNet);

  const allocations: PartnerAllocation[] = [...split.entries()].map(([partyId, amount]) => ({
    partyId,
    amount,
  }));

  const draft = purseReceived({
    partners: allocations,
    ...(trainerCut !== undefined ? { trainerCut } : {}),
    horseId,
    memo: "Purse received & disbursed to partners",
  });

  return { allocations, draft };
}
