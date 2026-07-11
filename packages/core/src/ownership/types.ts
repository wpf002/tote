/**
 * A half-open effective-dated interval: active when `from <= date < to`.
 * `to === null` (or undefined) means open-ended.
 */
export interface Interval {
  readonly from: Date;
  readonly to?: Date | null;
}

/** A slice of a horse's ownership held by one party over a time window. */
export interface OwnershipInterval extends Interval {
  readonly horseId: string;
  readonly partyId: string;
  /** Share of the horse in basis points (out of 10000). */
  readonly basisPoints: number;
}

/** A member's share of a syndicate party over a time window. */
export interface MembershipInterval extends Interval {
  readonly syndicateId: string;
  readonly memberPartyId: string;
  /** Share of the syndicate in basis points (out of 10000). */
  readonly basisPoints: number;
}

/** The full effective-dated ownership graph for an org. */
export interface OwnershipGraph {
  readonly ownership: ReadonlyArray<OwnershipInterval>;
  readonly memberships: ReadonlyArray<MembershipInterval>;
  /** True if a party is a syndicate whose membership must be walked. */
  readonly isSyndicate: (partyId: string) => boolean;
}

/**
 * A leaf party's effective stake in a horse. `weight` values within a single
 * resolution share an implicit common denominator, so they are proportional and
 * can be fed directly to `splitCents`. `basisPoints` is the same stake rounded
 * (largest-remainder) to sum to exactly 10000 for display.
 */
export interface EffectiveShare {
  readonly partyId: string;
  readonly weight: bigint;
  readonly basisPoints: number;
}
