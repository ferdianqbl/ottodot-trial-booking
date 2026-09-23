import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient, type Prisma } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  const adapter = new PrismaBetterSqlite3({
    url: process.env.DATABASE_URL ?? "file:./dev.db",
    // SQLite busy timeout: how long to wait for another process's write lock.
    timeout: 10_000,
  });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/** The client a repository runs on: the root client, or a transaction client inside `writeTransaction`. */
export type TPrisma = PrismaClient | Prisma.TransactionClient;
export type TPrismaClient = PrismaClient;

export default prisma;
