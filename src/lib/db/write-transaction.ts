import { Prisma } from "@/generated/prisma/client";
import prisma from "./prisma";

const MAX_ATTEMPTS = 5;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The better-sqlite3 adapter reports SQLITE_BUSY as P1008 ("Operations timed out"). */
const isLockTimeout = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P1008";

export const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

/**
 * Every write goes through here, for two reasons:
 *
 * 1. The better-sqlite3 adapter keeps ONE connection per process. A statement issued outside
 *    `$transaction` runs on that connection even while another request's interactive transaction
 *    is open — so it joins that transaction and is rolled back with it.
 * 2. With several processes on one SQLite file, SQLite may answer a lock conflict with SQLITE_BUSY
 *    instead of waiting. A failed transaction has rolled back completely and our writes are
 *    compare-and-set, so it is safe to retry.
 *
 * Keep transactions write-first and short: never call the payment gateway inside one.
 */
export async function writeTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await prisma.$transaction(fn);
    } catch (error) {
      if (!isLockTimeout(error) || attempt >= MAX_ATTEMPTS) throw error;
      await sleep(10 * 2 ** attempt + Math.random() * 20);
    }
  }
}
