import "server-only";
import type { ServiceContext } from "@tote/services";
import { getTenant } from "./tenant";
import { prisma } from "./db";

/** Build a tenant-scoped ServiceContext for the active session. */
export async function getServiceContext(): Promise<ServiceContext> {
  const { orgId, legalEntityId } = await getTenant();
  return { prisma, orgId, legalEntityId };
}
