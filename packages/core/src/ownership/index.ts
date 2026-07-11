export type {
  Interval,
  OwnershipInterval,
  MembershipInterval,
  OwnershipGraph,
  EffectiveShare,
} from "./types.js";
export {
  directOwners,
  resolveEffectiveOwnership,
  splitByOwnership,
} from "./resolver.js";
