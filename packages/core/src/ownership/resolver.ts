import { splitCents } from "../money/split.js";
import { cents } from "../money/cents.js";
import { BPS_SCALE } from "../money/money.js";
import type {
  EffectiveShare,
  Interval,
  MembershipInterval,
  OwnershipGraph,
  OwnershipInterval,
} from "./types.js";

const MAX_DEPTH = 16;

function activeOn<T extends Interval>(intervals: ReadonlyArray<T>, date: Date): T[] {
  const t = date.getTime();
  return intervals.filter((i) => i.from.getTime() <= t && (i.to == null || t < i.to.getTime()));
}

/** Direct owners of a horse on a date (before any syndicate resolution). */
export function directOwners(
  graph: OwnershipGraph,
  horseId: string,
  date: Date,
): Array<{ partyId: string; basisPoints: number }> {
  return activeOn(graph.ownership, date)
    .filter((o) => o.horseId === horseId)
    .map((o) => ({ partyId: o.partyId, basisPoints: o.basisPoints }));
}

/**
 * Resolve a horse's ownership on a date all the way down to leaf parties,
 * recursively walking syndicate membership. Nested shares are kept as exact
 * integer weights over a common denominator (10000^depth) so that no precision
 * is lost before the amount is split — a syndicate of 33.33% × 25% never gets
 * pre-rounded into a wrong penny.
 *
 * Throws on: ownership/membership that does not sum to 10000 bp on the date, a
 * syndicate with no active members, or a membership cycle.
 */
export function resolveEffectiveOwnership(
  graph: OwnershipGraph,
  horseId: string,
  date: Date,
): EffectiveShare[] {
  const owners = directOwners(graph, horseId, date);
  if (owners.length === 0) {
    throw new Error(`No active ownership for horse ${horseId} on ${date.toISOString()}`);
  }
  assertSumsTo10000(
    owners.map((o) => o.basisPoints),
    `ownership of horse ${horseId}`,
  );

  // Collect leaves as { partyId, numerator, depth } where the implicit
  // denominator is 10000^depth. Normalise to a shared denominator afterward.
  const leaves: Array<{ partyId: string; numerator: bigint; depth: number }> = [];
  let maxDepth = 0;

  const walk = (partyId: string, numerator: bigint, depth: number, path: ReadonlySet<string>) => {
    if (depth > MAX_DEPTH) {
      throw new Error(`Ownership resolution exceeded max depth at party ${partyId}`);
    }
    if (!graph.isSyndicate(partyId)) {
      leaves.push({ partyId, numerator, depth });
      if (depth > maxDepth) maxDepth = depth;
      return;
    }
    if (path.has(partyId)) {
      throw new Error(`Membership cycle detected at syndicate ${partyId}`);
    }
    const members = activeOn(graph.memberships, date).filter((m) => m.syndicateId === partyId);
    if (members.length === 0) {
      throw new Error(`Syndicate ${partyId} has no active members on ${date.toISOString()}`);
    }
    assertSumsTo10000(
      members.map((m) => m.basisPoints),
      `membership of syndicate ${partyId}`,
    );
    const nextPath = new Set(path).add(partyId);
    for (const m of members) {
      walk(m.memberPartyId, numerator * BigInt(m.basisPoints), depth + 1, nextPath);
    }
  };

  for (const owner of owners) {
    walk(owner.partyId, BigInt(owner.basisPoints), 1, new Set<string>());
  }

  // Lift every leaf to the common denominator 10000^maxDepth and aggregate
  // parties that were reached via more than one path.
  const byParty = new Map<string, bigint>();
  for (const leaf of leaves) {
    const weight = leaf.numerator * BPS_SCALE ** BigInt(maxDepth - leaf.depth);
    byParty.set(leaf.partyId, (byParty.get(leaf.partyId) ?? 0n) + weight);
  }

  const partyIds = [...byParty.keys()];
  const weights = partyIds.map((id) => byParty.get(id)!);

  // Largest-remainder split of 10000 bp gives an exact integer bp view.
  const bpsParts = splitCents(cents(BPS_SCALE), weights);

  return partyIds.map((partyId, i) => ({
    partyId,
    weight: weights[i]!,
    basisPoints: Number(bpsParts[i]!),
  }));
}

function assertSumsTo10000(basisPoints: number[], label: string): void {
  const total = basisPoints.reduce((a, b) => a + b, 0);
  if (total !== 10000) {
    throw new Error(`${label} must sum to 10000 bp, got ${total}`);
  }
}

/**
 * Convenience: resolve ownership and split an amount across leaf parties,
 * penny-exact. The keys of the returned map are leaf party ids.
 */
export function splitByOwnership(
  graph: OwnershipGraph,
  horseId: string,
  date: Date,
  amount: Parameters<typeof splitCents>[0],
): Map<string, ReturnType<typeof splitCents>[number]> {
  const shares = resolveEffectiveOwnership(graph, horseId, date);
  const parts = splitCents(
    amount,
    shares.map((s) => s.weight),
  );
  return new Map(shares.map((s, i) => [s.partyId, parts[i]!]));
}

export type { OwnershipInterval, MembershipInterval, OwnershipGraph, EffectiveShare, Interval };
