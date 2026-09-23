# Folder Structure

Feature slices with strict layer suffixes, `components/{layout,shared,ui}`, `providers/`, `hooks/`,
and an `api/v1` tRPC gateway.

```
workspace/
├── README.md                     # how to run, design summary, verification — start here
├── AI_USAGE.md                   # pointer to docs/AI_USAGE.md (the brief expects it at the root)
├── .github/workflows/verify.yml  # CI: verify + sabotage on Node 20 and 24
├── .nvmrc                        # Node 20, the floor declared in package.json engines
├── docs/                         # PRD, ARCHITECTURE, FLOWS, API, FEATURE_LIST, DESIGN, folder-structure, AI_USAGE
├── prisma/
│   ├── schema/                   # multi-file Prisma schema
│   │   ├── index.prisma          # datasource & generator (client → src/generated/prisma)
│   │   ├── family.prisma         # Parent, Student
│   │   ├── trial-class.prisma    # TrialClass (capacity, confirmedCount)
│   │   ├── booking.prisma        # Booking + partial unique index (one active booking per child/class)
│   │   └── payment-attempt.prisma
│   ├── migrations/               # SQL applied by `prisma migrate deploy`; CHECK constraints hand-written
│   └── seed.ts                   # npm run db:seed
├── scripts/
│   ├── demo.ts                   # npm run demo — narrated scenarios on a throwaway DB
│   ├── multi-process-race.ts     # npm run test:multiprocess — race across 4 OS processes
│   ├── sabotage.ts               # npm run test:sabotage — removes each guard, asserts the tests notice
│   └── temp-database.ts          # creates a migrated throwaway SQLite file
├── src/
│   ├── app/                      # Next.js routes: page.tsx, bookings/[id], roster, error, not-found
│   │   ├── api/v1/[trpc]/route.ts    # tRPC API gateway
│   │   └── layout.tsx, globals.css   # design tokens live in globals.css
│   ├── components/
│   │   ├── layout/               # app shell: app-header, persona-switcher
│   │   ├── shared/               # cross-feature: page-content (PageContent/PageHeader), loading-state,
│   │   │                         #   empty-state, status-badge, coin-mark, marker-swatch, seat-meter
│   │   └── ui/                   # shadcn/ui (radix-vega), restyled to docs/DESIGN.md
│   ├── features/                 # domain slices
│   │   ├── booking/
│   │   │   ├── server/           # schema → repository → service → router (+ tests)
│   │   │   └── components/       # booking-view.tsx, booking-detail-view.tsx
│   │   ├── roster/               # server/ (rosters are read-only) + components/roster-view.tsx
│   │   ├── payment/server/payment.gateway.ts   # mock authorize / capture / void
│   │   └── demo/server/          # demo.seed.ts (the one dataset) + personas & reset
│   ├── hooks/use-persona.ts      # per-tab "acting as" store
│   ├── lib/
│   │   ├── db/prisma.ts              # PrismaClient + better-sqlite3 adapter
│   │   ├── db/write-transaction.ts   # the only way to write (single-connection rule, SQLITE_BUSY retry)
│   │   ├── db/constraints.test.ts    # proves the DB constraints by bypassing the app
│   │   ├── trpc/client.ts            # typed tRPC React client, TRouterInputs/TRouterOutputs
│   │   ├── constants.ts              # values shared by browser and server (x-demo-user header)
│   │   ├── utils/api-response.ts     # the apiResponse envelope
│   │   ├── utils/format.ts           # dates and money
│   │   └── utils.ts                  # cn(), taught the design-system tokens
│   ├── providers/                # index.tsx → trpc/index.tsx (React Query + tRPC client)
│   ├── server/
│   │   ├── trpc.ts                   # init, public/parent/staff procedures, DomainError → tRPC code
│   │   ├── context.ts                # x-demo-user → session user, plus ctx.prisma
│   │   ├── errors.ts                 # DomainError + code mapping
│   │   ├── routers/_app.ts           # root router
│   │   └── api.test.ts               # API/HTTP-level tests
│   ├── test/                         # global-setup.ts (throwaway DB), helpers.ts (seed, invariants, callers)
│   └── generated/prisma/             # generated Prisma client (git-ignored; `npm install` creates it)
├── vitest.config.ts
├── prisma.config.ts
└── package.json                  # scripts: setup, dev, demo, test, test:multiprocess, verify
```

## Layer suffix rules

Four suffixes per slice. A `*.types.ts` layer isn't needed at this size.

| Suffix | Purpose | Dependencies allowed |
|---|---|---|
| `*.schema.ts` | Zod input validation; declares the `T*` input types | Zod only |
| `*.repository.ts` | Every Prisma statement, as `(prisma: TPrisma) => ({ … })`. The client is injected, so the same methods run on the root client and inside a transaction | Prisma client, types |
| `*.service.ts` | Business logic, authorization checks, orchestration — the race lives here. Plain functions: no tRPC, no `apiResponse` | Repositories, gateway, errors |
| `*.router.ts` | Transport: procedure type (`publicProcedure` / `parentProcedure` / `staffProcedure`), input schema, one call into the service, `apiResponse()` | Services, schemas, tRPC |

**Why the split falls here.** The line that earns its keep is between transport and logic: a service is plain
functions, so the race tests, `npm run demo` and the multi-process race call `start()` and `pay()` directly — no
tRPC caller, no context, no envelope to unwrap. A separate layer that only declared procedures and forwarded to
the logic would add a hop without adding a decision, so the router does both: it validates, picks the procedure
type, calls the service once and wraps the result.

## Conventions

- **Feature slices are vertical:** `server/` holds the layers, `components/` the views (`*-view.tsx`, default export).
- **Only the router knows about tRPC.** A service can be called from a script, a job or a test without a transport.
- **Types are prefixed `T`** (`TStartBookingInput`, `TRouterOutputs`, `TPrisma`).
- **Every response is an `apiResponse` envelope** (`{ success, message, code, data }`); errors carry the same
  fields plus `domainCode`, so clients read `response.data` on success and `error.data.domainCode` on failure.
- **Writes only through `writeTransaction()`**; never call the payment gateway inside a transaction.
- **Rule violations throw `DomainError`**; payment outcomes are booking states, not errors.
- **Tests sit next to the layer they cover** and run against real SQLite on a throwaway file.
- **UI uses design tokens only.** `globals.css` clears Tailwind's default palette, type scale, radii and shadows, so only [DESIGN.md](DESIGN.md) values exist (`text-caption`, `bg-card`, `rounded-cards`…). New shadcn components go through `npx shadcn add`, then get restyled to the tokens and their `cn` import switched from `"cn"` to `@/lib/utils` (the configured one).

## Choices worth naming

| Choice | Why |
|---|---|
| SQLite via `adapter-better-sqlite3`, not Postgres | a reviewer runs it with `npm install`; the design ports over unchanged ([ARCHITECTURE §6](ARCHITECTURE.md#6-sqlite-specifics-and-writetransaction)) |
| A committed migration + `prisma migrate deploy`, not `migrate dev` | the schema is reproducible, including the hand-written `CHECK` constraints |
| Per-tab demo identity, not real auth | out of scope for the brief; the procedure pattern (`parentProcedure` / `staffProcedure`) is the same one real auth would use |
| Status transitions, no soft deletes | a booking's history *is* the audit trail: a failed attempt stays as a row |
| Tests against real SQLite, not a mocked Prisma | the invariants under test are concurrency ones; a mock cannot prove them |
| shadcn/ui restyled to the design system, three pages, top nav | three screens don't need a sidebar, and the brief weights backend over frontend polish |
