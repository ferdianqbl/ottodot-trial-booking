# Feature List & Traceability

Every requirement in the brief, the feature that delivers it, where the code is, and how it's verified.

## 1. Features

| ID | Feature | Code | Notes |
|---|---|---|---|
| F-01 | Class catalog with live seats | `booking.classes` → service `listClasses` | upcoming only; `seatsLeft` from the seat counter |
| F-02 | Choose a child | `booking.myChildren`; `booking-view.tsx` | only the acting parent's children |
| F-03 | Start a booking ("move to payment") | `booking.start` → service `start` | creates or resumes `pending_payment`; no seat held; duplicate/full/started checks |
| F-04 | Pay with a mock card | `booking.pay` → service `pay`; `payment.gateway.ts` | re-check → authorize → atomic seat claim → capture/void |
| F-05 | Booking status + payment history | `booking.byId`; `booking-detail-view.tsx` | status badge, reason, *Try again*, attempts table |
| F-06 | "Your bookings" | `booking.myBookings` | all of a parent's bookings with status |
| F-07 | Staff roster | `roster.all`, `roster.byClass`; `roster-view.tsx` | confirmed only + "not on roster" with reasons + seat-counter check |
| F-08 | Demo identity | `x-demo-user` header, `parentProcedure` / `staffProcedure`; `persona-switcher.tsx` | per-tab, so two tabs can be two parents |
| F-09 | Seed + reset | `demo.seed.ts`; `demo.reset`; `npm run setup` | one dataset for app, tests and scripts |
| F-10 | Database constraints | `prisma/migrations/…_init/migration.sql`, `booking.prisma` | CHECKs + partial unique index |
| F-11 | Narrated demo | `scripts/demo.ts` (`npm run demo`) | throwaway DB |
| F-12 | Multi-process race | `scripts/multi-process-race.ts` (`npm run test:multiprocess`) | 4 OS processes, 3 rounds |
| F-13 | Sabotage run | `scripts/sabotage.ts` (`npm run test:sabotage`) | removes each guard, asserts the tests notice |

## 2. Traceability to the brief

| Brief requirement | Features | Verified by |
|---|---|---|
| Parent chooses a child and an available trial class | F-01, F-02 | UI; `api.test.ts` › booking requires acting as a known parent |
| Parent submits a trial booking | F-03 | `booking.service.test.ts` › happy path |
| Mock payment step / result recorded | F-04 | `PaymentAttempt` rows asserted in every payment test; `gatewayCallsFor` in race tests |
| Booking status shown after submission | F-05, F-06 | `booking.pay` returns the booking; `api.test.ts` › full flow; UI booking page |
| Admin/teacher sees the roster (UI or API) | F-07 | `booking.service.test.ts` › roster; `api.test.ts` › rosters are staff-only, roster over HTTP |
| Prevent duplicate confirmed bookings | F-03, F-10 | › duplicate; › concurrent checkouts for the same child; `constraints.test.ts` › one active booking |
| Prevent overbooking beyond 4 | F-04, F-10 | `booking.race.test.ts` (all); `constraints.test.ts` › never more than capacity; multi-process |
| Payment failure doesn't add the child to the roster | F-04 | › declined card; › retrying after a decline; › a finished checkout cannot be paid |
| Last-seat race: at most one confirmed | F-04 | › the brief's sequence; › both pay at the same moment; › 10 payers; F-12 |
| Seed: class with seats | F-09 | › seed data covers the cases (`cls_open`) |
| Seed: class with exactly 3 confirmed | F-09 | same (`cls_last_seat`) |
| Seed: duplicate attempt | F-09 | Arjun in `cls_last_seat`; `npm run demo` step 2 |
| Seed: payment failure | F-09 | Aisha in `cls_open`; `npm run demo` step 3 |
| Tests or verification steps | F-11, F-12, F-13 | `npm run verify` (CI runs it on Node 20 and 24) |
| README / AI_USAGE sections | — | `README.md`, `docs/AI_USAGE.md` |

## 3. Behaviors by case

Every reply is an `apiResponse` envelope — `{ success, message, code, data }` — and errors carry the same fields
plus `domainCode`. The column below is the HTTP status; a new checkout also reports `code: 201` inside its envelope.

| Case | Result | HTTP (tRPC) |
|---|---|---|
| Start: child already confirmed in class | error `DUPLICATE_BOOKING` | 409 |
| Start: child has a pending checkout | same booking returned (`resumed: true`) | 200 |
| Start: class full | error `CLASS_FULL` | 409 |
| Start: class started | error `CLASS_STARTED` | 412 |
| Start: someone else's child | error `FORBIDDEN` | 403 |
| Pay: card approved, seat free | booking `confirmed`, attempt `captured` | 200 |
| Pay: card declined | booking `payment_failed`, attempt `declined` | 200 |
| Pay: class already full | booking `cancelled`, no attempt | 200 |
| Pay: lost the seat mid-payment | booking `cancelled`, attempt `voided` | 200 |
| Pay: already confirmed | booking returned unchanged, no new charge | 200 |
| Pay: finished checkout (failed/cancelled) | error `NOT_PAYABLE` | 409 |
| Any booking call without a known parent | `UNAUTHORIZED` | 401 |
| Roster as a parent | `FORBIDDEN` | 403 |

## 4. Out of scope

Regular enrollment · real payment provider · real auth · cancelling a confirmed booking · waitlist · notifications · background jobs (designed in [ARCHITECTURE.md §8](ARCHITECTURE.md#8-background-jobs-designed-not-built)).
