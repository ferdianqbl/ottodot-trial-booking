# Product Requirements: Trial Class Booking

| | |
|---|---|
| **Status** | Implemented |
| **Scope** | Trial bookings for live online science and math classes. Regular enrollment is out of scope. |
| **Source** | Ottodot Full-Stack Take-Home brief |

---

## 1. Problem

Parents book and pay for a trial class for their child. Trial classes are capped at **4 students**, and the team needs an **accurate roster before class starts**.

Things that must never happen:
- the same child confirmed twice in one class
- a 5th child confirmed in a 4-seat class
- a child on the roster whose payment failed
- two parents both "winning" the last seat, or a parent charged for a seat they didn't get

## 2. Goals and non-goals

**Goals:** the smallest working slice of booking + payment + roster; the invariants above enforced by the database; clear status for parents; a trustworthy roster for staff; verification a reviewer can run in one command.

**Non-goals:** regular enrollment, real payments, real auth, cancellation/refund of confirmed bookings, waitlists, notifications.

## 3. Users

| User | Needs | Worst outcome |
|---|---|---|
| **Parent** | pick a child and a class, pay, know immediately whether the child is in | paying and then being told the class was full, or being charged for nothing |
| **Teacher / ops (staff)** | the confirmed roster with parent contacts | 5 kids in a class of 4, or a child listed whose payment failed |

---

## 4. Invariants

| ID | Rule | Enforced by | On violation |
|---|---|---|---|
| **INV-1** | A class has at most `capacity` (4) confirmed students | atomic `UPDATE … WHERE confirmedCount < capacity` + DB `CHECK (confirmedCount <= capacity)` | payer's booking → `cancelled`, authorization voided |
| **INV-2** | A child has at most one active booking per class, so never two confirmed | DB partial unique index on `(trialClassId, studentId) WHERE status IN ('pending_payment','confirmed')` | `DUPLICATE_BOOKING` (409) |
| **INV-3** | A child is on the roster only after an approved payment | the booking becomes `confirmed` only in the seat-claim transaction after authorization | decline → `payment_failed`, not on the roster |
| **INV-4** | Money is captured only for a seat that was won | authorize → claim → capture (winner) / void (everyone else) | loser voided, never charged |
| **INV-5** | Parents act only on their own children; rosters are staff-only | tRPC procedures + ownership checks | 401 / 403 / 404 |

---

## 5. User journeys

### 5.1 Book and pay

1. The parent chooses a child and a class, then clicks **Book** → `booking.start` → booking `pending_payment` (no seat held).
2. On the booking page, the parent chooses a card outcome and clicks **Pay** → `booking.pay`.
3. The page shows the final status: **Confirmed** (charged) · **Payment failed** (reason; *Try again*) · **Cancelled** (class filled up; not charged).
4. "Your bookings" on the home page lists every booking with its status.

### 5.2 Last-seat race (the brief's scenario)

The class is at 3/4. A moves to payment. B moves to payment for the same seat. B pays first → confirmed (4/4). A pays → **cancelled, card never touched**. If both pay at the same moment, one is confirmed and captured; the other is cancelled and its authorization voided.

### 5.3 Staff roster

Staff open **Class rosters**: each class shows its confirmed children (with parent name and email) and a seat-counter check. Children who are not on the roster (pending, declined, lost the race) are listed underneath with the reason.

---

## 6. Functional requirements

| ID | Requirement |
|---|---|
| FR-1 | List upcoming classes with subject, time, capacity, confirmed count and seats left. |
| FR-2 | A parent sees only their own children and can book only for them. |
| FR-3 | Starting a booking creates `pending_payment`, or resumes the child's pending booking for that class. It rejects a child already confirmed (`DUPLICATE_BOOKING`), a full class (`CLASS_FULL`), and a class that has started (`CLASS_STARTED`). |
| FR-4 | Paying re-checks capacity before touching the card; authorizes outside any transaction; claims the seat atomically; captures the winner and voids the loser. |
| FR-5 | A declined card records a `declined` payment attempt and marks the booking `payment_failed` with the reason. Seats are unchanged. |
| FR-6 | Retrying after a failure creates a new booking; the failed booking remains as history. |
| FR-7 | Paying a booking that is already confirmed returns it without charging again. Paying a finished (failed/cancelled) booking is rejected (`NOT_PAYABLE`). |
| FR-8 | Every call returns the booking's status; the booking page shows status, reason, and payment history. |
| FR-9 | Staff can read rosters: confirmed bookings only, plus a "not on roster" list with statuses and reasons. |
| FR-10 | Mock gateway with deterministic outcomes (`approve`, `card_declined`, `insufficient_funds`) and optional latency. |

## 7. Data model

`Parent` · `Student` (child) · `TrialClass` (capacity, `confirmedCount`) · `Booking` (status, statusReason, confirmedAt) · `PaymentAttempt` (authorized/captured/voided/declined). Constraints are in [ARCHITECTURE.md §3](ARCHITECTURE.md#3-data-model).

## 8. Seed data

| Class | Starts with | Demonstrates |
|---|---|---|
| `cls_open` | 1/4 + Aisha `payment_failed` | available seats; payment failure kept off the roster |
| `cls_last_seat` | exactly 3/4 (Arjun, Zara, Noah) | last-seat race; Arjun = duplicate attempt |
| `cls_full` | 4/4 | full class |
| `cls_puzzle` | 0/4 | clean class |

## 9. Acceptance tests

| ID | Scenario | Expected | Test |
|---|---|---|---|
| AT-1 | Book an open class and pay | pending (no seat) → confirmed, captured | `booking.handlers.test.ts` › happy path |
| AT-2 | Book Arjun into `cls_last_seat` again | 409 `DUPLICATE_BOOKING`, nothing written | › duplicate; `api.test.ts` |
| AT-3 | Declined card | `payment_failed`, declined attempt, roster and seats unchanged | › declined card |
| AT-4 | Retry after a decline | new booking confirmed; old stays failed | › retrying after a decline |
| AT-5 | The brief's race sequence | B confirmed 4/4; A cancelled, no authorization | `booking.race.test.ts` › the brief's sequence |
| AT-6 | Both pay at once | one captured; the other voided, never captured | › both pay at the same moment |
| AT-7 | 10 payers past the pre-check | exactly 1 seat, 9 voided | › the database decides |
| AT-8 | Double-click Pay | one capture, one void, one seat | › double-clicking Pay |
| AT-9 | Direct DB writes bypassing the app | 5th seat / 2nd active booking / confirmed without date rejected | `constraints.test.ts` |
| AT-10 | 4 processes race for the last seat | 1 confirmed, 0 errors, 1 capture | `npm run test:multiprocess` |
| AT-11 | Roster | confirmed only; others listed with reasons; staff-only | › roster; `api.test.ts` |

## 10. Success measures (post-release)

Zero invariant alarms; a low race-loss (void) rate; decline rate within the gateway's norm; checkout completion rate (`pending_payment` → any end state). See README "What I would monitor".
