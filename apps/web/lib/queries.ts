import "server-only";
import { prisma } from "./db";

/** id → display name for every party in an org. */
export async function partyNames(orgId: string): Promise<Map<string, string>> {
  const parties = await prisma.party.findMany({
    where: { orgId },
    select: { id: true, name: true },
  });
  return new Map(parties.map((p) => [p.id, p.name]));
}

/** id → display name for every horse in an org. */
export async function horseNames(orgId: string): Promise<Map<string, string>> {
  const horses = await prisma.horse.findMany({
    where: { orgId },
    select: { id: true, name: true },
  });
  return new Map(horses.map((h) => [h.id, h.name]));
}
