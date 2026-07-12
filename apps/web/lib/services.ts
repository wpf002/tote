import "server-only";
import type { ServiceContext } from "@tote/services";
import { getTenant } from "./tenant";
import { getCurrentUser, getSelectedEntityId } from "./auth";
import { prisma } from "./db";

/** Build a tenant-scoped ServiceContext for the active session. */
export async function getServiceContext(): Promise<ServiceContext> {
  const { orgId, legalEntityId } = await getTenant();
  return { prisma, orgId, legalEntityId };
}

/**
 * Like {@link getServiceContext} but returns null instead of redirecting —
 * for API route handlers, where a redirect would be the wrong response.
 */
export async function getServiceContextForApi(): Promise<ServiceContext | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const selected = getSelectedEntityId();
  const entityId =
    selected ??
    (await prisma.legalEntity.findFirst({ where: { orgId: user.orgId }, orderBy: { name: "asc" } }))?.id;
  if (!entityId) return null;
  return { prisma, orgId: user.orgId, legalEntityId: entityId };
}
