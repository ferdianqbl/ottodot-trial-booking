/**
 * npm run test:sabotage — proves the tests catch real bugs.
 *
 * A passing suite only means the tests didn't fail; it doesn't mean they would notice if a guard
 * disappeared. This script removes one guard at a time, runs the whole suite, and checks that the
 * tests that should break actually break. Each file is restored immediately afterwards, and the
 * script fails if any mutation slips through unnoticed or if a file is left modified.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

type TMutation = {
  name: string;
  /** What a reviewer should picture: the guard being removed. */
  removes: string;
  file: string;
  find: string;
  replace: string;
  /** Substrings of the test names that must fail once the guard is gone. */
  expectFailing: string[];
};

const HANDLERS = "src/features/booking/server/booking.handlers.ts";
const REPOSITORY = "src/features/booking/server/booking.repository.ts";

const MUTATIONS: TMutation[] = [
  {
    name: "M1 capacity guard",
    removes: "the `confirmedCount < capacity` condition on the seat claim, so the UPDATE always succeeds",
    file: REPOSITORY,
    find: "where: { id: trialClassId, confirmedCount: { lt: prisma.trialClass.fields.capacity } },",
    replace: "where: { id: trialClassId },",
    // Not the brief's sequence: there, A is refused by the pre-check before the claim is ever reached.
    expectFailing: ["both pay at the same moment", "the database decides", "double-clicking Pay"],
  },
  {
    name: "M2 pre-charge capacity check",
    removes: "the capacity re-check before the card is touched, so a doomed payment still authorizes",
    file: HANDLERS,
    find: "if (trialClass.confirmedCount >= trialClass.capacity) {",
    replace: "if (false) {",
    expectFailing: ["the brief's sequence"],
  },
  {
    name: "M3 capture/void decision",
    removes: "the branch that voids a loser's authorization, so every authorization is captured",
    file: HANDLERS,
    find: "      if (wonSeat) await paymentGateway.capture(auth.authorizationId);\n      else await paymentGateway.void(auth.authorizationId);",
    replace: "      await paymentGateway.capture(auth.authorizationId);",
    expectFailing: ["both pay at the same moment"],
  },
  {
    name: "M4 ownership check",
    removes: "the check that a parent may only book for their own children",
    file: HANDLERS,
    find: 'if (student.parentId !== parentId) throw new DomainError("FORBIDDEN", "You can only book for your own children.");',
    replace: "",
    expectFailing: ["ownership", "status codes"],
  },
  {
    name: "M5 duplicate check",
    removes: "the refusal to book a child who is already confirmed in the class",
    file: HANDLERS,
    find: "if (active?.status === \"confirmed\") throw duplicate();",
    replace: "",
    expectFailing: ["duplicate", "status codes"],
  },
];

/** Runs the suite and returns the names of the tests that failed. Vitest reports failures on stderr. */
function runSuite(): { failed: string[]; passed: boolean } {
  try {
    execFileSync("npx", ["vitest", "run", "--reporter=dot"], { encoding: "utf8", stdio: "pipe" });
    return { failed: [], passed: true };
  } catch (error) {
    const { stdout = "", stderr = "" } = error as { stdout?: string; stderr?: string };
    // "FAIL  path/to/file.test.ts > suite > test name"
    const failed = [...`${stdout}\n${stderr}`.matchAll(/^\s*FAIL\s+\S+\s+>\s+(.+)$/gm)].map((m) => m[1].trim());
    if (failed.length === 0) {
      throw new Error(`The suite failed but no test names could be read from its output:\n${stderr.slice(0, 600)}`);
    }
    return { failed, passed: false };
  }
}

const label = (text: string) => text.padEnd(28, ".");
let unnoticed = 0;

console.log("Sabotage run: remove one guard at a time and check the tests notice.\n");

for (const mutation of MUTATIONS) {
  const original = readFileSync(mutation.file, "utf8");
  if (!original.includes(mutation.find)) {
    throw new Error(`${mutation.name}: the code it patches has moved (${mutation.file}). Update scripts/sabotage.ts.`);
  }

  try {
    writeFileSync(mutation.file, original.replace(mutation.find, mutation.replace));
    const { failed } = runSuite();
    const missed = mutation.expectFailing.filter((needle) => !failed.some((name) => name.includes(needle)));

    console.log(`${label(mutation.name)} removes ${mutation.removes}`);
    if (failed.length === 0) {
      unnoticed++;
      console.log(`${label("")} ⚠️  NOT CAUGHT — every test still passed\n`);
    } else if (missed.length > 0) {
      unnoticed++;
      console.log(`${label("")} ⚠️  ${failed.length} test(s) failed, but not: ${missed.join(", ")}\n`);
    } else {
      console.log(`${label("")} caught by ${failed.length} test(s): ${failed.slice(0, 4).join(" · ")}\n`);
    }
  } finally {
    writeFileSync(mutation.file, original);
    if (readFileSync(mutation.file, "utf8") !== original) {
      throw new Error(`${mutation.file} was left modified — restore it from git before continuing.`);
    }
  }
}

const restored = runSuite();
console.log(restored.passed ? "Code restored: the suite is green again." : "Code restored, but the suite is RED — check your working tree.");

if (unnoticed > 0 || !restored.passed) {
  console.error(`\n${unnoticed} mutation(s) went unnoticed.`);
  process.exit(1);
}
console.log(`\nAll ${MUTATIONS.length} mutations were caught.`);
