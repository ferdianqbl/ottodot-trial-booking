import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Every run uses a fresh SQLite file in the OS temp dir (created by global-setup, removed afterwards),
// so tests never touch dev.db and never need a destructive reset.
const testDatabasePath = path.join(os.tmpdir(), `ottodot-test-${process.pid}.db`);
process.env.TEST_DATABASE_PATH = testDatabasePath;

export default defineConfig({
  test: {
    env: { DATABASE_URL: `file:${testDatabasePath}` },
    globalSetup: ["./src/test/global-setup.ts"],
    // All files share one database file, so run them one at a time.
    fileParallelism: false,
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
