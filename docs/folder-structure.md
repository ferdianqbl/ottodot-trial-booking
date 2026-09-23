# Folder Structure

Same layering as my boilerplate starter (`architecture.md` there): feature slices with strict layer suffixes,
`components/{layout,shared,ui}`, `providers/`, `hooks/`, and an `api/v1` tRPC gateway.

```
workspace/
├── README.md                     # how to run, design summary, verification — start here
├── docs/                         # PRD, ARCHITECTURE, FEATURE_LIST, DESIGN, folder-structure, AI_USAGE
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
│   │   │   ├── server/           # schema → repository → handlers → service → router (+ tests)
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

Same table as the starter; `*.types.ts` isn't needed at this size.

| Suffix | Purpose | Dependencies allowed |
|---|---|---|
| `*.schema.ts` | Zod input validation; declares the `T*` input types | Zod only |
| `*.repository.ts` | Every Prisma statement, as `(prisma: TPrisma) => ({ … })`. The client is injected, so the same methods run on the root client and inside a transaction | Prisma client, types |
| `*.handlers.ts` | Business logic, authorization checks, orchestration — the race lives here | Repositories, gateway, errors |
| `*.service.ts` | tRPC procedure declarations (`publicProcedure` / `parentProcedure` / `staffProcedure`), wrapping results in `apiResponse()` | Handlers, schemas, tRPC |
| `*.router.ts` | Router instantiation spreading the service. No logic | Router helper, service |

## Conventions

- **Feature slices are vertical:** `server/` holds the layers, `components/` the views (`*-view.tsx`, default export).
- **Types are prefixed `T`** (`TStartBookingInput`, `TRouterOutputs`, `TPrisma`).
- **Every response is an `apiResponse` envelope** (`{ success, message, code, data }`); errors carry the same
  fields plus `domainCode`, so clients read `response.data` on success and `error.data.domainCode` on failure.
- **Writes only through `writeTransaction()`**; never call the payment gateway inside a transaction.
- **Rule violations throw `DomainError`**; payment outcomes are booking states, not errors.
- **Tests sit next to the layer they cover** and run against real SQLite on a throwaway file.
- **UI uses design tokens only.** `globals.css` clears Tailwind's default palette, type scale, radii and shadows, so only [DESIGN.md](DESIGN.md) values exist (`text-caption`, `bg-card`, `rounded-cards`…). New shadcn components go through `npx shadcn add`, then get restyled to the tokens and their `cn` import switched from `"cn"` to `@/lib/utils` (the configured one).

## Differences from the boilerplate starter

Only where the brief demands it:

| Starter | Here | Why |
|---|---|---|
| Postgres (`adapter-pg`) | SQLite (`adapter-better-sqlite3`) | zero-setup review; the design ports back (ARCHITECTURE §6) |
| `prisma migrate dev` | committed migration + `prisma migrate deploy` | reproducible schema including hand-written CHECKs |
| JWT auth, `proxy.ts` edge guard, `protectedProcedure` | per-tab demo identity, `parentProcedure` / `staffProcedure` | real auth is out of scope; same procedure pattern |
| Soft deletes (`deletedAt`) | hard rows, status transitions | a booking's history is the audit trail here |
| shadcn kit (emerald theme), sidebar layout | shadcn/ui restyled to the design system ([DESIGN.md](DESIGN.md)); three pages, top nav | three screens don't need a sidebar |
| mock-Prisma unit tests, Playwright | real-SQLite tests, demo and multi-process scripts | concurrency needs a real database |
