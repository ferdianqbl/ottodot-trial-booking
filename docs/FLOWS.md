# Feature Flows

What happens between a click and a database row, feature by feature, naming every file on the way.
Endpoint details are in [API.md](API.md); the reasoning behind the design is in [ARCHITECTURE.md](ARCHITECTURE.md).

## 1. The path every request takes

```
Browser                                   Next.js server
─────────────────────────────────────     ────────────────────────────────────────────────
<feature>-view.tsx                        app/api/v1/[trpc]/route.ts   fetchRequestHandler
  └ trpc.<router>.<proc>.useQuery()         └ server/context.ts        x-demo-user → user, prisma
    /.useMutation()                           └ server/trpc.ts         procedure + middleware
      └ lib/trpc/client.ts                      └ <feature>.router.ts  input schema, apiResponse()
        └ providers/trpc/index.tsx                └ <feature>.service.ts   business logic
          httpBatchLink → /api/v1                   └ <feature>.repository.ts  every Prisma call
          + x-demo-user header                        └ lib/db/write-transaction.ts (writes only)
                                                        └ SQLite
```

Fixed points, whatever the feature:

| Step | File | Job |
|---|---|---|
| Identity | `src/providers/trpc/index.tsx` | puts `x-demo-user` on every request |
| Context | `src/server/context.ts` | header → `ctx.user`, plus `ctx.prisma` |
| Access | `src/server/trpc.ts` | `publicProcedure` / `parentProcedure` (401) / `staffProcedure` (403); maps `DomainError` → HTTP |
| Shape | `src/lib/utils/api-response.ts` | the `{ success, message, code, data }` envelope |
| Writes | `src/lib/db/write-transaction.ts` | the only write path; retries `SQLITE_BUSY` |

The UI reads `response.data` from that envelope, which is why every view below does `query.data?.data`.

## 2. Acting as someone

The stand-in for sign-in. **Per browser tab**, so two tabs can be two different parents — that is what makes the
last-seat race demonstrable by hand.

| | |
|---|---|
| **UI** | `src/components/layout/persona-switcher.tsx` (a shadcn `Select` in the header) |
| **Store** | `src/hooks/use-persona.ts` — `sessionStorage["ottodot.demo-user"]`, published with `useSyncExternalStore` |
| **Options** | `demo.personas` → `demo.service.ts` → `demo.repository.ts` → parents + their children |
| **On change** | `setPersona()` then `queryClient.resetQueries()`, so nothing from the previous parent stays on screen |
| **On every request** | `getPersona()` → the `x-demo-user` header → `parseDemoUser()` → `ctx.user` |

A fresh tab defaults to the first parent. `"staff"` switches the whole app into teacher/ops mode: the booking page
explains it is for parents, and the roster becomes readable.

## 3. Book a trial — choosing

**Route** `/` → `src/app/page.tsx` → `src/features/booking/components/booking-view.tsx`

| Section | Data | Files |
|---|---|---|
| Header + coin | — | `components/shared/page-content.tsx`, `coin-mark.tsx`, `marker-swatch.tsx` |
| 1. Who is the trial for? | `booking.myChildren` | shadcn `RadioGroup` + `Field` as choice cards |
| 2. Pick a class | `booking.classes` | `ClassTile` (shadcn `Card`), `components/shared/seat-meter.tsx` |
| Your bookings | `booking.myBookings` | shadcn `Item` rows + `components/shared/status-badge.tsx` |

Each tile decides its own action from the two queries, so the button always matches the child in the picker:

| Condition | What the tile shows |
|---|---|
| the child is already confirmed in that class | a "… is booked" badge |
| the child has a checkout in progress | **Continue to payment** → `/bookings/<id>` |
| `seatsLeft === 0` | a **Full** badge |
| `seatsLeft === 1` | a yellow marker and "Last seat" beside the subject |
| otherwise | **Book for <child>** |

Loading states are skeletons (`components/shared/loading-state.tsx`); an empty booking list uses
`components/shared/empty-state.tsx`.

## 4. Book a trial — starting the checkout

**Click** *Book for …* → `booking.start` → `booking.service.ts` → `start()`.

1. Load the class and child (`findClassById`, `findStudentById`) → `NOT_FOUND` if either is missing.
2. Ownership: the child must be the acting parent's → `FORBIDDEN`.
3. The class must not have started → `CLASS_STARTED`.
4. Look for an **active** booking for this child and class (`findActiveBooking`):
   confirmed → `DUPLICATE_BOOKING`; pending → return it with `resumed: true` (a double-click or a second tab
   resumes the same checkout).
5. Fast-fail if the class looks full → `CLASS_FULL`. This is feedback, **not** the guard: no seat is held.
6. `writeTransaction` → insert the `pending_payment` booking. If a concurrent request won the partial unique index
   (P2002), re-read and continue with that booking instead.

**On success** the view pushes `/bookings/<bookingId>`.
**On refusal** the message appears inside that tile as a destructive `Alert`, and the view invalidates
`booking.classes` + `booking.myBookings` — the page was out of date, so the tile refreshes itself (a class that
filled up flips to **Full** while the error is still on screen).

## 5. Pay — and the last-seat race

**Route** `/bookings/[id]` → `src/app/bookings/[id]/page.tsx` → `booking-detail-view.tsx`, which reads
`booking.byId` and renders three parts: the status alert, the payment form (only while `pending_payment`), and the
payment history table.

The form sends `booking.pay` with the chosen card outcome, an optional 3s gateway delay (the two-tab race demo),
and a fresh `idempotencyKey` per click.

`booking.service.ts` → `pay()`:

| Step | What runs | Files |
|---|---|---|
| 1 | Ownership and status checks; a confirmed booking returns unchanged (no second charge) | `booking.repository.ts` |
| 2 | Class already full? → booking `cancelled`, **card never touched** | `finishPendingBooking` |
| 3 | Authorize, **outside any transaction** — no money moves, no lock held during the call | `features/payment/server/payment.gateway.ts` |
| 4 | Declined → record a `declined` attempt, booking `payment_failed`, seats untouched | `writeTransaction` |
| 5 | One transaction: insert the `authorized` attempt → `claimSeat()` (`UPDATE … WHERE confirmedCount < capacity`) → compare-and-set the booking to `confirmed`; if the claim returns 0 rows, `cancelled` | `booking.repository.ts` |
| 6 | Capture the winner, void everyone else; update the attempt to `captured` / `voided` | gateway + `settlePaymentAttempt` |

What the parent sees, all from the returned booking:

| Status | Alert | Extras |
|---|---|---|
| `pending_payment`, seats left | "Your seat is not held yet" + seats remaining | the payment form |
| `pending_payment`, class full | "This class has just filled up" | paying now cancels, free of charge |
| `confirmed` | "<child> is on the class roster" + timestamp | history row `Charged` |
| `payment_failed` | the decline reason, in vermillion | **Try again** → `booking.start` → a *new* booking; history row `Declined` |
| `cancelled` | "The class filled up before your payment completed" | "your card was not charged", and `Voided (not charged)` if it had been authorized |

After a successful call the view writes the result straight into the `booking.byId` cache and invalidates
`booking.classes` and `booking.myBookings`, so the home page shows the new seat count.

## 6. Staff roster

**Route** `/roster` → `src/app/roster/page.tsx` → `features/roster/components/roster-view.tsx` → `roster.all`
(`staffProcedure`; a parent gets 403 and the view offers an **Act as staff** button instead).

`roster.service.ts` splits each class's bookings in two: `confirmed` becomes the roster, everything else becomes
`notOnRoster` with its status and reason. Per class the card shows the subject, title and time, a seat meter with
`n / capacity confirmed`, and a **Seat counter matches** badge comparing `TrialClass.confirmedCount` with the
roster length — the invariant, visible on screen. The confirmed table lists child, age, parent and contact email;
the rest sit in a collapsible list underneath.

## 7. Reset demo data

Header button (`components/layout/app-header.tsx`) → `demo.reset` → `demo.service.ts` → `seedDemoData()`
(`demo.seed.ts`), then `utils.invalidate()` refetches everything. A production build refuses with `FORBIDDEN`, and
the header prints that reason next to the button.

## 8. Where each rule is enforced

| Rule | UI | Service | Database |
|---|---|---|---|
| No duplicate confirmed booking | hides Book when already booked | `DUPLICATE_BOOKING` on start | partial unique index on `(trialClassId, studentId)` where status is active |
| Never more than 4 confirmed | shows **Full**, disables Book | pre-check + atomic `claimSeat()` | `CHECK (confirmedCount BETWEEN 0 AND capacity)` |
| A failed payment stays off the roster | shows the reason and *Try again* | seat only claimed after an approved card | `confirmed` iff `confirmedAt` |
| One winner for the last seat | warns the seat is not held | authorize → claim → capture/void | the conditional `UPDATE` decides |
| Parents act only on their own children | shows only their children | ownership checks → 403/404 | foreign keys |
