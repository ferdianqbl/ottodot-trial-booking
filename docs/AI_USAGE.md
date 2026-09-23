# AI Usage

## Which AI tools I used

**Claude Code (Claude Opus 5)** in the Claude desktop app, for the whole project: reading the brief, proposing designs, writing the code, tests, scripts and docs, running them, and clicking through the UI in its built-in browser.

## What I used it for

1. **Turning the brief into invariants** (≤ 4 confirmed, no duplicate, no roster entry without payment, one winner for the last seat) before any code.
2. **Laying out design options with tradeoffs** and asking me to decide: last-seat strategy, API style, UI scope, docs layout.
3. **Schema and migration**, including a partial unique index and hand-written `CHECK` constraints.
4. **Implementation:** the booking service (two-step checkout, authorize → atomic seat claim → capture/void), tRPC procedures with parent/staff identity, the mock gateway, and three pages.
5. **Design-system rebase:** I supplied the design system ([DESIGN.md](DESIGN.md)); Claude rebuilt the UI on shadcn/ui components and restyled each one to its tokens (cream canvas, ink-black actions, hairline borders, no shadows, one type family).
6. **Verification:** tests on a real SQLite database, a narrated demo script, a multi-process race script, deliberate "sabotage" runs, a production build, and a browser walkthrough of the two-tab race.
7. **Documentation:** README and the docs in this folder.

## One place where AI helped me move faster

**Database-level guarantees and proving them.** Claude checked that Prisma 7.10 can declare a partial unique index (preview `partialIndexes`) and confirmed the exact SQL Prisma generates before relying on it. It then added the `CHECK` constraints Prisma can't express to the migration, and wrote tests that write to the database directly, bypassing the app, to show those constraints hold. It also wrote a script that races 20 bookings from 4 separate OS processes. Doing the index research, the migration, the constraint tests and the multi-process harness by hand would have taken me most of an afternoon.

## Where I disagreed with, corrected, or rejected AI output

- **API style: I overruled the recommendation.** Claude recommended REST route handlers with server-rendered pages and dropping tRPC. I kept **tRPC**: it's my standard stack, it gives end-to-end types, and its procedure pattern maps cleanly onto "parent" vs "staff" access. The result is a tRPC-only API. Business-rule errors still map to proper HTTP statuses (409/403/404/412) with a machine-readable `domainCode`, and curl still works.
- **Docs: I overruled the recommendation.** Claude suggested consolidating the docs into three files. I kept all five (PRD, feature list, architecture, UI design, folder structure), each rewritten for this build.
- **A check that looked like it passed but proved nothing.** To show the tests catch real bugs, Claude broke the code on purpose (e.g. "capture every authorization, even for the loser") and re-ran the suite. One of those edits left a syntax error, so the run reported *no tests* rather than a failure. That's a result that proves nothing. It was redone correctly, and the test failed as it should. Since then I check that a failing test fails *for the right reason*.
- **Project structure: I overruled the recommendation.** Claude's first cut put the business logic and the Prisma calls together in one file per feature, arguing a slice this small doesn't need layers. I want the structure I hold every project to: vertical slices under `features/<slice>/server/` split `schema → repository → service → router`, an `api/v1` gateway, `providers/`, `components/{layout,shared,ui}`, `T`-prefixed types, and the `apiResponse` envelope on every reply. It paid off in a way worth recording: because a service is plain functions with no tRPC in sight, the race tests, the demo script and the multi-process race all call `pay()` directly, so the proof of the invariant doesn't depend on the transport.
- **A button with no label.** After the design-system rebase, every black button rendered blank. The class-merging helper didn't know the design system's `text-caption` was a *size*, took it for a text color, and dropped the button's white text. Typecheck, lint, build and tests were all green; only the browser walkthrough caught it. `cn` is now configured with the design tokens.
- **Lint caught an AI naming mistake:** a script helper named `useTempDatabase` read as a React hook to the linter. It's now `createTempDatabase`.

## What I'd change about my AI workflow next time

- **Put the repo under git from the first minute**, so every AI step is a reviewable diff. This workspace wasn't a git repo, so I relied on tarball snapshots before big changes.
- **Answer the design questions before any code.** Race strategy and API style decide most of the structure; settling them first avoids rework.
- **Ask for sabotage runs and a multi-process test up front.** Single-process tests can pass for the wrong reason, e.g. an in-process lock hiding a missing database guarantee.
- **Review hand-written SQL line by line.** Prisma can't validate the `CHECK` constraints it doesn't know about.

## How I verified the final implementation

1. `npm test`: **30 tests** on a throwaway SQLite database. They cover the brief's exact race sequence (A never touches the card), both parents paying at once (loser voided, never captured), 10 payers who all passed the pre-check (exactly one seat), double-click Pay (charged once), duplicates, declines and retries, ownership, staff-only rosters, HTTP status codes, and direct database writes that the constraints must reject. Every test also asserts the global invariants afterwards.
2. **Sabotage runs (`npm run test:sabotage`):** removes the capacity guard, the pre-charge check, the capture/void decision, the ownership check and the duplicate check, one at a time, and asserts the matching tests break. It is a script rather than a claim, so a reviewer can re-run it. With the capacity guard removed, the database `CHECK` still refuses the 5th seat.
3. `npm run test:multiprocess`: 4 OS processes race for the last seat, 3 rounds. Each round gives 1 confirmed, 19 cancelled, 0 errors, and exactly 1 capture.
4. `npm run demo`: every required scenario, narrated.
5. `npm run build`, `npm run lint`, `npm run typecheck`: all clean.
6. **Design-system audit in the browser:** a script over every rendered element on all three pages, asserting no colour outside the palette, no gradient, no box-shadow and no text under 14px, plus spot checks of the type scale, radii and focus rings against [DESIGN.md](DESIGN.md).
7. **Browser walkthrough** with two tabs acting as two parents: the brief's sequence (A cancelled, card not charged), a simultaneous payment with the slow-gateway option (loser "Voided (not charged)"), a decline followed by Try again, and the staff roster with its "not on the roster" reasons.
8. **Fresh clone on the lowest supported Node:** `npm ci && npm run verify` from a clean clone on Node 20 — which is how I found that the lockfile, generated by npm 11, would not install under npm 10.
9. **CI:** GitHub Actions runs `verify` and `test:sabotage` on Node 20 and 24 for every push.
