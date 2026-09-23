import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Point DATABASE_URL at a fresh SQLite file in the OS temp dir and apply the migrations.
 * Call this BEFORE importing anything that uses Prisma. Returns a cleanup function.
 */
export function createTempDatabase(name: string) {
  const file = path.join(os.tmpdir(), `ottodot-${name}-${process.pid}.db`);
  process.env.DATABASE_URL = `file:${file}`;
  execSync("npx prisma migrate deploy", { env: process.env, stdio: "pipe" });
  return () => {
    for (const suffix of ["", "-journal", "-wal", "-shm"]) rmSync(file + suffix, { force: true });
  };
}
