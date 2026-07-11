import { PrismaClient } from "@prisma/client";

/**
 * Process-wide Prisma singleton. In dev with hot-reload, stash it on
 * globalThis so repeated imports don't exhaust the connection pool.
 */
const globalForPrisma = globalThis as unknown as { __totePrisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.__totePrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__totePrisma = prisma;
}

export { PrismaClient };
