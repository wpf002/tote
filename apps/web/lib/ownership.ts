import "server-only";
import type { OwnershipGraph } from "@tote/core";
import { prisma } from "./db";

/** Load the full effective-dated ownership graph for an org from Postgres. */
export async function loadOwnershipGraph(orgId: string): Promise<OwnershipGraph> {
  const [ownership, memberships, syndicates] = await Promise.all([
    prisma.ownership.findMany({ where: { orgId } }),
    prisma.syndicateMembership.findMany({ where: { orgId } }),
    prisma.party.findMany({ where: { orgId, type: "SYNDICATE" }, select: { id: true } }),
  ]);
  const synd = new Set(syndicates.map((s) => s.id));
  return {
    ownership: ownership.map((o) => ({
      horseId: o.horseId,
      partyId: o.partyId,
      basisPoints: o.basisPoints,
      from: o.from,
      to: o.to,
    })),
    memberships: memberships.map((m) => ({
      syndicateId: m.syndicateId,
      memberPartyId: m.memberPartyId,
      basisPoints: m.basisPoints,
      from: m.from,
      to: m.to,
    })),
    isSyndicate: (id) => synd.has(id),
  };
}
