# POS moduli (12-modul) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:executing-plans`.
> Steps use checkbox (`- [ ]`) syntax for tracking.
> Spec: [`docs/superpowers/specs/2026-08-11-pos-module-design.md`](../specs/2026-08-11-pos-module-design.md)

**Goal:** Restoran / kafe / bar / fast food shaxobchalari uchun offline ishlaydigan
smart POS terminalini qurish — `Modules/Pos` (ingichka backend) + `apps/pos`
(Apple-style touch PWA), 8 rol uchun to'liq ish maydoni bilan.

**Architecture:** POS hisob va to'lovni qayta yaratmaydi. Hisob `Orders`da, pul
`Finance`da qoladi; `Pos` ularni `App\Contracts\*` shartnomalari orqali chaqiradi
va faqat terminalga tegishli narsalarga egalik qiladi (qurilma, sessiya, PIN,
tasdiq, kassa qutisi, chek, fiskal, offline sync, maket, narx qoidasi).

**Tech Stack:** PHP 8.4 / Laravel 13 / nwidart-modules / PostgreSQL 18
(`pos` schema) / Spatie Permission + Activitylog / Sanctum · Next.js 16 / React 19
/ TypeScript 5 / Tailwind v4 / TanStack Query / Zustand / next-intl / Dexie
(IndexedDB) · PHPUnit / Vitest / Playwright

## Bajarilish holati (2026-08-11)

| Task | Nima | Holat |
| --- | --- | --- |
| 1 | `pos` schema + modul skeleti + 7 ta reyestr sinxronligi | ✅ yashil |
| 2 | 13 ta `pos.*` ruxsat + 10 rolga grant | ✅ yashil |
| 3 | `pos.terminals` + ulash (kod → qurilma tokeni) + heartbeat | ✅ yashil |
| 4 | `pos.pins` + `pos.terminal_sessions`: PIN kirish, takeover, taymaut | ✅ yashil |
| 5 | `BillRegistry` + `TillLedger` shartnomalari + zaxira implementatsiyalar | ✅ yashil |
| 6 | `pos.sync_entries` idempotentligi + sotuv oqimi (`BillController`) | ✅ yashil |
| 8 | Aralash to'lov, qaytim, yaxlitlash (`TenderService`) | ✅ yashil |
| 9 | `pos.approvals` — menejer tasdig'i darvozasi | ✅ yashil |
| 10 | `pos.drawer_movements` + X/Z hisobot | ✅ yashil |
| 14–18 | `apps/pos` — Apple-style terminal, 8 rol ish maydoni, offline outbox | ✅ yashil |
| 19 | Hujjatlar (`docs/modules/12-pos.md`, ADR-0011, CLAUDE.md) | ✅ yashil |
| 7 | Narx qoidalari (happy hour, kanal narxi) | ⬜ navbatda |
| 11–13 | Printerlar (ESC/POS), fiskal/OFD, maket + offline snapshot | ⬜ navbatda |

**Qamrov:** backend — 7 jadval, 8 kontroller, 6 servis, 2 shartnoma, ~30
endpoint. Frontend — `apps/pos`, 19 marshrut, 8 rol ish maydoni.

**Oxirgi tekshiruv:**

| Buyruq | Natija |
| --- | --- |
| `php vendor/bin/phpunit` | **519 test / 1830 tasdiq — OK** (POS'dan oldin 386) |
| `vendor/bin/pint --test` | passed |
| `pnpm type-check` | 8/8 |
| `pnpm lint` | 3/3 |
| `pnpm format:check` | toza |
| `pnpm --filter @restaurant/pos build` | 19 marshrut |

**Yo'lda topilgan va tuzatilgan xatolar:**

1. `Rule::unique('pos.terminals')` — Laravel nuqtani *ulanish*.jadval deb o'qiydi;
   yalang'och nom + `search_path` kerak.
2. `TerminalPairing::issueCode` eskirgan model ustida `save()` qilganda
   `pairing_expires_at` "dirty" bo'lmay, bazada `NULL` qolar edi.
3. `Terminal` `Authenticatable` emas edi — `throttle` middleware'i undan
   `getAuthIdentifier()` so'rab 500 berardi.
4. Testda Sanctum'ning `RequestGuard` i foydalanuvchini keshlaydi — guard
   tozalanmasa ikkinchi so'rov birinchisining tokeni bilan ketadi.
5. `ResolveTenant` so'rov oxirida kontekstni tozalaydi — testda HTTP chaqiruvdan
   keyin yaratilgan fixture'lar `tenant_id` siz qolib, global scope ularni
   yashiradi.

**Muhit eslatmasi:** testdan oldin `tinker`/`psql` seansini yoping — ochiq
ulanish `migrate:fresh` ning `DROP … CASCADE` si bilan deadlock beradi va
testlar tasodifan yiqiladi. Bu POS'ga aloqasi yo'q, oldindan mavjud xususiyat.

---

## Global Constraints

- **Mavjud kodga tegilmaydi.** Faqat yangi fayl qo'shish yoki mavjud ro'yxatga
  bitta qator qo'shish mumkin. `CashShift::close()`, `Payment::METHODS`,
  `Expense::CATEGORIES`, mavjud migratsiyalar va mavjud testlar **o'zgarmaydi**.
- **Pul — tiyinda `int`.** Hech qayerda float yo'q. 1 UZS = 100 tiyin.
- **Har bir biznes jadvalida `tenant_id`**, har bir modelda `BelongsToTenant`.
- **Har bir model `protected $table = 'pos.<name>';`** deb yozadi.
- **`declare(strict_types=1)`** har bir PHP faylida.
- **`whereDate` / `whereMonth` / `whereYear` / `whereTime` taqiqlangan** —
  `App\Support\Tenancy\BusinessDay` ishlatiladi.
- **Xom SQL ichida `now()` taqiqlangan** — vaqt PHP'dan bind qilinadi.
- **`dd`, `dump`, `var_dump`, `ray` qoldirilmaydi.**
- **Domain event nomi `pos.past_tense`** ko'rinishida (`pos.shift_opened`).
- **Marshrutlar `v1/pos` prefiksi ostida**, `auth:sanctum` + `tenant` middleware.
- **Foydalanuvchiga ko'rinadigan matn uz/ru/en** — jsonb yoki `@restaurant/i18n`.
- **PHP:** `C:\Users\User\php8424\php.exe`. Bash'da:
  `export PATH="/c/Users/User/php8424:$PATH"`.
- **Testlar PostgreSQL talab qiladi** (`restaurant_campus_test`), SQLite emas.

**Har bosqichdan keyin ishga tushadigan tekshiruv:**

```bash
export PATH="/c/Users/User/php8424:$PATH"
cd apps/api && php vendor/bin/phpunit
vendor/bin/pint --test
```

---

## File Structure

### Yangi: `apps/api/app/Contracts/`

| Fayl                                                                  | Mas'uliyat                      |
| --------------------------------------------------------------------- | ------------------------------- |
| `Orders/BillRegistry.php`                                             | Hisob ustida amallar interfeysi |
| `Orders/Bill.php`, `Orders/BillLine.php`                              | O'qish uchun DTO                |
| `Orders/UnavailableBillRegistry.php`                                  | Orders o'chirilganda zaxira     |
| `Finance/TillLedger.php`                                              | Smena va to'lov interfeysi      |
| `Finance/Tender.php`, `Finance/ShiftTotals.php`                       | DTO                             |
| `Finance/UnavailableTillLedger.php`                                   | Finance o'chirilganda zaxira    |
| `Pos/Fiscalizer.php`, `Pos/FiscalRequest.php`, `Pos/FiscalResult.php` | Fiskal drayver seami            |

### Yangi: `apps/api/Modules/Pos/`

11 model → 11 migratsiya → 11 factory. Kontroller mas'uliyat bo'yicha bo'linadi
(qatlam bo'yicha emas), har biri bitta ish oqimiga egalik qiladi:

| Kontroller                                | Egalik qiladigan oqim                                         |
| ----------------------------------------- | ------------------------------------------------------------- |
| `PosController`                           | modul ma'lumoti (`GET /v1/pos`)                               |
| `TerminalController`                      | ulash, ro'yxat, sozlash, heartbeat                            |
| `PosAuthController`                       | PIN bilan kirish, PIN almashtirish, chiqish                   |
| `BillController`                          | hisob ochish, qator, chegirma, yuborish, split/merge/transfer |
| `TenderController`                        | aralash to'lov, qaytarish                                     |
| `ApprovalController`                      | tasdiq so'rovi va qarori                                      |
| `ShiftController`                         | smena ochish/yopish, X/Z hisobot                              |
| `DrawerController`                        | naqd kirim/chiqim, inkassatsiya                               |
| `PrintJobController`, `PrinterController` | chop navbati va printerlar                                    |
| `FiscalReceiptController`                 | fiskal cheklar va qayta yuborish                              |
| `LayoutController`, `PriceRuleController` | maket va narx qoidalari                                       |
| `SyncController`                          | offline replay va snapshot                                    |

Servislar (mantiq kontrollerda emas):

| Servis                               | Mas'uliyat                                      |
| ------------------------------------ | ----------------------------------------------- |
| `Services/TerminalPairing.php`       | Ulash kodi hayot sikli                          |
| `Services/PinAuthenticator.php`      | PIN tekshirish, qulflash                        |
| `Services/IdempotencyGuard.php`      | `sync_entries` orqali takrorlanishni to'xtatish |
| `Services/SellService.php`           | Hisob oqimi (BillRegistry ustida)               |
| `Services/TenderService.php`         | Aralash to'lov, qaytim, yaxlitlash              |
| `Services/ApprovalGate.php`          | Rol limiti + tasdiq talabini hal qilish         |
| `Services/DrawerService.php`         | Kassa qutisi + `TillLedger::recordCashOut()`    |
| `Services/ShiftReporter.php`         | X/Z hisobot                                     |
| `Services/PriceResolver.php`         | `price_rules` ni qo'llash                       |
| `Services/PrintQueue.php`            | Chop navbati va claim                           |
| `Services/Fiscal/NullFiscalizer.php` | Standart drayver                                |
| `Services/EloquentSnapshot.php`      | Offline uchun `GET /sync/snapshot`              |

### Yangi: `apps/pos/`

```
src/
  app/
    (boot)/pair/page.tsx           terminal ulash
    (lock)/lock/page.tsx           PIN klaviaturasi
    (till)/layout.tsx              rolga qarab navigatsiya
    (till)/sell/page.tsx           sotuv ekrani (4 rejim)
    (till)/floor/page.tsx          zal xaritasi
    (till)/bills/…                 ochiq hisoblar, split, transfer, precheck
    (till)/pay/[bill]/page.tsx     tender varag'i
    (till)/shift/…                 smena, X/Z
    (till)/drawer/page.tsx         kassa qutisi
    (back)/approvals/page.tsx      menejer navbati
    (back)/…                       terminals, live, variance, z-reports, fiscal,
                                   price-rules, stoplist, stock-impact, deliveries
  components/pos/                  Numpad, Tile, Sheet, BillPane, TenderSheet
  lib/offline/                     Dexie outbox, snapshot keshi, replay
  lib/api/                         @restaurant/sdk ustidagi POS klienti
  stores/                          Zustand: terminal, session, cart
```

---

## Bosqich 0 — Reyestr va poydevor

### Task 1: `pos` schema va modul skeleti

**Files:**

- Create: `apps/api/database/migrations/2026_08_11_000000_create_pos_schema.php`
- Create: `apps/api/Modules/Pos/module.json`, `config/config.php`,
  `app/Providers/{PosServiceProvider,RouteServiceProvider,EventServiceProvider}.php`,
  `routes/api.php`, `app/Http/Controllers/PosController.php`
- Modify (bir qator): `apps/api/modules_statuses.json`,
  `apps/api/config/database.php:147`, `.env.example:35`,
  `apps/api/tests/Architecture/ModuleBoundaryTest.php` (`MODULE_SCHEMAS`),
  `commitlint.config.mjs`, `packages/types/src/module.ts`,
  `apps/admin/src/app/(admin)/modules/page.tsx`
- Test: mavjud `tests/Architecture/ModuleBoundaryTest.php` yashil qolishi

**Interfaces:**

- Produces: `pos` PostgreSQL schema; `Modules\Pos` namespace; `GET /api/v1/pos`
  modul ma'lumotini qaytaradi; registrda `pos` kaliti uz/ru/en label va
  `credit-card` ikonasi bilan.

- [ ] **Step 1: `pos` schema migratsiyasini yozish**

`2026_08_11_000000_create_pos_schema.php` — mavjud `0000_01_01_000000` faylini
**tahrirlamaydi**, alohida migratsiya:

```php
public function up(): void
{
    if (DB::connection()->getDriverName() !== 'pgsql') {
        throw new RuntimeException('Pos requires PostgreSQL.');
    }

    DB::statement('CREATE SCHEMA IF NOT EXISTS "pos"');
    DB::statement("COMMENT ON SCHEMA \"pos\" IS 'Pos — terminal, sessiya, tasdiq, chek, fiskal'");

    $role = DB::connection()->getConfig('username');
    if (is_string($role) && $role !== '') {
        DB::statement(sprintf('ALTER SCHEMA "pos" OWNER TO "%s"', str_replace('"', '""', $role)));
    }
}

public function down(): void
{
    DB::statement('DROP SCHEMA IF EXISTS "pos" RESTRICT');
}
```

- [ ] **Step 2: `search_path` ga `pos` qo'shish**

`config/database.php:147` — standart qatorning oxiriga `,pos`. `.env.example:35`
dagi izohli qatorga ham.

- [ ] **Step 3: Modul skeletini yozish**

`module.json` (`"alias": "pos"`, `"priority": 12`), `config/config.php`
(`icon: 'credit-card'`, `group: 'operations'`, `order: 11`, `route: 'v1/pos'`,
`permission_prefix: 'pos'`, `required: false`,
`labels: {uz: 'Kassa (POS)', ru: 'Касса (POS)', en: 'POS'}`),
uchta provayder (`Modules/Menu` naqlini aynan takrorlash),
`routes/api.php` faqat `Route::get('/', [PosController::class, 'index'])` bilan.

- [ ] **Step 4: Reyestr sinxronligini yopish**

`modules_statuses.json` → `"Pos": true`;
`ModuleBoundaryTest::MODULE_SCHEMAS` → `'Pos' => 'pos'`;
`commitlint.config.mjs` scope ro'yxatiga `'pos'`;
`packages/types/src/module.ts` → `ModuleKey` ga `'pos'` va `PHASE_1_MODULES` ga
`{key:'pos', name_uz:'Kassa (POS)', name_ru:'Касса (POS)', name_en:'POS',
icon:'credit-card', order:11, enabled:true}`;
admin `modules/page.tsx` ga `{ key: 'pos', name: 'POS — Kassa terminali', enabled: true }`.

- [ ] **Step 5: Bo'sh feature test qo'shish**

`Modules/Pos/tests/Feature/PosModuleTest.php` — `GET /api/v1/pos` 200 qaytarishi
va modul registrda ko'rinishi. `test_every_module_has_tests` shuni talab qiladi.

- [ ] **Step 6: Migratsiya va test**

```bash
export PATH="/c/Users/User/php8424:$PATH"
cd apps/api && php artisan migrate && php vendor/bin/phpunit --testsuite=Architecture
```

Kutilgan: barcha arxitektura testlari PASS.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(pos): scaffold Pos module (12th) with its own pg schema"
```

---

### Task 2: Ruxsatlar va rollar

**Files:**

- Modify (qo'shish): `apps/api/database/seeders/RolesAndPermissionsSeeder.php`
- Test: `apps/api/Modules/Pos/tests/Feature/PosPermissionsTest.php`

**Interfaces:**

- Produces: `pos.view|create|update|delete|manage` +
  `pos.sell|void|discount|reopen|refund|drawer|approve|terminal`.

- [ ] **Step 1: Testni yozish (avval qizil)**

`PosPermissionsTest`:

- `cashier` → `pos.sell`, `pos.drawer` bor; `pos.approve` **yo'q**
- `waiter` → `pos.sell` bor; `pos.drawer` **yo'q**
- `branch-manager` → `pos.approve`, `pos.void`, `pos.discount` bor
- `owner` → 13 ta `pos.*` ning hammasi bor
- `chef`, `storekeeper`, `courier` → faqat `pos.view`
- `accountant` → `pos.view`, `pos.manage`

- [ ] **Step 2: Seeder'ga qo'shish**

`MODULES` massiviga `'pos'`; `SYSTEM_PERMISSIONS` naqli bo'yicha yangi
`POS_PERMISSIONS` konstantasi (8 nomli ruxsat); mavjud rol bloklaridagi `extra`
massivlariga tegishli `pos.*` qo'shish. **Mavjud qatorlar o'chirilmaydi.**

- [ ] **Step 3: Test yashil**

```bash
cd apps/api && php vendor/bin/phpunit --filter=PosPermissionsTest
```

- [ ] **Step 4: Commit** — `feat(pos): pos permissions for the eight till roles`

---

## Bosqich 1 — Terminal va identifikatsiya

### Task 3: `pos.terminals` + ulash

**Files:**

- Create: `Modules/Pos/app/Models/Terminal.php`,
  `database/migrations/2026_08_11_010000_create_pos_terminals_table.php`,
  `database/factories/TerminalFactory.php`,
  `app/Services/TerminalPairing.php`,
  `app/Http/Controllers/TerminalController.php`,
  `app/Http/Requests/{StoreTerminalRequest,UpdateTerminalRequest,PairTerminalRequest}.php`,
  `app/Http/Resources/TerminalResource.php`
- Test: `tests/Feature/TerminalPairingTest.php`, `tests/Feature/TerminalCrudTest.php`

**Interfaces:**

- Produces: `Terminal::MODES = ['table_service','quick_service','bar','counter']`,
  `Terminal::STATUSES = ['active','disabled','maintenance']`;
  `TerminalPairing::issueCode(Terminal): string`,
  `TerminalPairing::redeem(string $code, array $device): NewAccessToken`.
  `Terminal` — `HasApiTokens` (Sanctum tokenable).

- [ ] **Step 1: Testlarni yozish**

`TerminalPairingTest`:

- `test_a_pairing_code_exchanges_for_a_device_token`
- `test_a_pairing_code_works_only_once`
- `test_an_expired_pairing_code_is_refused` (422)
- `test_a_code_from_another_restaurant_is_refused` (tenant izolyatsiyasi)
- `test_the_pairing_code_never_appears_in_the_terminal_resource`

`TerminalCrudTest`: ro'yxat/yaratish/sozlash `pos.terminal` talab qiladi;
`heartbeat` `last_seen_at` ni yangilaydi va faqat qurilma tokeni bilan ishlaydi.

- [ ] **Step 2: Testlar qizil ekanini tasdiqlash**

```bash
cd apps/api && php vendor/bin/phpunit --filter=Terminal
```

- [ ] **Step 3: Migratsiya + model + servis + kontroller**

Migratsiya spec §4.1 bo'yicha. `pairing_code` — heshlangan saqlanadi va
`TerminalResource`da **hech qachon** qaytarilmaydi. Kod 6 raqamli, 10 daqiqa amal
qiladi.

- [ ] **Step 4: Testlar yashil**

- [ ] **Step 5: Commit** — `feat(pos): terminal registry and device pairing`

---

### Task 4: PIN bilan kirish va sessiya

**Files:**

- Create: `Models/{PosPin,PosSession}.php`, ikkita migratsiya, ikkita factory,
  `Services/PinAuthenticator.php`, `Http/Controllers/PosAuthController.php`,
  `Http/Requests/{PinLoginRequest,RotatePinRequest}.php`,
  `Http/Resources/PosSessionResource.php`,
  `Http/Middleware/RequireTerminalSession.php`
- Test: `tests/Feature/PinLoginTest.php`, `tests/Feature/PosSessionTest.php`

**Interfaces:**

- Consumes: `Terminal` (Task 3).
- Produces: `PinAuthenticator::attempt(Terminal $t, string $pin): ?PosSession`;
  middleware alias `pos.session`; `PosSession::closedReason` enum
  `logout|timeout|takeover|shift_close`.

- [ ] **Step 1: Testlarni yozish**

`PinLoginTest`:

- `test_a_correct_pin_opens_a_session`
- `test_a_wrong_pin_increments_failed_attempts`
- `test_five_wrong_pins_lock_the_user_for_fifteen_minutes`
- `test_a_locked_user_cannot_log_in_even_with_the_right_pin`
- `test_the_pin_is_never_returned_and_never_logged`
- `test_a_pin_from_another_restaurant_does_not_work`
- `test_pin_login_requires_a_valid_device_token`

`PosSessionTest`:

- `test_a_new_session_closes_the_previous_one_on_the_same_terminal` (`takeover`)
- `test_a_route_behind_pos_session_middleware_rejects_a_request_without_a_session` (403)

- [ ] **Step 2: Qizil ekanini tasdiqlash**

- [ ] **Step 3: Implementatsiya**

PIN `Hash::make` bilan; `failed_attempts` va `locked_until` `pos.pins`da.
`RequireTerminalSession` — so'rovda ochiq `PosSession` borligini talab qiladi va
uni `$request->attributes` ga qo'yadi.

- [ ] **Step 4: Testlar yashil**

- [ ] **Step 5: Commit** — `feat(pos): pin login, sessions and takeover`

---

## Bosqich 2 — Sotuv yadrosi

### Task 5: `BillRegistry` va `TillLedger` shartnomalari

**Files:**

- Create: `app/Contracts/Orders/{BillRegistry,Bill,BillLine,UnavailableBillRegistry}.php`
- Create: `app/Contracts/Finance/{TillLedger,Tender,ShiftTotals,UnavailableTillLedger}.php`
- Create: `Modules/Orders/app/Services/EloquentBillRegistry.php`
- Create: `Modules/Finance/app/Services/EloquentTillLedger.php`
- Modify (bir qator): `Modules/Orders/app/Providers/OrdersServiceProvider.php`,
  `Modules/Finance/app/Providers/FinanceServiceProvider.php`,
  `app/Providers/AppServiceProvider.php` (`bindIf` zaxiralar)
- Test: `Modules/Orders/tests/Feature/BillRegistryContractTest.php`,
  `Modules/Finance/tests/Feature/TillLedgerContractTest.php`

**Interfaces:**

- Produces:

```php
interface BillRegistry
{
    public function open(string $channel, ?int $tableId, ?string $tableLabel,
                         ?int $waiterUserId, ?int $customerId, int $guests): Bill;
    public function find(int $billId): ?Bill;
    public function addLine(int $billId, int $menuItemId, int $quantity,
                            ?int $unitPriceOverride, ?string $note): Bill;
    public function voidLine(int $billId, int $lineId, string $reason): Bill;
    public function applyDiscount(int $billId, int $amountTiyin, string $reason): Bill;
    public function send(int $billId): Bill;              // → in_kitchen
    public function split(int $billId, array $lineIds): Bill;   // yangi hisob
    public function merge(int $sourceBillId, int $targetBillId): Bill;
    public function transfer(int $billId, ?int $tableId, ?string $tableLabel,
                             ?int $waiterUserId): Bill;
    public function close(int $billId): Bill;             // → paid
    public function reopen(int $billId, string $reason): Bill;
}

interface TillLedger
{
    public function openShift(int $userId, int $openingCash): int;      // cash_shift_id
    public function closeShift(int $shiftId, int $countedCash, ?string $note): ShiftTotals;
    public function capture(int $shiftId, int $orderId, string $orderNumber,
                            string $method, int $amount): int;          // payment_id
    public function refund(int $paymentId, string $reason): bool;
    public function recordCashOut(int $shiftId, int $amount, string $description): int; // expense_id
    public function shiftTotals(int $shiftId): ShiftTotals;
}
```

- [ ] **Step 1: Shartnoma testlarini yozish**

`BillRegistryContractTest` — `open` → `addLine` → `send` → `close` oqimi;
`split` yangi hisob yaratadi va qatorlar ko'chadi; `merge` manba hisobni bo'shatadi;
`voidLine` `total`ni qayta hisoblaydi; `reopen` `paid`dan `served`ga qaytaradi.

`TillLedgerContractTest` — `openShift`/`capture`/`closeShift` mavjud `CashShift`
va `Payment` modellariga to'g'ri yozadi; `recordCashOut` `paid_in_cash = true`
bo'lgan `Expense` yaratadi; `closeShift` **mavjud** `CashShift::close()` ni
chaqiradi (matematika o'zgarmaydi).

- [ ] **Step 2: Qizil ekanini tasdiqlash**

- [ ] **Step 3: Implementatsiya**

`EloquentBillRegistry` — `Modules\Orders\Models\Order` ustida ishlaydi (o'z moduli
ichida, chegara buzilmaydi). `split`/`merge`/`transfer` — `DB::transaction` ichida,
har biri `recalculateTotals()` bilan tugaydi. `EloquentTillLedger` — mavjud
`CashShift`, `Payment`, `Expense` modellarini **faqat chaqiradi**.

- [ ] **Step 4: Provayderlarga bittadan `bind()` qatori**

```php
// OrdersServiceProvider::register()
$this->app->bind(BillRegistry::class, EloquentBillRegistry::class);
// FinanceServiceProvider::register()
$this->app->bind(TillLedger::class, EloquentTillLedger::class);
// AppServiceProvider::register()
$this->app->bindIf(BillRegistry::class, UnavailableBillRegistry::class);
$this->app->bindIf(TillLedger::class, UnavailableTillLedger::class);
```

- [ ] **Step 5: To'liq test to'plami — mavjud 349 test ham yashil qolishi shart**

```bash
cd apps/api && php vendor/bin/phpunit
```

- [ ] **Step 6: Commit** — `feat(api): BillRegistry and TillLedger cross-module contracts`

---

### Task 6: Idempotentlik va sotuv oqimi

**Files:**

- Create: `Models/PosSyncEntry.php`, migratsiya, factory,
  `Services/IdempotencyGuard.php`, `Services/SellService.php`,
  `Http/Controllers/BillController.php`,
  `Http/Requests/{OpenBillRequest,AddLineRequest,ApplyDiscountRequest,SplitBillRequest,MergeBillRequest,TransferBillRequest}.php`,
  `Http/Middleware/RecordIdempotentWrite.php`
- Test: `tests/Feature/IdempotencyTest.php`, `tests/Feature/SellFlowTest.php`

**Interfaces:**

- Consumes: `BillRegistry`, `PosSession`, `Terminal`.
- Produces: `IdempotencyGuard::run(Terminal $t, string $localId, int $seq,
string $action, array $payload, Closure $work): array` — takror chaqiruvda
  `$work` **ishlamaydi**, saqlangan `result` qaytadi.

- [ ] **Step 1: Testlarni yozish**

`IdempotencyTest`:

- `test_the_same_local_id_creates_only_one_bill`
- `test_the_replayed_response_is_byte_identical`
- `test_a_missing_local_id_header_is_rejected` (422)
- `test_two_terminals_may_use_the_same_local_id` (unique — `terminal_id` bo'yicha)
- `test_a_failed_write_is_not_recorded_as_accepted`

`SellFlowTest`:

- `test_a_bill_goes_from_open_through_kitchen_to_paid`
- `test_adding_a_line_snapshots_the_price_at_that_moment`
- `test_a_line_cannot_be_added_to_a_paid_bill` (422)
- `test_selling_requires_pos_sell`
- `test_a_bill_is_scoped_to_the_terminals_restaurant`

- [ ] **Step 2: Qizil**
- [ ] **Step 3: Implementatsiya** — `unique(terminal_id, local_id)`, `DB::transaction`
      ichida yozuv + amal, `insertOrIgnore` konflikti → saqlangan natijani o'qish.
- [ ] **Step 4: Yashil**
- [ ] **Step 5: Commit** — `feat(pos): idempotent sell flow over BillRegistry`

---

### Task 7: Narx qoidalari

**Files:**

- Create: `Models/PriceRule.php`, migratsiya, factory,
  `Services/PriceResolver.php`, `Http/Controllers/PriceRuleController.php`,
  `Http/Requests/{StorePriceRuleRequest,UpdatePriceRuleRequest}.php`,
  `Http/Resources/PriceRuleResource.php`
- Test: `tests/Feature/PriceRuleTest.php`

**Interfaces:**

- Produces: `PriceResolver::priceFor(int $menuItemId, int $basePrice,
string $channel, CarbonImmutable $at): int` — tiyinda.

- [ ] **Step 1: Testlarni yozish** — happy hour vaqt oynasi ichida/tashqarisida;
      kanal narxi; ustuvorlik (`priority` yuqori bo'lgani yutadi); nofaol qoida
      e'tiborga olinmaydi; `active_from/to` chegaralari; foiz chegirma tiyinda
      to'g'ri yaxlitlanadi (banker's rounding emas — pastga).
- [ ] **Step 2: Qizil**
- [ ] **Step 3: Implementatsiya** — vaqt taqqoslash `BusinessDay` orqali,
      `whereTime` **ishlatilmaydi** (arxitektura testi).
- [ ] **Step 4: Yashil**
- [ ] **Step 5: Commit** — `feat(pos): happy hour and channel price rules`

---

### Task 8: Aralash to'lov (tender)

**Files:**

- Create: `Services/TenderService.php`, `Http/Controllers/TenderController.php`,
  `Http/Requests/{TenderRequest,RefundRequest}.php`
- Test: `tests/Feature/SplitTenderTest.php`

**Interfaces:**

- Consumes: `TillLedger`, `BillRegistry`, `IdempotencyGuard`.
- Produces: `TenderService::settle(int $billId, array $tenders, int $shiftId): array`
  → `['payments' => int[], 'change' => int, 'bill' => Bill]`.

- [ ] **Step 1: Testlarni yozish**
- `test_cash_and_card_together_settle_the_bill`
- `test_overpaying_in_cash_returns_change`
- `test_overpaying_by_card_is_rejected` (422)
- `test_underpaying_leaves_the_bill_open`
- `test_a_bill_cannot_be_settled_twice` (idempotentlik)
- `test_loyalty_redemption_reduces_the_bill_not_the_payment`
- `test_settlement_is_atomic_when_the_second_tender_fails`

- [ ] **Step 2: Qizil**
- [ ] **Step 3: Implementatsiya** — har bir tender `TillLedger::capture()`,
      hammasi bitta `DB::transaction`da; jami ≥ hisob bo'lsa
      `BillRegistry::close()`; qaytim faqat naqddan.
- [ ] **Step 4: Yashil**
- [ ] **Step 5: Commit** — `feat(pos): split tender settlement with change`

---

## Bosqich 3 — Nazorat

### Task 9: Tasdiqlar (approval gate)

**Files:**

- Create: `Models/PosApproval.php`, migratsiya, factory,
  `Services/ApprovalGate.php`, `Http/Controllers/ApprovalController.php`,
  `Http/Requests/{RequestApprovalRequest,DecideApprovalRequest}.php`,
  `Http/Resources/PosApprovalResource.php`, `Events/ApprovalRequested.php`
- Test: `tests/Feature/ApprovalGateTest.php`

**Interfaces:**

- Produces: `ApprovalGate::requires(string $action, int $amount, User $actor): bool`;
  `ApprovalGate::assertApproved(string $action, string $subjectType, int $subjectId): PosApproval`.
  Hodisa nomi: `pos.approval_requested`.

- [ ] **Step 1: Testlarni yozish**
- `test_a_cashier_cannot_void_a_line_without_an_approval` (403, hisob o'zgarmadi)
- `test_an_approved_request_lets_the_void_through`
- `test_an_expired_approval_is_refused`
- `test_an_approval_cannot_be_used_twice`
- `test_a_manager_can_approve_but_a_cashier_cannot` (`pos.approve`)
- `test_a_discount_below_the_role_limit_needs_no_approval`
- `test_a_user_cannot_approve_their_own_request`
- `test_the_approval_records_who_asked_who_decided_and_why`

- [ ] **Step 2: Qizil**
- [ ] **Step 3: Implementatsiya** — limit `terminals.settings.discount_limits`
      dan rol bo'yicha o'qiladi; tasdiq 5 daqiqada `expired`.
- [ ] **Step 4: Yashil**
- [ ] **Step 5: Commit** — `feat(pos): manager approval gate for voids and discounts`

---

### Task 10: Kassa qutisi va smena hisoboti

**Files:**

- Create: `Models/DrawerMovement.php`, migratsiya, factory,
  `Services/DrawerService.php`, `Services/ShiftReporter.php`,
  `Http/Controllers/{DrawerController,ShiftController}.php`,
  `Http/Requests/{OpenShiftRequest,CloseShiftRequest,DrawerMovementRequest}.php`,
  `Http/Resources/{DrawerMovementResource,ShiftReportResource}.php`
- Test: `tests/Feature/DrawerMovementTest.php`, `tests/Feature/ShiftReportTest.php`

**Interfaces:**

- Consumes: `TillLedger`, `ApprovalGate`.
- Produces: `ShiftReporter::x(int $shiftId): array`, `ShiftReporter::z(int $shiftId, int $counted): array`
  — `['expected' => int, 'counted' => int, 'difference' => int, 'by_method' => array,
'drawer' => array, 'bills' => int, 'average_cheque' => int]`.

- [ ] **Step 1: Testlarni yozish**
- `test_a_collection_creates_a_cash_expense_in_finance`
- `test_a_cash_out_without_a_reason_is_rejected` (422)
- `test_opening_a_shift_records_the_opening_float`
- `test_the_x_report_does_not_close_the_shift`
- `test_the_z_report_expected_cash_is_computed_server_side`
- `test_a_collection_does_not_show_up_as_a_shortfall` ← §2.4 ning isboti
- `test_the_client_cannot_send_the_expected_cash`
- `test_only_pos_drawer_may_move_cash`

- [ ] **Step 2: Qizil**
- [ ] **Step 3: Implementatsiya** — `direction = out` → `TillLedger::recordCashOut()`,
      qaytgan `expense_id` `finance_expense_id` ga yoziladi.
- [ ] **Step 4: Yashil**
- [ ] **Step 5: Commit** — `feat(pos): cash drawer movements and X/Z shift reports`

---

## Bosqich 4 — Chiqish (chek va fiskal)

### Task 11: Printerlar va chop navbati

**Files:**

- Create: `Models/{Printer,PrintJob}.php`, ikkita migratsiya, ikkita factory,
  `Services/PrintQueue.php`, `Services/Receipts/{PrecheckRenderer,KitchenTicketRenderer,ShiftReportRenderer}.php`,
  `Http/Controllers/{PrinterController,PrintJobController}.php`, requestlar, resurslar
- Test: `tests/Feature/PrintJobTest.php`

**Interfaces:**

- Produces: `PrintQueue::enqueue(string $kind, array $payload, ?int $printerId): PrintJob`;
  `PrintQueue::claim(Terminal $t, int $limit): Collection`;
  `PrintQueue::ack(PrintJob $job, bool $ok, ?string $error): void`.

- [ ] **Step 1: Testlarni yozish**
- `test_claiming_a_job_marks_it_claimed_and_hides_it_from_other_terminals`
- `test_a_failed_job_is_retried_up_to_three_times_then_marked_failed`
- `test_a_kitchen_ticket_routes_to_the_printer_of_its_station`
- `test_a_precheck_renders_every_line_and_the_total_in_tiyin`
- `test_claiming_requires_a_device_token`

- [ ] **Step 2: Qizil**
- [ ] **Step 3: Implementatsiya** — claim `SELECT … FOR UPDATE SKIP LOCKED` bilan.
- [ ] **Step 4: Yashil**
- [ ] **Step 5: Commit** — `feat(pos): printer registry and print job queue`

---

### Task 12: Fiskal cheklar

**Files:**

- Create: `app/Contracts/Pos/{Fiscalizer,FiscalRequest,FiscalResult}.php`,
  `Models/FiscalReceipt.php`, migratsiya, factory,
  `Services/Fiscal/{NullFiscalizer,FiscalRegistrar}.php`,
  `Jobs/RegisterFiscalReceipt.php`,
  `Http/Controllers/FiscalReceiptController.php`
- Test: `tests/Feature/FiscalReceiptTest.php`

**Interfaces:**

- Produces: `Fiscalizer::register(FiscalRequest): FiscalResult`;
  konfiguratsiya `config/config.php` → `'fiscal_driver' => env('POS_FISCAL_DRIVER', 'null_driver')`.

- [ ] **Step 1: Testlarni yozish**
- `test_a_captured_payment_queues_a_fiscal_receipt`
- `test_a_failed_registration_does_not_block_the_sale`
- `test_a_failed_receipt_can_be_retried_and_then_registers`
- `test_the_same_payment_never_gets_two_fiscal_receipts` (unique)
- `test_a_refund_registers_a_refund_receipt`
- `test_retrying_requires_pos_manage`

- [ ] **Step 2: Qizil**
- [ ] **Step 3: Implementatsiya** — registratsiya navbatdagi ish (`ShouldQueue`),
      sotuv oqimini hech qachon bloklamaydi.
- [ ] **Step 4: Yashil**
- [ ] **Step 5: Commit** — `feat(pos): fiscal receipts with a pluggable OFD driver`

---

### Task 13: Maket va offline snapshot

**Files:**

- Create: `Models/PosLayout.php`, migratsiya, factory,
  `Http/Controllers/{LayoutController,SyncController}.php`,
  `Services/EloquentSnapshot.php`, requestlar, resurslar,
  `database/seeders/PosDatabaseSeeder.php`
- Test: `tests/Feature/LayoutTest.php`, `tests/Feature/SyncSnapshotTest.php`

- [ ] **Step 1: Testlarni yozish**
- `test_the_snapshot_contains_menu_prices_tables_and_stoplist`
- `test_the_snapshot_is_scoped_to_the_terminals_restaurant`
- `test_a_batch_replay_applies_entries_in_local_seq_order`
- `test_a_replay_containing_a_duplicate_skips_only_that_entry`
- `test_a_layout_button_must_reference_an_existing_dish` (422)

- [ ] **Step 2–4: Qizil → implementatsiya → yashil**
- [ ] **Step 5: To'liq to'plam + Pint**

```bash
cd apps/api && php vendor/bin/phpunit && vendor/bin/pint --test
```

- [ ] **Step 6: Commit** — `feat(pos): quick-key layouts and offline sync snapshot`

---

## Bosqich 5 — `apps/pos` terminal ilovasi

### Task 14: Ilova skeleti va dizayn tizimi

**Files:**

- Create: `apps/pos/{package.json,next.config.ts,tsconfig.json,eslint.config.mjs,postcss.config.mjs}`,
  `src/app/{layout.tsx,globals.css}`, `src/components/pos/{Tile,Numpad,Sheet,StatusBar}.tsx`,
  `public/manifest.json`, `src/app/sw.ts`
- Modify (qo'shish): `pnpm-workspace.yaml`, `turbo.json`, `packages/i18n` (`pos` bo'limi)
- Test: `apps/pos/src/components/pos/__tests__/Numpad.test.tsx`

**Interfaces:**

- Produces: dizayn tokenlari (spec §12) `globals.css` da CSS o'zgaruvchisi sifatida;
  `Tile`, `Numpad`, `Sheet`, `StatusBar` komponentlari.

- [ ] **Step 1: Ilovani yaratish va workspace'ga ulash** (`port 3002`)
- [ ] **Step 2: Dizayn tokenlarini yozish** — spec §12 jadvalidagi qiymatlar
      aynan: qorong'i asos `#000`, karta `#1c1c1e`, ajratgich
      `rgba(255,255,255,.08)`, radius 12/20 px, spring `cubic-bezier(.32,.72,0,1)`,
      nishon ≥ 44 px, rejim urg'u ranglari (ko'k/to'q sariq/binafsha/yashil)
- [ ] **Step 3: `Numpad` testini yozish** — teginish nishoni ≥ 44 px,
      `backspace` oxirgi raqamni o'chiradi, `00` tugmasi ikkita nol qo'shadi
- [ ] **Step 4: Komponentlarni yozish, test yashil**
- [ ] **Step 5: `pnpm --filter @restaurant/pos type-check lint build`**
- [ ] **Step 6: Commit** — `feat(pos): scaffold the touch terminal app`

---

### Task 15: Ulash, PIN qulfi, offline qatlami

**Files:**

- Create: `src/app/(boot)/pair/page.tsx`, `src/app/(lock)/lock/page.tsx`,
  `src/lib/api/pos-client.ts`, `src/lib/offline/{db.ts,outbox.ts,snapshot.ts,replay.ts}`,
  `src/stores/{terminal.ts,session.ts}.ts`
- Test: `src/lib/offline/__tests__/{outbox.test.ts,replay.test.ts}`

**Interfaces:**

- Produces: `outbox.enqueue(action, payload): Promise<string>` (uuid `local_id` qaytaradi);
  `replay.flush(): Promise<{sent: number; failed: number}>` — `local_seq` tartibida.

- [ ] **Step 1: Offline testlarini yozish** — navbat tartibi saqlanadi;
      muvaffaqiyatsiz yozuv navbatda qoladi; `duplicate` javob navbatdan o'chiradi;
      offline'da karta to'lovi rad etiladi
- [ ] **Step 2: Qizil → implementatsiya (Dexie) → yashil**
- [ ] **Step 3: `pair` va `lock` sahifalari** — 6 raqamli kod, PIN klaviaturasi
- [ ] **Step 4: Commit** — `feat(pos): pairing, pin lock and the offline outbox`

---

### Task 16: Sotuv ekrani (4 rejim) va to'lov

**Files:**

- Create: `src/app/(till)/sell/page.tsx`, `src/app/(till)/floor/page.tsx`,
  `src/app/(till)/bills/**`, `src/app/(till)/pay/[bill]/page.tsx`,
  `src/components/pos/{CatalogGrid,BillPane,TenderSheet,ModeSwitch}.tsx`,
  `src/stores/cart.ts`
- Test: `src/stores/__tests__/cart.test.ts`,
  `src/components/pos/__tests__/TenderSheet.test.tsx`

- [ ] **Step 1: Savat matematikasi testlarini yozish** — hammasi tiyinda:
      miqdor o'zgarishi, chegirma, servis haqi, aralash to'lov qoldig'i, qaytim
- [ ] **Step 2: Qizil → implementatsiya → yashil**
- [ ] **Step 3: 4 rejim** — `table_service` (zal → hisob), `quick_service`
      (avval to'lov → raqam), `bar` (tab), `counter` (tez)
- [ ] **Step 4: Commit** — `feat(pos): sell screen for all four venue modes`

---

### Task 17: 8 rol ish maydoni

**Files:**

- Create: spec §7 dagi qolgan sahifalar — `(till)/shift`, `(till)/drawer`,
  `(back)/approvals`, `(back)/terminals`, `(back)/live`, `(back)/variance`,
  `(back)/day-close`, `(back)/price-rules`, `(back)/z-reports`, `(back)/fiscal`,
  `(back)/payment-mix`, `(back)/stoplist`, `(back)/kitchen-load`,
  `(back)/dish-sales`, `(back)/stock-impact`, `(back)/stoplist-suggestions`,
  `(back)/till-writeoffs`, `(back)/deliveries`, `(back)/discount-audit`,
  `(back)/terminals/health`, `(till)/me/shift`
- Create: `src/components/pos/RoleNav.tsx` — ruxsat bo'yicha navigatsiya
- Test: `src/components/pos/__tests__/RoleNav.test.tsx`

- [ ] **Step 1: `RoleNav` testini yozish** — har bir rol faqat o'z sahifalarini
      ko'radi (spec §7 jadvali bo'yicha 8 ta holat)
- [ ] **Step 2: Qizil → implementatsiya → yashil**
- [ ] **Step 3: Sahifalarni yozish** — har biri `@restaurant/sdk` orqali mavjud
      modul API'laridan o'qiydi
- [ ] **Step 4: `pnpm --filter @restaurant/pos type-check lint build test`**
- [ ] **Step 5: Commit** — `feat(pos): role workspaces for the eight till roles`

---

### Task 18: E2E oqimi

**Files:**

- Create: `apps/pos/e2e/{pair-and-sell.spec.ts,approval.spec.ts,offline.spec.ts}`,
  `apps/pos/playwright.config.ts`

- [ ] **Step 1: E2E yozish** — `pair → PIN → smena ochish → sotish → aralash
  to'lov → chek → smena yopish`; menejer tasdig'i oqimi; offline'da sotib,
      ulanish tiklanganda bitta buyurtma paydo bo'lishi
- [ ] **Step 2: `pnpm --filter @restaurant/pos test:e2e`**
- [ ] **Step 3: Commit** — `test(pos): end-to-end till, approval and offline flows`

---

## Bosqich 6 — Hujjat

### Task 19: Hujjatlar va yakuniy tekshiruv

**Files:**

- Create: `docs/modules/12-pos.md`, `docs/decisions/0011-pos-boundary.md`
- Modify (qo'shish): `CLAUDE.md`, `CHANGELOG.md`, `docs/modules/README.md`

- [ ] **Step 1: `docs/modules/12-pos.md`** — `docs/modules/01-menu.md` shaklida
- [ ] **Step 2: ADR-0011** — nega POS alohida ilova va ingichka modul; nega
      hisob Orders'da qoldi
- [ ] **Step 3: `CLAUDE.md`** — 12-modul, `apps/pos`, yangi test soni
- [ ] **Step 4: To'liq yakuniy tekshiruv**

```bash
export PATH="/c/Users/User/php8424:$PATH"
cd apps/api && php vendor/bin/phpunit && vendor/bin/pint --test
cd ../.. && pnpm type-check && pnpm lint && pnpm build && pnpm format:check
```

Kutilgan: hammasi yashil, mavjud 349 test buzilmagan.

- [ ] **Step 5: Commit** — `docs(pos): module documentation and ADR-0011`

---

## Self-Review

**Spec qamrovi:** §2 → Task 1, 5; §3 → Task 5, 12; §4 (11 jadval) → Task 3, 4, 6,
7, 9, 10, 11, 12, 13; §5 (4 rejim) → Task 16; §6 (ruxsatlar) → Task 2;
§7 (37 sahifa) → Task 15, 16, 17; §8 (API) → Task 3–13; §9 (offline) → Task 6, 13, 15;
§10 (drayverlar) → Task 11, 12; §11 (invariantlar) → har bir tasknning test
ro'yxatida; §12 (dizayn) → Task 14; §13 (testlar) → hamma task; §14 → Task 1, 2, 5;
§15 → bosqichlar; §16 (YAGNI) → rejaga kiritilmagan. **Bo'shliq yo'q.**

**Placeholder skani:** TBD/TODO yo'q; har bir taskda aniq fayl yo'llari, aniq
test nomlari va aniq buyruqlar bor.

**Tur mosligi:** `BillRegistry` va `TillLedger` imzolari Task 5 da bir marta
e'lon qilingan va Task 6, 8, 10 da aynan shu nomlar bilan ishlatilgan
(`capture`, `recordCashOut`, `shiftTotals`, `addLine`, `voidLine`, `close`,
`reopen`). `IdempotencyGuard::run()` Task 6 da e'lon qilinib, Task 8 da
o'zgarmagan holda ishlatiladi.
