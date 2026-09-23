# API Reference

Every endpoint, its input, what comes back, and how it fails. The flows that use them are in
[FLOWS.md](FLOWS.md); the reasoning behind the design is in [ARCHITECTURE.md](ARCHITECTURE.md).

## 1. Transport

| | |
|---|---|
| **Endpoint** | `/api/v1/<procedure>` — tRPC v11 over HTTP (`src/app/api/v1/[trpc]/route.ts`) |
| **Method** | `GET` for queries, `POST` for mutations |
| **Serialization** | superjson, so inputs and outputs are wrapped in `{"json": …}` and `Date`s survive the round trip |
| **Batching** | the browser client batches (`?batch=1`, inputs keyed `{"0":{"json":…}}`); a single call needs no batch |
| **Identity** | the `x-demo-user` header: a parent id (`par_nadia`) or `staff`. Missing or unknown → 401 on parent procedures |
| **Types** | `TRouterInputs` / `TRouterOutputs` in `src/lib/trpc/client.ts` — the client's types come from the router itself |

Identity is a stand-in for sign-in, chosen per browser tab (see [FLOWS.md §2](FLOWS.md#2-acting-as-someone)).

## 2. Response envelope

Every success carries the same four fields (`src/lib/utils/api-response.ts`):

```jsonc
// GET /api/v1/booking.classes
{ "result": { "data": { "json": {
  "success": true,
  "message": "Trial classes retrieved successfully",
  "code": 200,
  "data": [ { "id": "cls_open", "subject": "Science", "title": "Kitchen Chemistry",
              "startsAt": "2026-09-26T09:00:00.000Z", "capacity": 4, "confirmedCount": 1,
              "createdAt": "2026-09-23T08:23:28.299Z", "seatsLeft": 3 } ]
} } } }
```

A failure mirrors it, and adds `domainCode` — the machine-readable name of the rule that refused the request
(`src/server/trpc.ts`). The HTTP status is the real status, not 200:

```jsonc
// POST /api/v1/booking.start  →  HTTP 409
{ "error": { "json": {
  "success": false,
  "message": "Arjun Shah already has a confirmed seat in this class.",
  "code": 409,
  "data": { "code": "CONFLICT", "httpStatus": 409, "path": "booking.start",
            "domainCode": "DUPLICATE_BOOKING" }
} } }
```

`data.stack` is also present outside production builds.

**Payment outcomes are not errors.** A declined card or a lost seat is a successful request whose booking comes
back as `payment_failed` or `cancelled`.

## 3. Procedures

| Procedure | Method | Who | Input | Success |
|---|---|---|---|---|
| [`booking.classes`](#bookingclasses) | GET | anyone | — | 200 |
| [`booking.myChildren`](#bookingmychildren) | GET | parent | — | 200 |
| [`booking.myBookings`](#bookingmybookings) | GET | parent | — | 200 |
| [`booking.byId`](#bookingbyid) | GET | parent (owner) | `{ bookingId }` | 200 |
| [`booking.start`](#bookingstart) | POST | parent (owner) | `{ trialClassId, studentId }` | 201 new · 200 resumed |
| [`booking.pay`](#bookingpay) | POST | parent (owner) | `{ bookingId, cardOutcome?, gatewayDelayMs?, idempotencyKey? }` | 200 |
| [`roster.all`](#rosterall) | GET | staff | — | 200 |
| [`roster.byClass`](#rosterbyclass) | GET | staff | `{ classId }` | 200 |
| [`demo.personas`](#demopersonas) | GET | anyone | — | 200 |
| [`demo.reset`](#demoreset) | POST | anyone (dev only) | — | 200 |

---

### booking.classes

Upcoming classes only (`startsAt > now`), earliest first, with live seat counts.

```ts
data: {
  id: string; subject: string; title: string; startsAt: Date;
  capacity: number; confirmedCount: number; createdAt: Date;
  seatsLeft: number;   // max(0, capacity - confirmedCount)
}[]
```

### booking.myChildren

The acting parent's children, by name. `data: { id, parentId, name, age, createdAt }[]`

### booking.myBookings

Every booking of the acting parent's children, newest first, each with its class and child.

```ts
data: {
  id: string; trialClassId: string; studentId: string;
  status: "pending_payment" | "confirmed" | "payment_failed" | "cancelled";
  statusReason: string | null; confirmedAt: Date | null; createdAt: Date; updatedAt: Date;
  trialClass: { id; subject; title; startsAt; capacity; confirmedCount; createdAt };
  student: { id; parentId; name; age; createdAt };
}[]
```

### booking.byId

**Input** `{ bookingId: string }` · One booking with its class (including `seatsLeft`), its child and its payment
history, oldest attempt first.

```ts
data: {
  …booking fields as above;
  trialClass: { …class fields; seatsLeft: number };
  student: { … };
  payments: {
    id: string; bookingId: string;
    status: "authorized" | "captured" | "voided" | "declined";
    amountCents: number; currency: string;
    providerRef: string | null;        // gateway authorization id
    idempotencyKey: string | null;     // the key sent for that attempt
    declineReason: string | null; createdAt: Date; updatedAt: Date;
  }[];
}
```

**Errors** `NOT_FOUND` (404) — also when the booking belongs to another parent, so the API never confirms that
someone else's booking exists.

### booking.start

Step 1 of checkout. Creates a `pending_payment` booking, **or returns the one already in progress** for that child
and class. **It holds no seat.**

**Input** `{ trialClassId: string, studentId: string }` · **Output** `{ bookingId: string, resumed: boolean }`
(`code` 201 when created, 200 when resumed).

| Error | HTTP | When |
|---|---|---|
| `NOT_FOUND` | 404 | unknown class or child |
| `FORBIDDEN` | 403 | the child is not the acting parent's |
| `CLASS_STARTED` | 412 | the class has already started |
| `DUPLICATE_BOOKING` | 409 | the child is already confirmed in that class |
| `CLASS_FULL` | 409 | the class is already at capacity |

### booking.pay

Step 2. Re-checks capacity, authorizes the card outside any transaction, claims a seat with one atomic `UPDATE`,
then captures the winner or voids the loser ([ARCHITECTURE §5](ARCHITECTURE.md#5-the-last-seat-race)).

**Input**

| Field | Type | Default | Notes |
|---|---|---|---|
| `bookingId` | string | — | must be the acting parent's, still `pending_payment` |
| `cardOutcome` | `"approve"` \| `"card_declined"` \| `"insufficient_funds"` | `"approve"` | the mock card's answer |
| `gatewayDelayMs` | int 0–5000 | `0` | widens the race window for demos |
| `idempotencyKey` | string 8–64 | server-generated | one per Pay click; a retry with the same key reuses the first authorization |

**Output** the same shape as `booking.byId` — the booking with its final status:

| Outcome | `status` | Payment attempt |
|---|---|---|
| card approved, seat won | `confirmed` | `captured` |
| card declined | `payment_failed` | `declined` |
| class was already full | `cancelled` | none — the card is never touched |
| seat lost during payment | `cancelled` | `voided` |
| booking already confirmed | `confirmed`, unchanged | none — no second charge |

**Errors** `NOT_FOUND` (404) for someone else's or a missing booking · `NOT_PAYABLE` (409) when the checkout has
already ended (`payment_failed` / `cancelled`) — start a new booking instead.

### roster.all

Every class with its confirmed roster and everyone who is *not* on it, so staff can see why a child is missing.

```ts
data: {
  id; subject; title; startsAt; capacity;
  seatCounter: number;               // TrialClass.confirmedCount — must equal roster.length
  roster: { bookingId; studentName; studentAge; parentName; parentEmail; confirmedAt }[];
  notOnRoster: { bookingId; studentName; status; statusReason; createdAt }[];
}[]
```

### roster.byClass

**Input** `{ classId: string }` · One entry of the above. **Errors** `NOT_FOUND` (404) for an unknown class.

### demo.personas

Who you can act as: parents with their children. `data: { id, name, email, createdAt, students: […] }[]`

### demo.reset

Restores the seed data. `data: { ok: true }` · **Errors** `FORBIDDEN` (403) in a production build — the deployed
demo cannot be wiped by a visitor.

## 4. Error catalogue

| `domainCode` | HTTP | Meaning |
|---|---|---|
| `DUPLICATE_BOOKING` | 409 | the child already has a confirmed seat in that class |
| `CLASS_FULL` | 409 | no seats left at checkout time |
| `NOT_PAYABLE` | 409 | the checkout already ended |
| `CLASS_STARTED` | 412 | the class has begun |
| `FORBIDDEN` | 403 | not your child, or a staff-only resource |
| `NOT_FOUND` | 404 | unknown class, child or booking — or someone else's booking |
| — | 401 | no `x-demo-user`, or an unknown parent id |
| — | 400 | input failed Zod validation |

## 5. curl

```bash
# Upcoming classes (query: input goes in the query string)
curl -s 'localhost:3000/api/v1/booking.classes'

# Start a checkout (mutation: input in the body, wrapped for superjson)
curl -s -X POST localhost:3000/api/v1/booking.start \
  -H 'content-type: application/json' -H 'x-demo-user: par_tom' \
  -d '{"json":{"trialClassId":"cls_open","studentId":"stu_zara"}}'

# Pay for it, with an idempotency key of your own
curl -s -X POST localhost:3000/api/v1/booking.pay \
  -H 'content-type: application/json' -H 'x-demo-user: par_tom' \
  -d '{"json":{"bookingId":"<id>","cardOutcome":"approve","idempotencyKey":"demo-0001"}}'

# Duplicate attempt → HTTP 409, domainCode DUPLICATE_BOOKING
curl -s -X POST localhost:3000/api/v1/booking.start \
  -H 'content-type: application/json' -H 'x-demo-user: par_priya' \
  -d '{"json":{"trialClassId":"cls_last_seat","studentId":"stu_arjun"}}'

# Roster for one class (staff only)
curl -s -H 'x-demo-user: staff' \
  'localhost:3000/api/v1/roster.byClass?input=%7B%22json%22%3A%7B%22classId%22%3A%22cls_last_seat%22%7D%7D'
```
