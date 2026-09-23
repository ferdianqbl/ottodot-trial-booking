# Ottodot — Trial Booking

[![verify](https://github.com/ferdianqbl/ottodot-trial-booking/actions/workflows/verify.yml/badge.svg)](https://github.com/ferdianqbl/ottodot-trial-booking/actions/workflows/verify.yml)

A small, working slice of trial-class booking for Ottodot's live online science and math classes. A parent picks a child and a trial class, pays with a mock card, and sees the booking status. Staff see an accurate roster. Every class is capped at **4 students**.

The design is built around four invariants:

| Invariant | Enforced by |
|---|---|
| A class never has more than 4 confirmed students | an atomic conditional `UPDATE` on the class, plus a database `CHECK (confirmedCount <= capacity)` |
| A child is never booked twice into the same class | a partial unique index: one *active* booking per child per class |
| A failed payment never puts a child on the roster | the booking only becomes `confirmed` in the same transaction that claims a seat after an approved card |
| When two parents race for the last seat, at most one gets it, and the other is never charged | cards are only *authorized* until the seat is won; the winner is captured, everyone else voided |

Stack: Next.js 16 · tRPC 11 · Prisma 7 · SQLite (`better-sqlite3`) · Vitest · Tailwind 4 · shadcn/ui (Radix), restyled to the [design system](docs/DESIGN.md).
More detail: [docs/](docs/). How AI was used: [docs/AI_USAGE.md](docs/AI_USAGE.md).

**Walkthrough video (5–8 min):** ✏️ _add the Loom / YouTube link before submitting._

---

## How to run

Node 20.9+ (`.nvmrc` pins 20; CI runs 20 and 24). No Docker, no database server, no secrets.

```bash
npm install          # also generates the Prisma client
npm run setup        # create dev.db from the migrations + load the demo data
npm run dev          # http://localhost:3000
```

```bash
npm run demo              # every required scenario, narrated in the terminal (uses a throwaway DB)
npm test                  # 30 tests against a real SQLite database (throwaway DB; dev.db untouched)
npm run test:multiprocess # the last-seat race across 4 separate processes (~12s)
npm run test:sabotage     # removes one guard at a time and checks the tests notice (~30s)
npm run verify            # setup + typecheck + lint + tests + multi-process race + production build
```

### Try it in the browser

Real sign-in is out of scope. Instead, the **"Acting as"** menu in the top bar sets who the tab is acting as: a parent or Ottodot staff. The choice is per tab, so two tabs can be two different parents.

1. **Book:** as any parent, pick a child, pick a class, click **Book**. You land on the booking page in `pending_payment`. Choose a card outcome (approved / declined / insufficient funds) and **Pay**. The page shows the final status and the payment history.
2. **Last-seat race (the brief's scenario):** *Fractions with Pizza* starts at 3/4.
   - Tab 1: act as **Nadia**, book **Aisha**, and stop on the payment page.
   - Tab 2: act as **Lena**, book **Emil**, and pay. Emil is confirmed at 4/4.
   - Back in Tab 1, pay. The booking is **cancelled**: "the class filled up… your card was not charged".
3. **Both pay at once:** reset, repeat with **"Slow payment gateway (3s)"** ticked in both tabs, and press Pay in both. One is confirmed and charged. The other is cancelled with its authorization **voided (not charged)**.
4. **Roster:** act as **Staff** and open **Class rosters**. It lists confirmed children with parent contacts. Anyone not on the roster (pending, declined, lost the race) is listed under **Not on the roster** with the reason.
5. **Reset demo data** in the top bar restores the seed at any time (dev server only; a production build refuses it).

### Seed data (`src/features/demo/server/demo.seed.ts`)

| Class | Starts with | Shows |
|---|---|---|
| `cls_open` Kitchen Chemistry | 1/4 confirmed (Mia), plus **Aisha's declined payment** | available seats; a payment failure that is not on the roster |
| `cls_last_seat` Fractions with Pizza | **exactly 3/4** (Arjun, Zara, Noah) | the last-seat race; **booking Arjun again is the duplicate attempt** |
| `cls_full` Build a Paper Rocket | 4/4 | a full class |
| `cls_puzzle` Puzzle Lab | 0/4 | a clean class |

Parents: Nadia (Aisha, Omar) · Ben (Mia) · Priya (Arjun) · Tom (Zara) · Lena (Noah, Emil) · Sam (Kai).

### Or with curl (dev server running)

The API is tRPC over HTTP at `/api/v1`. Inputs are wrapped in `{"json": …}` (superjson), `x-demo-user` says who you are, and every reply is an `apiResponse` envelope: `{ success, message, code, data }` (errors carry the same fields plus `domainCode`).

```bash
# Duplicate attempt → HTTP 409, domainCode DUPLICATE_BOOKING
curl -s -X POST localhost:3000/api/v1/booking.start -H 'content-type: application/json' \
  -H 'x-demo-user: par_priya' -d '{"json":{"trialClassId":"cls_last_seat","studentId":"stu_arjun"}}'

# Roster for a class (staff only)
curl -s -H 'x-demo-user: staff' \
  'localhost:3000/api/v1/roster.byClass?input=%7B%22json%22%3A%7B%22classId%22%3A%22cls_last_seat%22%7D%7D'
```

---

## What I built

- A **two-step booking flow** that mirrors the brief. `booking.start` is "moves to payment": it creates a `pending_payment` booking and holds no seat. `booking.pay` authorizes the card, claims a seat atomically, then captures or voids.
- A **mock card gateway** with the authorize → capture/void flow of a real provider, and deterministic outcomes.
- **Booking status and payment history** on a booking page (`booking.byId`), plus "Your bookings".
- A **staff roster** (`roster.all` / `roster.byClass`): confirmed children only, with everyone else listed separately with a reason.
- **Verification:** 30 tests on a real database (including tests that bypass the app to prove the database constraints), a narrated demo script, a multi-process race, and a sabotage run that proves the tests catch real bugs. CI runs all of it on Node 20 and 24.

## Time spent

**About 4 hours** for the slice the brief asks for, roughly: 40 min on the brief and the race design (no hold,
authorize → claim → capture/void), 40 min on the schema, constraints and seed data, 1h30 on the booking and payment
logic with its tests, 30 min on the UI, and 40 min on the docs and the verification scripts.

### What came after the timebox

The slice above was complete at that point. A few things were added afterwards, so they are **not** part of the four
hours — I list them because they change what the repo contains, and because most of them make a claim checkable
instead of asserted:

| Added | Why |
|---|---|
| CI on Node 20 and 24 (`verify` + `test:sabotage`) | every claim below is re-checked on each push. It immediately caught a lockfile that `npm ci` could not install on Node 20 |
| `npm run test:sabotage` | turns "my tests would catch a real bug" into a command a reviewer can run |
| An idempotency key per checkout attempt | a retried payment request reuses the first authorization instead of holding the card twice |
| The UI rebuilt on my own design system | reuse of an existing system ([docs/DESIGN.md](docs/DESIGN.md)), not frontend work the brief asked for |
| [FLOWS.md](docs/FLOWS.md) and [API.md](docs/API.md) | a click-to-database trace per feature, and the endpoint reference |

If you are timing the exercise, read the four-hour slice: the data model, `booking.service.ts`, the tests, and the
race section below.

## Assumptions

- Trial bookings only. Capacity is stored per class and is 4 for every seeded class. The trial fee is a flat $25.
- A booking belongs to a **child**; the paying parent is always that child's parent. A parent can only book, pay for, or see their own children's bookings.
- **Seats are not held during checkout.** The first parent whose payment completes gets the seat. The brief's scenario assumes this: B can pay while A is still on the payment step.
- A child may take trials in *different* classes; "one trial per family" is not enforced.
- A class that has already started cannot be booked.
- Auth is simulated with the per-tab "Acting as" menu (`x-demo-user` header). Rosters are staff-only because they contain children's names and parents' emails.

---

## Backend design

### Data model (`prisma/schema/`, migration in `prisma/migrations/`)

| Table | Key columns | Constraints |
|---|---|---|
| `Parent` | id, name, email | email unique |
| `Student` | id, parentId, name, age | FK parent; `CHECK age BETWEEN 3 AND 18` |
| `TrialClass` | id, subject, title, startsAt, capacity, **confirmedCount** | `CHECK (confirmedCount BETWEEN 0 AND capacity)` |
| `Booking` | id, trialClassId, studentId, status, statusReason, confirmedAt | **`UNIQUE (trialClassId, studentId) WHERE status IN ('pending_payment','confirmed')`**; `CHECK (status = 'confirmed') = (confirmedAt IS NOT NULL)`; status CHECK |
| `PaymentAttempt` | id, bookingId, status, amountCents, currency, providerRef, idempotencyKey, declineReason | status CHECK; amount > 0 |

- `confirmedCount` is the class's **seat counter**. Only the seat claim changes it, in the same transaction as the booking status. The tests assert it always equals the number of confirmed bookings, and the roster page shows that check.
- The partial unique index is declared in the Prisma schema (Prisma 7.10 `partialIndexes`). The `CHECK` constraints can't be expressed in Prisma's schema language, so they're hand-written in the migration SQL.

### Statuses

**Booking:** `pending_payment` → `confirmed` | `payment_failed` | `cancelled`. All three end states are terminal; a retry is a *new* booking, so history is kept.
**PaymentAttempt:** `authorized` → `captured` (won the seat) | `voided` (lost it); or `declined`.

```
                    booking.start                   booking.pay
  (none) ─────────────────────────► pending_payment ─┬─ class already full ──────────► cancelled       (card untouched)
                                                     ├─ card declined ───────────────► payment_failed  (nothing charged)
                                                     ├─ authorized, seat claimed ────► confirmed       (captured)
                                                     └─ authorized, seat lost ───────► cancelled       (voided, not charged)
```

### API (tRPC, `src/server/routers/_app.ts`)

Full reference with inputs, outputs and error codes: [docs/API.md](docs/API.md). Click-to-database traces per feature: [docs/FLOWS.md](docs/FLOWS.md).

| Procedure | Who | Does |
|---|---|---|
| `booking.classes` | anyone | upcoming classes with seats left |
| `booking.myChildren`, `booking.myBookings` | parent | the parent's children and bookings |
| `booking.start` | parent | step 1: create or resume a `pending_payment` booking → `{ bookingId, resumed }` |
| `booking.pay` | parent | step 2: authorize → claim seat → capture/void; returns the booking with its final status |
| `booking.byId` | parent | status + payment history |
| `roster.all`, `roster.byClass` | staff | confirmed roster + "not on roster" with reasons |
| `demo.personas`, `demo.reset` | anyone | demo helpers (reset is disabled in production) |

Each feature is a vertical slice: `*.schema.ts` → `*.repository.ts` → `*.service.ts` → `*.router.ts` (see [docs/folder-structure.md](docs/folder-structure.md)). All business logic is in `src/features/booking/server/booking.service.ts` as plain functions — no tRPC, so the race tests and the scripts call them directly; every Prisma statement is in the repository; the router only validates input, picks the procedure type and wraps the result.
Rule violations are errors with an HTTP status and a `domainCode`: `DUPLICATE_BOOKING` / `CLASS_FULL` / `NOT_PAYABLE` → 409, `CLASS_STARTED` → 412, `FORBIDDEN` → 403, `NOT_FOUND` → 404, no identity → 401, bad input → 400. **Payment outcomes are not errors:** a declined card or a lost seat is a successful request whose booking ends as `payment_failed` or `cancelled`.

### How duplicate bookings are prevented

- **Database:** the partial unique index allows one *active* (`pending_payment` or `confirmed`) booking per child per class. Two confirmed bookings for the same child and class cannot exist, even under concurrency. Finished bookings don't block a retry.
- **Backend:** `booking.start` rejects a child already confirmed in the class (`DUPLICATE_BOOKING`). If a checkout is already pending, it returns that same booking (a double-click or a second tab resumes it). If two requests race on the insert, the loser of the unique index picks up the winner's booking.
- **Double pay:** confirming is a compare-and-set (`… WHERE status = 'pending_payment'`). If Pay is clicked twice, one request confirms. The other gives its seat back and voids its authorization, so the card is charged once.
- **UI:** a class the child is already in shows "booked" / "Continue to payment" instead of a Book button.

### How payment failure is handled

The card is authorized **outside** any database transaction. A decline is recorded in one short transaction: a `declined` PaymentAttempt, and the booking goes `pending_payment → payment_failed` with the reason. No seat is touched, so the child is not on the roster and the seat stays free. The parent can **Try again**, which creates a new booking; the failed one stays as history.

Each Pay click carries an **idempotency key** (the client sends one; the server generates one if absent). The gateway returns the first authorization for a repeated key, so a retried request after a timeout never puts a second hold on the card, and the key is stored on the payment attempt for reconciliation.

### Two parents competing for the last seat (the required scenario)

**Approach: no seat holds. The card is only authorized, and one atomic database update decides who gets the seat. The winner is captured; everyone else is voided.**

`booking.pay`:
1. **Re-check capacity.** If the class is already full, cancel the booking without touching the card.
2. **Authorize** the card, outside any transaction. No money moves.
3. **One short transaction** records the authorization and claims a seat:
   ```sql
   UPDATE TrialClass SET confirmedCount = confirmedCount + 1
    WHERE id = :classId AND confirmedCount < capacity;   -- 1 row: seat won · 0 rows: class is full
   ```
   On a win, the booking becomes `confirmed`; otherwise it becomes `cancelled` ("the class filled up").
4. **Capture** the winner's authorization and **void** everyone else's.

The brief's sequence:
1. A moves to payment: `pending_payment`, no seat held.
2. B selects the same seat: `pending_payment`.
3. B pays: the claim succeeds (3 → 4), so B is `confirmed` and captured.
4. A pays: step 1 sees 4/4, so A is `cancelled` and **A's card is never touched**.

If A and B press Pay at the same moment, both pass step 1 and both are authorized. The single `UPDATE` lets exactly one through, and the other is **voided, never charged**. If app code ever tried to add a 5th seat anyway, the database `CHECK` rejects it; I verified this by deleting the guard (see Verification).

**Why this approach**
- **The database decides, not app timing or an in-process lock.** SQLite runs one writer at a time. On Postgres, the same `UPDATE` takes a row lock on the class and re-checks `confirmedCount < capacity` after a concurrent writer commits. It holds across several server instances; `npm run test:multiprocess` runs it across 4 processes.
- **No lock is held during the payment call**, so a slow gateway can't stall other bookings.
- **Nobody pays for a seat they didn't get.** Authorize-then-capture means the loser only ever sees a released authorization, never a charge and refund.
- **No holds means abandoned checkouts never block the last seat**, and nothing depends on an expiry job.

**Tradeoffs I accepted**
- A parent can reach the payment step and still lose the seat. The payment page says so up front ("your seat is not held yet"). If product wants a guarantee, a short hold (e.g. 5 minutes) can be layered on later, at the cost of expiry logic and blocked seats.
- In a same-moment race the loser's bank may briefly show a pending authorization before the void clears it.
- `confirmedCount` is denormalized. It's kept honest by a single write path, the same transaction as the status change, the `CHECK`, and a test on every scenario.
- A crash between steps can leave an authorization unsettled (see "Background jobs" below). No money is lost: an uncaptured authorization expires at the gateway.

### Which checks live where

| Layer | Checks | Why there |
|---|---|---|
| **UI** | shows seats left and "last seat"; hides Book when the child is already booked or the class is full; disables Pay while in flight; explains every status | fast feedback only; two tabs can both show "1 seat left" |
| **Backend** | input validation (Zod); identity (parent vs staff); ownership; class not started; duplicate and full pre-checks; capacity re-check before authorizing; gateway calls outside transactions; capture/void; error → HTTP mapping; retry on `SQLITE_BUSY` | business rules and orchestrating the external payment call |
| **Database** | atomic seat claim; `CHECK confirmedCount <= capacity`; partial unique index (one active booking per child and class); `confirmedAt` iff confirmed; status CHECKs; foreign keys; transactions so status + seat + payment commit together | the guarantees that must hold whatever the timing or code path |
| **Background jobs** (not built) | settle authorizations left `authorized` (capture if the booking is confirmed, void otherwise); close long-abandoned `pending_payment` checkouts; alert if counters ever drift | recovery work that must not sit in the request path |

---

## Verification

| What | Command | Result |
|---|---|---|
| Unit + integration tests (real SQLite, throwaway DB) | `npm test` | 30 passing |
| Required scenarios, narrated | `npm run demo` | all five scenarios + invariant check |
| Race across 4 OS processes, 3 rounds | `npm run test:multiprocess` | 1 confirmed / 19 cancelled, 0 errors, 1 capture per round |
| Guards removed one at a time, tests must notice | `npm run test:sabotage` | all 5 mutations caught |
| Everything | `npm run verify` | setup → typecheck → lint → tests → multi-process → build |
| Every push | GitHub Actions | `verify` + `test:sabotage` on Node 20 and 24 |

Test files:
- `booking.race.test.ts`: the brief's exact sequence (A never touches the card); both paying at once (loser voided, never captured); 10 payers who all passed the pre-check (exactly 1 seat); double-click Pay (charged once).
- `booking.service.test.ts`: the seed covers the required cases; happy path; duplicate; resume; concurrent checkouts for one child; decline; retry; a finished checkout can't be paid; idempotent pay; full class; started class; ownership; roster filtering.
- `constraints.test.ts`: writes that **bypass the app**: the database rejects a 5th seat, a second active booking, and a confirmed booking without `confirmedAt`.
- `api.test.ts`: identity (401/403), staff-only rosters, HTTP status codes and `domainCode`s, and that a declined payment is a 200 with `payment_failed`.

Every test also checks the global invariants afterwards: ≤ capacity, seat counter = roster, one active booking per child and class, confirmed bookings charged exactly once, no authorization left unsettled.

A passing suite only proves nothing failed, so `npm run test:sabotage` removes one guard at a time and checks the right tests break — you can run it yourself:

| Guard removed | Caught by |
|---|---|
| `confirmedCount < capacity` on the seat claim | 3 race tests (and the database `CHECK` rejects the 5th seat on its own) |
| the capacity re-check before the card is touched | "A never touches the card" |
| the capture/void decision (capture everyone) | "the loser is voided, never captured" |
| the ownership check | ownership test + the 403 status-code test |
| the duplicate check | duplicate test + the 409 status-code test |

Each file is restored immediately afterwards and the script fails if a mutation goes unnoticed.

## What I deliberately cut

Regular enrollment · a real payment provider and its webhooks · real authentication · cancelling or refunding a confirmed booking · waitlists · notifications · the background jobs above · timezone preferences (times show in the browser's zone) · end-to-end browser tests.

## What I would monitor after release

1. **Invariant alarms (page someone):** any class where confirmed bookings ≠ `confirmedCount`, and any `CHECK`-constraint error. The database blocks overbooking, so seeing either means a code bug.
2. **Unsettled authorizations:** `PaymentAttempt.status = 'authorized'` older than a few minutes means a crash between the seat decision and capture/void.
3. **Race losses:** rate of `voided` attempts and `cancelled` bookings per class, which shows real contention. If it's high, consider short holds or bigger classes.
4. **Payment declines** by reason, to catch gateway or card problems.
5. **Checkout funnel:** `pending_payment` that never gets paid (abandonment) and time from start to pay.
6. **409s by `domainCode`** (duplicates can indicate UX confusion), `SQLITE_BUSY` retries, and p95/p99 latency of `booking.pay` and the gateway.

## What I'd do next

1. The settlement / reconciliation job for unsettled authorizations, with gateway idempotency keys per booking.
2. Real parent and staff auth replacing the demo header.
3. Postgres + `prisma migrate` in CI; the same `UPDATE` and constraints carry over.
4. Cancelling a confirmed booking (release the seat in the same transaction), then a waitlist that offers the freed seat.
5. Playwright tests for the two-tab race.

## Docs

[PRD](docs/PRD.md) · [Architecture](docs/ARCHITECTURE.md) · [Feature flows](docs/FLOWS.md) · [API reference](docs/API.md) · [Feature list & traceability](docs/FEATURE_LIST.md) · [Design system](docs/DESIGN.md) · [Folder structure](docs/folder-structure.md) · [AI usage](docs/AI_USAGE.md)
