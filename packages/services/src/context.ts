import type { PrismaClient } from "@prisma/client";
import { Ledger } from "@tote/core";
import { PrismaLedgerStore } from "@tote/db";

/** The tenant-scoped context every service call runs inside. */
export interface ServiceContext {
  readonly prisma: PrismaClient;
  readonly orgId: string;
  readonly legalEntityId: string;
}

/** A `Ledger` bound to the context's tenant. */
export function ledgerFor(ctx: ServiceContext): Ledger {
  return new Ledger(new PrismaLedgerStore(ctx.prisma), {
    orgId: ctx.orgId,
    legalEntityId: ctx.legalEntityId,
  });
}
