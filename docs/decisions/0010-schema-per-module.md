# ADR-0010: One PostgreSQL schema per module, PostgreSQL everywhere

**Status:** accepted
**Date:** 2026-08-11
**Decision makers:** Project owner
**Supersedes in part:** [ADR-0007](0007-single-database-tenancy.md) — the single database stands; its internal layout changes.

## Context

The platform is a modular monolith with eleven modules today and thirty planned,
serving many restaurants from one database. Until now every table lived in
PostgreSQL's `public` schema: fifty-four tables in one flat list, with nothing in
the database itself saying which module owned what.

Two problems followed from that, and one from a related decision:

1. **The database did not reflect the architecture.** Module boundaries were
   enforced in code — `tests/Architecture/ModuleBoundaryTest` refuses a
   cross-module import, a raw query against another module's table, even an
   `exists:their_table,id` validation rule — but an operator opening pgAdmin saw
   an undifferentiated pile. Onboarding, code review and incident response all
   paid for that.

2. **There was nowhere to hang per-module database privileges.** At scale the
   analytics worker should read Orders and Finance and nothing else; a reporting
   replica should not be one `GRANT` away from the till. Object-level grants
   across fifty-four tables are unmanageable; schema-level grants are one line.

3. **Tests ran on SQLite while production ran on PostgreSQL.** This had already
   cost the project real bugs. Moving the suite to PostgreSQL immediately
   surfaced one that had been sitting in `Modules/Crm`: the "birthday today"
   scope called `strftime()`, a SQLite function that does not exist in
   PostgreSQL. Every guest-birthday query would have failed in production.

## Decision

**One PostgreSQL schema per module, and PostgreSQL as the only supported engine
— development, tests, CI and production alike.**

| Schema      | Owner        | Tables                                                                          |
| ----------- | ------------ | ------------------------------------------------------------------------------- |
| `public`    | Core         | identity, tenancy, event outbox, audit, framework, packages                     |
| `menu`      | Menu         | `menu_categories`, `menu_items`                                                 |
| `orders`    | Orders       | `orders`, `order_items`                                                         |
| `kitchen`   | Kitchen      | `kitchen_stations`, `kitchen_tickets`                                           |
| `tables`    | Tables       | `halls`, `restaurant_tables`, `reservations`                                    |
| `inventory` | Inventory    | `ingredients`, `stock_movements`                                                |
| `suppliers` | Suppliers    | `suppliers`, `purchase_orders`, `purchase_order_items`                          |
| `staff`     | Staff        | `staff_members`, `shifts`, `attendances`                                        |
| `finance`   | Finance      | `cash_shifts`, `payments`, `expenses`                                           |
| `crm`       | Crm          | `customers`, `loyalty_transactions`, `feedbacks`                                |
| `telegram`  | TelegramBots | `tg_bots`, `tg_bot_users`, `tg_subscriptions`, `tg_messages`, `tg_command_logs` |
| `analytics` | Analytics    | _(reserved for projections and materialised views)_                             |

### How it is wired

- **Migrations name the schema outright**: `Schema::create('menu.menu_items', …)`.
- **Models name it too**: `protected $table = 'menu.menu_items';`.
- **`search_path` lists `public` first, then every module schema.** `public`
  first means a package migration that creates a table without qualifying it
  lands in the platform's own space rather than inside a module. The module
  schemas following means an unqualified reference still resolves, so
  `exists:menu_items,id` in a validation rule and `assertDatabaseHas('orders', …)`
  in a test keep working without every call site learning the layout.
- **Existing databases relocate in place.** `2026_08_11_140000_move_module_tables_into_their_schemas`
  runs `ALTER TABLE … SET SCHEMA`, which moves the table with its indexes,
  constraints and owned sequences and without copying a row. It is idempotent, so
  a database built from scratch passes straight through it.

### What this does _not_ change

**Tenant isolation is unaffected.** One restaurant not seeing another's data is
row-level — `tenant_id` plus the `BelongsToTenant` global scope — and always was.
Schemas namespace _modules_, not tenants. Schema-per-tenant was considered and
rejected in ADR-0007 and remains rejected: at the scale this platform targets it
would mean tens of thousands of schemas and a migration run that never finishes.

## Consequences

**Good**

- The database shows the architecture. `pgAdmin → Schemas` is the module list.
- Per-module `GRANT` becomes possible the day a read-only reporting role is needed.
- Extracting a module to its own service is now a `pg_dump --schema=orders`
  rather than a table-by-table archaeology exercise.
- Tests exercise the same engine, the same schema layout and the same SQL
  dialect as production. The `strftime()` bug is the class of defect this ends.
- `ModuleBoundaryTest` enforces the layout: a module creating a table outside its
  own schema, a model with no `$table`, or a schema missing from `search_path`
  all fail the build.

**Costs, accepted**

- **Tests need a live PostgreSQL.** The suite went from ~1m35s on in-memory
  SQLite to ~3m on PostgreSQL, and a developer must have the server running.
  Both are worth paying to test the real thing.
- **Every model must declare its table.** Eloquent's convention would put it in
  `public`. Enforced by test rather than left to memory.
- **Raw SQL must qualify or rely on `search_path`.** psql and pgAdmin sessions do
  not inherit the application's `search_path`, so ad-hoc queries need
  `menu.menu_items` or a `SET search_path` of their own.
- **A twelfth module means two edits**: a line in the schemas migration and a
  line in `ModuleBoundaryTest::MODULE_SCHEMAS`. The test fails until both exist.

## Alternatives considered

**Keep everything in `public`.** Simplest, and what the platform did. Rejected:
it leaves no place for per-module grants and no way to read the architecture off
the database, which matters more as the module count triples.

**A separate database per module.** Real isolation, and the eventual destination
for any module that becomes its own service. Rejected for now: it forfeits
cross-module transactions and foreign keys immediately, in exchange for autonomy
nothing needs yet. The event outbox (ADR-0008) is the seam that makes this move
cheap when a module actually warrants it.

**Table-name prefixes instead of schemas** (`menu_`, `orders_`). No server-side
meaning, no grants, and PostgreSQL still shows one flat list. Rejected.
