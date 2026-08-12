# Changelog

All notable changes to Smart Restaurant Campus will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### ⚡ Fixed — Queries that would have stalled a busy restaurant (2026-08-11)

**403 tests, 1383 assertions, all green on PostgreSQL.**

- **Every "today" query defeated its own index.** `whereDate('paid_at', …)`
  compiles to `date(paid_at) = ?`, and PostgreSQL cannot use an index on a column
  it must transform first — so today's takings, today's orders, today's
  attendance and five more all became sequential scans on the tables that grow
  fastest. Replaced with half-open ranges on the raw column.
- **…and they were computing the wrong day.** Every tenant carries a `timezone`
  and a `business_day_starts_at`; **neither was ever read**. "Today" meant a UTC
  calendar day, so a bill settled at 02:00 in Tashkent landed on the previous
  day's Z-report and the 06:00 trading boundary was ignored entirely. New
  `App\Support\Tenancy\BusinessDay` computes the window in the restaurant's own
  time, and every scope goes through it.
- **The database and the application disagreed about what time it was.**
  PostgreSQL's session timezone defaulted to the server's — `Asia/Tashkent` here
  — while Laravel writes naive UTC. Any SQL comparing a column against `now()`
  was five hours out, and would be out by a different amount on a different
  server. The connection now pins `UTC`, and an architecture test asserts the two
  clocks agree.
- **The QR menu hit the database for every guest.** The busiest endpoint on the
  platform, with no login in front of it, rebuilt the whole menu per request. Now
  cached per restaurant × channel × language with version-counter invalidation, so
  a repricing still reaches the table instantly, and served with an ETag so a
  returning phone gets `304` instead of the payload again.
- **Two dashboards counted in PHP what the database could count.** Stock value
  hydrated every ingredient to sum an accessor; the kitchen display loaded every
  open ticket to filter on `is_late`. Both are now single queries.
- Architecture tests now refuse `whereDate`, raw SQL using `now()`, and any
  connection that is not PostgreSQL.

### 🧱 Added — `restaurant:make-module` (2026-08-11)

`php artisan module:make` produces a module that fails this codebase's
architecture suite immediately: no schema, no tenant scoping, no permission
middleware, no registry metadata, no tests — and it says nothing about the six
files that must be edited _outside_ the module folder.

`php artisan restaurant:make-module Delivery --icon=truck --uz=… --ru=… --en=…`
scaffolds a module that passes, and registers it in all six: its own schema
migration, `search_path`, `ModuleBoundaryTest::MODULE_SCHEMAS`, the RBAC seeder,
`modules_statuses.json`, and the Composer autoloader. Verified end to end by
generating a module, migrating, and running the full suite against it.

Also: the module registry tests no longer hard-code "11 modules" — they count
from the registry, so a twelfth module does not break three unrelated tests.

### ⬆️ Changed — Frontend on the latest stable (2026-08-11)

Next.js 16.3.0, React 19.2.8, **Tailwind CSS 4.3.3**, ESLint 10.8.1,
TanStack Query 5.101.4, next-intl 4.13.6, typescript-eslint 8.67.0.

TypeScript 7.0.2 was tried and **reverted**: it type-checks 3.5× faster (18.5s →
5.3s) but `typescript-eslint` has no release that supports it, so linting stops
working entirely. Revisit when typescript-eslint ships TS 7 support.

### 💥 Changed — One PostgreSQL schema per module, PostgreSQL everywhere (2026-08-11)

Fifty-four tables lived in one flat `public` schema. Now each module owns a
schema of its own, and PostgreSQL is the only supported engine — development,
tests, CI and production alike. See
[ADR-0010](docs/decisions/0010-schema-per-module.md). **362 tests, 1101
assertions, all green on PostgreSQL.**

| Schema      | Tables                                            | Schema      | Tables                                         |
| ----------- | ------------------------------------------------- | ----------- | ---------------------------------------------- |
| `public`    | Core: identity, tenancy, outbox, audit, framework | `suppliers` | suppliers, purchase orders and their lines     |
| `menu`      | categories, items                                 | `staff`     | staff members, shifts, attendance              |
| `orders`    | orders, order items                               | `finance`   | cash shifts, payments, expenses                |
| `kitchen`   | stations, tickets                                 | `crm`       | customers, loyalty, feedback                   |
| `tables`    | halls, tables, reservations                       | `telegram`  | bots, bot users, subscriptions, messages, logs |
| `inventory` | ingredients, stock movements                      | `analytics` | _reserved for projections_                     |

- **Migrations and models name their schema outright** — `Schema::create('menu.menu_items')`,
  `protected $table = 'menu.menu_items'`. `search_path` lists `public` first and
  every module schema after it, so `exists:menu_items,id` in a validation rule
  and `assertDatabaseHas('orders', …)` in a test keep working unqualified.
- **Existing databases relocate in place.** `ALTER TABLE … SET SCHEMA` moves each
  table with its indexes, constraints and sequences without copying a row. The
  migration is idempotent, so a fresh database passes straight through it.
- **The architecture tests enforce the layout**: a module creating a table
  outside its own schema, a model with no `$table`, a schema missing from
  `search_path`, or a connection that is not PostgreSQL all fail the build.
- **`php artisan db:setup`** creates the working and test databases, so a fresh
  clone gets a usable error path instead of a connection failure.
- **`php artisan db:annotate`** now reports module → schema → tables and writes
  the owner onto each table as a PostgreSQL comment.

### 🐛 Fixed — A CRM query that could only ever work on SQLite (2026-08-11)

`Customer::scopeBirthdayToday()` called `strftime('%m-%d', birthday)` — a SQLite
function that does not exist in PostgreSQL. Every birthday-marketing query would
have failed in production with `undefined function`. It never showed up because
the suite ran on SQLite and production ran on PostgreSQL.

Rewritten with `extract(month …)` / `extract(day …)`, which PostgreSQL can also
answer from the existing `(tenant_id, birthday)` index instead of formatting a
string per guest. Moving the tests to PostgreSQL is what surfaced it, and is why
the engines are now the same everywhere.

### Added — The foundation the 10 modules stand on (2026-08-11)

Ten modules existed with no way to sign in, no way to know what a person could
do, no way to read the audit trail they were all writing, and no way for one to
talk to another without importing its models. **349 backend tests, 1050
assertions, all green.**

| Piece                  | What it does                                                                                       |
| ---------------------- | -------------------------------------------------------------------------------------------------- |
| **Auth**               | Register (restaurant + owner in one transaction), login by email or phone, logout, `me`, `context` |
| **Locale**             | `X-Locale` → the user's saved language → `Accept-Language` → the restaurant → the app default      |
| **Module registry**    | `GET /api/v1/modules` — every client builds its navigation from this instead of hard-coding one    |
| **Audit trail**        | `GET /api/v1/audit` — read-only, tenant-scoped, filterable by module, event, person and date       |
| **Event bus**          | Transactional outbox: `orders.paid` reaches CRM without either module knowing the other exists     |
| **Core contracts**     | `App\Contracts\Menu\MenuCatalog` — Orders and the bots read the menu without importing it          |
| **Architecture tests** | Module boundaries, `tenant_id` coverage, event naming and strict types, all enforced in CI         |
| **Health**             | `/api/health`, `/health/live`, `/health/ready` and `php artisan health:check` for FPM pods         |
| **Installation**       | `db:seed` now produces 11 signed-in-able accounts; `restaurant:create-owner` onboards a real venue |

### 🔒 Fixed — Cross-tenant reads through route-model binding (2026-08-11)

Laravel runs `SubstituteBindings` before route middleware by default, so
`/api/v1/menu/items/{item}` loaded the dish **before any restaurant had been
resolved**. With no tenant in context the `BelongsToTenant` global scope
filtered nothing, and any signed-in user could read — and with a `PATCH`,
rewrite or delete — a competitor's row by guessing an integer. List endpoints
were always filtered, which is why this looked isolated and was not.

`bootstrap/app.php` now states the middleware priority explicitly, with
`ResolveTenant` above `SubstituteBindings`. `tests/Feature/TenantIsolationTest`
covers reads, writes, deletes and the ordering itself.

Also fixed in the same pass:

- **`ResolveTenant` accepted any `X-Tenant`.** A user of restaurant A could ask
  for restaurant B's data and get it. A user is now pinned to their own
  restaurant; a mismatched header is `403 TENANT_MISMATCH`.
- **`tg_subscriptions` had no `tenant_id`** — the one Telegram table the
  original tenancy migration missed. A broadcast to "everyone subscribed to
  orders.ready" would have reached a competitor's guests.
- **`migrate --seed` produced data nobody could see.** `WithoutModelEvents`
  muted `BelongsToTenant`, so all 34 dishes, 25 bills and 24 tables landed with
  `tenant_id = null`. Seeding now establishes the tenant context and suppresses
  only activity logging, which is what the trait was really wanted for.
- **`migrate --seed` produced no users at all** — a fully stocked demo
  restaurant with no way to log into it.
- **The bot menu endpoint never checked its bot key**, so a misconfigured key
  served whichever restaurant the `X-Tenant` header named.

### Added — All 10 Phase-1 modules implemented (2026-08-10)

The nine remaining skeletons became working modules, each following the shape
`Modules/Menu` established. **190 backend tests, 591 assertions, all green.**

| Module        | Tables                                                 | Notable behaviour                                                                                                                                                                                         |
| ------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tables**    | `halls`, `restaurant_tables`, `reservations`           | Seating a reservation flips the table to occupied in the same call, so the floor map cannot be left lying                                                                                                 |
| **Orders**    | `orders`, `order_items`                                | Prices, names and stations are **snapshotted** onto the line — repricing the menu tomorrow never rewrites a bill from today. Paid bills are immutable                                                     |
| **Kitchen**   | `kitchen_stations`, `kitchen_tickets`                  | One ticket per station (grill and bar work in parallel); re-dispatching an edited order updates the ticket in place instead of printing a duplicate; a ticket that is already out is never flagged "late" |
| **Inventory** | `ingredients`, `stock_movements`                       | The running balance moves only through a movement row, in one transaction — balance and history can never diverge. Stock cannot go negative; a write-off must carry a reason                              |
| **Suppliers** | `suppliers`, `purchase_orders`, `purchase_order_items` | Receiving a delivery is the single place a purchase becomes stock and debt, and it refuses to run twice                                                                                                   |
| **Staff**     | `staff_members`, `shifts`, `attendances`               | Minutes worked are frozen at check-out, so a later rate change cannot rewrite past pay. A second check-in is refused                                                                                      |
| **Finance**   | `cash_shifts`, `payments`, `expenses`                  | The Z-report derives expected cash server-side and compares it to the count; payments are refunded, never deleted; only one till may be open                                                              |
| **CRM**       | `customers`, `loyalty_transactions`, `feedbacks`       | Points cannot be overdrawn; the ledger always equals the balance; tier follows lifetime spend                                                                                                             |
| **Analytics** | — (read-only)                                          | Dashboard, daily sales (closed days as explicit zeros), ABC classes, food cost (uncosted dishes report `null`, not a fake 100% margin), channels, peak hours                                              |

- **Money stays an integer in tiyin everywhere**; stock quantities are integers
  in grams / millilitres / pieces for the same reason.
- Cross-module references are **plain IDs without foreign keys** — modules own
  their own schema — with denormalised snapshots where history matters.
- `DatabaseSeeder` now boots a complete demo restaurant (menu, floor plan,
  stations, store, suppliers, team, guests, till, a day of orders), and
  `SeedingSmokeTest` runs it end to end so `migrate --seed` can never silently
  break.
- **`packages/sdk`**: one typed client per module plus `createApi()`; module
  clients never import each other, mirroring the backend boundary.

### Fixed — toolchain and lint (2026-08-10)

- `pnpm lint` crashed on every run: `eslint-plugin-react` defaults to
  `version: "detect"`, and its detection calls `context.getFilename()`, removed
  in ESLint 10. Pinned the React version in the flat configs — **config-only,
  no dependency change** — which surfaced 26 real lint errors that were then
  fixed (23 unescaped apostrophes in Uzbek JSX text, an `<a>` where a `<Link>`
  belonged, and `setState` inside an effect in both theme providers, replaced
  with a lazy initialiser that also removes the theme flash on load).
- Stale `.next` build caches still referenced the deleted university routes and
  broke `tsc`; build artifacts are now cleared as part of verification.

### 💥 Changed — Domain conversion: Smart Campus → Smart Restaurant Campus (2026-08-10)

The platform is no longer a university product. Every layer was rewritten for
restaurants, cafés and canteens. This is a breaking change to _everything_:
module names, roles, routes, database schema, bots and branding.

**Backend (`apps/api/`)**

- **Removed** the 10 university modules: `HR`, `Students`, `Online`, `EDMS`,
  `RTTM`, `Psychology`, `Exams`, `Library`, `Media`, `KPI`
- **Added** the 10 restaurant modules: `Menu`, `Orders`, `Kitchen`, `Tables`,
  `Inventory`, `Suppliers`, `Staff`, `Finance`, `Crm`, `Analytics`
- **`Modules/Menu` fully implemented** as the canonical pattern every other
  module copies: `MenuCategory` + `MenuItem` models, migrations with `tenant_id`,
  factories with real Uzbek dishes, form requests, API resources, controllers
  with Spatie QueryBuilder, RBAC routes, a guest-facing QR-menu endpoint, a
  seeder with a real 8-category / 32-dish menu, and 37 feature tests
- **RBAC rewritten** — 15 restaurant roles (`owner`, `brand-manager`,
  `branch-manager`, `chef`, `cook`, `waiter`, `bartender`, `cashier`, `host`,
  `courier`, `storekeeper`, `accountant`, `marketer`, `super-admin`, `guest`)
- **Money is now an integer in tiyin** (1 UZS = 100 tiyin) — no floats anywhere
  near a bill
- **Multilingual content** via jsonb `{uz, ru, en}` + new
  `App\Models\Concerns\HasTranslations`
- Broadcast channels rewritten: `tenant.{id}.{kitchen,floor,cashdesk,management}`
- `Tenant` no longer references a module model; a tenant is one restaurant
  business, and `settings` carries currency, service charge, VAT and the
  business-day boundary

**Fixed (pre-existing defects found during the conversion)**

- `bootstrap/app.php` called `throttleApi()` but no `api` rate limiter was ever
  registered — **every API request died** with "Rate limiter [api] is not
  defined". Registered `api`, `public` and `auth` limiters in `AppServiceProvider`
- `phpunit.xml` had no suite covering `Modules/*/tests`, so per-module tests were
  collected by nobody and "passed" by never running. Added a `Modules` suite
- `apps/telegram-bots` `normalize_e164()` prefixed every input with `+` before
  parsing, so a national number like `901234567` became `+901234567` instead of
  `+998901234567` — staff could never be linked by phone. `mask_phone()` sliced
  at a hard-coded offset and produced `+998901 *** ** 67`
- `lint-staged` pointed at a PHP binary too old for the locked dependencies

**Frontend**

- `apps/web` — 10 university pages replaced with the restaurant module pages;
  sidebar regrouped by how a shift actually runs (Xizmat / Taomnoma / Boshqaruv);
  dashboard now shows revenue, orders, average cheque, occupied tables,
  stop-list and low stock
- `apps/admin` — tenants page is now "Restoranlar", module registry and
  integrations list rewritten (fiscal module, Payme/Click/Uzum, aggregators)
- Brand colour moved from a university blue to a warm terracotta
- npm scope renamed `@campus/*` → `@restaurant/*`

**Telegram (50 bots)**

- Registry rewritten: 10 live bots (`guest`, `waiter`, `kitchen`, `courier`,
  `manager`, `owner`, `loyalty`, `reservation`, `feedback`, `supplier`) and 40
  planned across operations, marketing, delivery, finance, per-branch and
  per-concept groups
- `student.py` / `parent.py` replaced by `guest.py` / `waiter.py`
- Bot folders `faculty/` → `branch/`, `department/` → `concept/`
- Guest-facing bots no longer demand a phone number before showing the menu

**AI services**

- Removed `antiplagiat` and `dropout`; added `demand_forecast` (with prep-list),
  `food_vision` (dish recognition, plating and hygiene checks) and
  `review_sentiment`
- `chatbot` retargeted to an AI menu assistant that can only recommend dishes
  that are actually sellable; `face_recognition` narrowed to staff attendance

**Infrastructure & docs**

- All identifiers renamed: DB `restaurant_campus`, network `restaurant-net`,
  containers `restaurant-*`, bucket `restaurant-campus`, domain
  `restaurant-campus.uz`
- `HEMIS` integration replaced with the fiscal module (O'zbekiston online cash
  register) and delivery aggregators; E-IMZO kept for supplier contracts
- `docs/CAMPUS_30_MODULLAR.md` → `docs/RESTAURANT_30_MODULLAR.md` (fully
  rewritten 30-module restaurant specification)
- `docs/modules/01-hr.md` → `docs/modules/01-menu.md` (canonical module spec)

### Added — Telegram subsystem refactor (2026-05-25)

- **Python (`apps/telegram-bots/`)**:
  - Split monolithic `keyboards/__init__.py` and `states/__init__.py` into per-bot files (`keyboards/{common,student,parent}.py`, `states/onboarding.py`); `__init__.py` files now do re-exports only — scales cleanly to 50 bots
  - New shared layers: `core/exceptions.py` (CampusBotError hierarchy), `core/fsm_storage.py` (Redis FSM builder), `handlers/common.py` (`/help`, `/cancel` builders), `handlers/errors.py` (global error handler), `services/{notifications,analytics}.py`, `filters/{role,linked}.py`, `models/{dto,enums}.py`, `utils/{phone,format,webapp}.py`, `middlewares/{auth,feature_flags}.py`, `bots/_base.py` (`build_base_router`)
  - New `bots/{phase1,phase2,ai,faculty,department}/` subdirectories with `__init__.py` + `README.md` for future bot handlers — `bot_manager._load_router` auto-discovers any of the 5 paths
  - `core/bot_manager.py` rewired: 5-path import lookup, AuthMiddleware + FeatureFlagMiddleware wired, global error handler registered, `bot._campus_bot_key` tag set for middleware lookups
  - `locales/` placeholder for future Babel-based aiogram-i18n migration
  - 3 new test files: `test_utils_phone.py`, `test_utils_format.py`, `test_bot_manager.py` (path discovery)
- **Laravel (`apps/api/Modules/TelegramBots/`)**:
  - `config/config.php` now exposes `internal_token`, `bots_service_url`, `channels` (9 default opt-ins), `outbound` defaults — previously a config gap caused 500s
- **Admin UI (`apps/admin/src/app/(admin)/telegram/`)**:
  - New per-bot dynamic route `[botKey]/{page,settings,users,messages,commands,broadcast}` (6 pages)
  - New global subroutes: `settings`, `audit`, `users`, `users/[id]`, `messages`, `subscriptions` (6 pages)

### Added — Real HR module (2026-05-25)

- Replaced HR scaffold with production-grade implementation:
  - `Employee` model (LogsActivity + SoftDeletes + encrypted face_descriptor + accessors + scopes)
  - `EmployeeController` with Spatie QueryBuilder (filter[search/department/faculty/status/contract_type], sort, include=user, paginate)
  - `StoreEmployeeRequest` / `UpdateEmployeeRequest` with Uzbek validation messages
  - `EmployeeResource` (hides sensitive fields, conditional user include)
  - Migration: `employees` table (18 columns, 3 indexes, soft deletes, encrypted face_descriptor TEXT)
  - Factory + 3 states (`onLeave`, `terminated`, `withLinkedUser`)
  - `HRDatabaseSeeder` — 33 sample employees (25 active + 5 on leave + 3 terminated)
  - `HRController` rewritten as module info endpoint (counts + endpoint discovery)
  - Routes: `/api/v1/hr` + `/api/v1/hr/employees` (REST) — each gated by Spatie `PermissionMiddleware::using('hr.{action}')`
  - **13 feature tests** in `EmployeeControllerTest` covering auth/RBAC/CRUD/validation/search/pagination/soft-delete
- New module spec: `docs/modules/01-hr.md` (full spec per template — first real `docs/modules/NN-name.md` doc)

### Added — Frontend polish (2026-05-25)

- `apps/web/src/app/page.tsx` and `apps/admin/src/app/page.tsx` no longer the create-next-app default — both redirect to `/dashboard`
- Real login form at `apps/web/src/app/(auth)/login/page.tsx` — react-hook-form + zod + Sanctum SPA flow, toast feedback, disabled state while submitting

### Added — Initial scaffold

- Monorepo: `apps/{web,admin,api,ai-services,mobile,telegram-bots}` and `packages/{ui,types,config,i18n,utils,sdk}`
- Root configuration: `.gitignore`, `.editorconfig`, `.prettierrc.json`, `.env.example`, `tsconfig`, Turborepo, pnpm catalog
- Docker Compose for local dev (Postgres 16, Redis 7, ClickHouse, MinIO, Keycloak 26, Mailpit, Meilisearch, +3 monitoring)
- Documentation skeleton (`docs/`) with architecture, modules, decisions, deployment folders
- Infrastructure folder with 4 multi-stage Dockerfiles, Nginx config with rate limits + admin subdomain, Prometheus, backup/deploy/setup-server scripts
- CI workflow (`.github/workflows/ci.yml`) — 3-stack matrix (TS lint/test/build, Laravel migrate/test, Python ruff/mypy/pytest)
- 6 ADRs covering: ADR culture, Laravel choice, hybrid monorepo, modular monolith, separate super admin, telegram multi-bot

### Phase 1 modules

- ✅ **HR** — Employee model + REST API + 13 tests (real implementation)
- ⏳ Students, Online Platform, EDMS, RTTM, Psychology, Exams, Library, Media, KPI (scaffolds; HR template applies)

---

[Unreleased]: https://github.com/<owner>/smart-restaurant-campus/compare/v0.0.0...HEAD
