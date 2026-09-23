import { execSync } from "node:child_process";
import { rmSync } from "node:fs";

/** Apply the migrations (including the hand-written CHECK constraints) to this run's temp database. */
export default function setup() {
  const databasePath = process.env.TEST_DATABASE_PATH!;
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: `file:${databasePath}` },
    stdio: "pipe",
  });
  return () => {
    for (const suffix of ["", "-journal", "-wal", "-shm"]) rmSync(databasePath + suffix, { force: true });
  };
}
