import "server-only";
import { redirect } from "next/navigation";
import { Ledger } from "@tote/core";
import { PrismaLedgerStore } from "@tote/db";
import { prisma } from "./db";
import { getCurrentUser, getSelectedEntityId, type SessionUser } from "./auth";

export interface Tenant {
  user: SessionUser;
  orgId: string;
  legalEntityId: string;
  legalEntities: Array<{ id: string; name: string; type: string }>;
}

/** Require an authenticated user or bounce to /login. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Resolve the active tenant context: the user's org and the selected legal
 * entity (cookie, defaulting to the first). Every scoped query and the ledger
 * derive from this — invariant #6.
 */
export async function getTenant(): Promise<Tenant> {
  const user = await requireUser();
  const legalEntities = await prisma.legalEntity.findMany({
    where: { orgId: user.orgId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, type: true },
  });
  if (legalEntities.length === 0) redirect("/login");

  const selected = getSelectedEntityId();
  const active =
    legalEntities.find((e) => e.id === selected) ?? legalEntities[0]!;

  return { user, orgId: user.orgId, legalEntityId: active.id, legalEntities };
}

/** A `Ledger` bound to the active tenant, over Postgres. */
export async function getLedger(): Promise<Ledger> {
  const { orgId, legalEntityId } = await getTenant();
  return new Ledger(new PrismaLedgerStore(prisma), { orgId, legalEntityId });
}
