# Smart Restaurant Campus — Restoranlar uchun yagona raqamli platforma

> Multi-tenant SaaS for restaurants, cafés and canteens. Target scale: extreme
> (multi-tenant, multi-branch, multi-country).

## Loyiha holati (Status)

- **Status:** Poydevor + konsol tugallandi — 8 rol o'z ish maydoniga ega
- **Code:** Monorepo tayyor — Laravel API (12 modul), web/admin (Next.js),
  AI xizmatlari (FastAPI), Telegram botlar (aiogram, 50 bot), Docker/K8s/monitoring
- **Testlar:** 557 PHP testi / 2236 assertion + 118 frontend testi (web 49,
  ui 29, admin 27, utils 13) — barchasi yashil.
  `pnpm type-check`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm format:check`,
  `vendor/bin/pint --test` — hammasi toza. `pnpm lint` endi to'qqizala
  paketni ham qamraydi (ilgari faqat uchta ilova linted edi).
- **Kanonik modul:** `apps/api/Modules/Menu` — to'liq implementatsiya (model,
  migratsiya, factory, request, resource, controller, RBAC route, seeder, testlar).
  Qolgan 9 modul aynan shu shaklni takrorlaydi.
- **Pending:** qolgan ekranlarni API'ga ulash (namuna: `menu/menu-data.ts`) —
  ko'pi uchun avval backend kerak: bo'sh jadvallar to'ldirilishi yoki
  endpoint ustunlari kengaytirilishi shart; 1-modulni chuqurlashtirish,
  fiskal modul integratsiyasi, production secret manager, K8s overlay'lari

### Poydevor (tugallandi)

| Qism                | Nima                                                                | Qayerda                                     |
| ------------------- | ------------------------------------------------------------------- | ------------------------------------------- |
| Auth                | register / login (email yoki telefon) / logout / me / context       | `app/Http/Controllers/AuthController.php`   |
| Multi-tenancy       | `BelongsToTenant` + `ResolveTenant` + middleware priority           | `bootstrap/app.php`                         |
| Filiallar           | `BelongsToBranch` + `ResolveBranch` + `X-Branch`; `null` = barchasi | `app/Models/Branch.php`                     |
| Til (uz/ru/en)      | `X-Locale` → user → `Accept-Language` → restoran → default          | `app/Support/Localization/`                 |
| Modul reyestri      | `GET /api/v1/modules`, restoran bo'yicha yoqish/o'chirish           | `app/Support/Modules/`                      |
| Audit               | `GET /api/v1/audit` — kim, nimani, qachon o'zgartirdi               | `app/Http/Controllers/AuditController.php`  |
| Hodisalar shinasi   | Tranzaksion outbox + relay + idempotentlik                          | `app/Support/Events/`                       |
| Core shartnomalar   | `MenuCatalog` — modullar bir-birini import qilmaydi                 | `app/Contracts/`                            |
| Arxitektura testlar | Modul chegaralari, `tenant_id`, hodisa nomlari — CI'da tekshiriladi | `tests/Architecture/`                       |
| Salomatlik          | `/api/health`, `/health/live`, `/health/ready` + `health:check`     | `app/Http/Controllers/HealthController.php` |
| O'rnatish           | `db:seed` → 11 hisob; `restaurant:create-owner` → real restoran     | `database/seeders/UserSeeder.php`           |

## Sakkiz rol (dizayn handoff §1.2–1.4)

Konsol dizayni sakkiz ishchi rolni nomlaydi. Yagona manba —
[`apps/web/src/lib/roles.ts`](apps/web/src/lib/roles.ts): faqat id va tuzilma,
matn i18n katalogida (`console.roles`).

| Rol          | Server nomi      | Yon panel          | Ish maydoni       | Chegirma shifti |
| ------------ | ---------------- | ------------------ | ----------------- | --------------- |
| `super`      | `super-admin`    | yo'q → `/platform` | platforma konsoli | —               |
| `owner`      | `owner`          | 19 bo'lim          | konsol + POS      | 100%            |
| `manager`    | `branch-manager` | 16 bo'lim          | konsol + POS      | 30%             |
| `accountant` | `accountant`     | 9 bo'lim           | konsol            | 0%              |
| `waiter`     | `waiter`         | 2 bo'lim           | POS               | 0% (so'raydi)   |
| `cashier`    | `cashier`        | 3 bo'lim           | POS + kassa       | 10%             |
| `kitchen`    | `chef`           | 1 bo'lim (KDS)     | KDS               | —               |
| `warehouse`  | `storekeeper`    | 6 bo'lim           | konsol            | —               |

- **Yon panel — ko'rinish, ruxsat emas.** Haqiqiy chegara ikki joyda:
  `apps/web/src/middleware.ts` (route qo'riqchisi) va serverdagi Spatie
  ruxsatlari. `DesignRoleMatrixTest` ikkalasining mos kelishini tekshiradi —
  ayniqsa **inkor** tomonini (ofitsiantda `pos.void` yo'q, buxgalterda
  `orders.*` umuman yo'q).
- **Rol ruxsati va marshrut qo'riqchisi — ikki alohida narsa.** Rolda ruxsat
  bo'lishi, marshrut uni so'rashini anglatmaydi. `ModuleRouteGuardTest` har bir
  `api/v1/*` marshrutini tekshiradi: yo ruxsat/rol middleware'i bor, yo
  hujjatlashtirilgan ro'yxatda sababi bilan yozilgan. `module:make` yaratgan
  marshrut avtomatik ravishda testni yiqitadi — 11-modulda aynan shu bo'lgan.
- **Sessiya — server tomonida.** Brauzer Laravel'ga emas, `POST /api/auth/session`
  (Next route handler) ga murojaat qiladi; u Node'dan `POST /api/v1/auth/login`
  ni chaqiradi va tokenni **httpOnly** cookie'ga yozadi. `lib/session.ts` shu
  token bilan `GET /api/v1/auth/context` ni o'qiydi — ism, filial va rol
  serverdan keladi (`session.live === true`). API javob bermasa fixture rejimiga
  qaytadi.
  - Nega Node orqali: server komponenti brauzerdagi tokenni ko'ra olmaydi, va
    brauzerdan Laravel'ga so'rov `SANCTUM_STATEFUL_DOMAINS` tufayli sessiyali
    hisoblanib **CSRF talab qiladi (419)**. Node'dan kelgan so'rovda Origin ham,
    cookie ham yo'q — oddiy token so'rovi.
  - Handler **ikkala** cookie'ni yozadi: token (httpOnly) va rol. Rol cookie'siz
    `middleware.ts` egani deb o'ylaydi va ofitsiantga hamma ekranni ochib
    yuboradi — shu xato bo'lgan, `route.test.ts` uni ushlaydi.
  - Konsolda ekrani yo'q rol (marketolog, oshpaz-cook) → `no_surface`, cookie
    yozilmaydi. `roleFromServer()` server nomini konsol roliga aylantiradi.
- **Demo almashtirgich** faqat `NEXT_PUBLIC_DEMO_ROLES=1` bo'lganda ko'rinadi
  (`apps/web/.env.local`). Production'da yo'q — u hech qachon avtorizatsiya emas.
- **Operator dashboardlari — `super-admin` roli bilan.** Horizon va Telescope
  Laravel yaratgan bo'sh email ro'yxati bilan kelgan edi (production'da hech
  kimga ochilmasdi). Ikkalasi ham endi `super-admin` rolini so'raydi; restoran
  rollari — egasi ham — o'tolmaydi. `OperatorDashboardGateTest` tekshiradi.
- **Kirish — bitta karta, uchta yorliq** (§3.12): pochta, PIN, platforma.
  `src/components/sign-in-panel.tsx` ikki joyda ishlatiladi — marketing sahifada
  namoyish sifatida, `/login`da `live` bilan. Faqat pochta eshigi haqiqiy
  (`POST /login` Sanctum'da bor). PIN endpointi (`POST /api/v1/pos/auth/pin`)
  ham yozilgan, lekin u **ulangan terminal tokenini** talab qiladi, shuning
  uchun brauzerdagi karta uni chaqira olmaydi; TOTP esa `/admin/login`da,
  alohida eshikda. `/register` yo'q —
  restoran `#contact` orqali keladi, tenant'ni operator ochadi.
- **Platforma eshigi ulangan:** `POST /api/v1/admin/login` — pochta + parol +
  TOTP, faqat `super-admin` va faqat restoranga tegishli bo'lmagan hisob;
  token 30 daqiqada tugaydi, eski tokenlar o'chiriladi, kirish audit jurnaliga
  yoziladi. Bir kod **ikkinchi marta ishlamaydi** (`two_factor_last_window`).
  Demo kalit: `JBSWY3DPEHPK3PXP` (UserSeeder, faqat local).
- **API'ga ulangan ekranlar: `menu`, `orders`, `tables` (+ bronlar),
  `inventory`, `kitchen`, `finance/till`, `staff/shifts`, `crm`.**
  `lib/api-server.ts` sessiya cookie'sidan token oladi va `apiGet<T>()`
  qaytaradi; xato, 401 yoki sessiya yo'qligida `null` — ekran fixture'ga
  qaytadi va API o'chganda ham ishlashda davom etadi. `translate()` jsonb
  `{uz,ru,en}` ustunini o'qiydi.
  - **Diqqat:** `tables-data.ts` ni POS terminali (client komponent) import
    qiladi, `api-server.ts` esa `next/headers` ishlatadi. Shuning uchun tikuv
    alohida `tables-server.ts`da. **Qoida:** tip va fixture — `*-data.ts`da,
    serverga murojaat — faqat server komponentlari import qiladigan qo'shni
    faylda.
- **KDS chiptalari `KitchenTicketSeeder` bilan yaratiladi** — mavjud
  buyurtmalardan, sex bo'yicha guruhlab (bitta buyurtma → har bir sexga bitta
  chipta). `DatabaseSeeder`da **eng oxirida** turadi, chunki u
  `OrdersDatabaseSeeder` yozgan narsani o'qiydi; `KitchenDatabaseSeeder` esa
  faqat besh sexni yaratadi va oldinda qoladi.
- **To'lov va xarajatlar `FinancePaymentSeeder` bilan** — yopilgan
  buyurtmalardan hosil qilinadi, shuning uchun kassadagi pul cheklardagi pulga
  teng. To'lov usuli qat'iy tsikl bo'yicha taqsimlanadi (tasodifiy emas):
  bir xil seed → bir xil baza. **Faqat naqd kassani qimirlatadi** — karta
  tushum, lekin quti orqali o'tmaydi; uni harakatlar ro'yxatiga qo'shish
  kutilgan summani aynan karta jamiga xato qilardi.
- **Rota `StaffShiftSeeder` bilan** — bugundan uch kun oldin va uch kun keyin.
  O'tmish — davomat, kelajak — reja; kelmagan smenaga davomat yozilmaydi.
  Har bir lavozimning o'z vaqti bor (barmen 14–00, omborchi 07–15), chunki
  hammani 09–18 ga tiqish hech bir restoranda bo'lmagan jadval chizadi.
- **Fikr va bronlar** `CrmFeedbackSeeder` / `ReservationSeeder` bilan. Fikrlar
  ataylab xushomadsiz — bittasi allergiya haqidagi shoshilinch shikoyat, chunki
  hammasi beshlik bo'lgan demo eng muhim oqimni ko'rsatmaydi. Bron faqat **bo'sh**
  stolni band qiladi: allaqachon o'tirgan stol o'tirgan bo'lib qoladi, xost
  to'qnashuvni ko'rishi kerak.
- Qolgan ekranlar hali fixture: `suppliers/purchase-orders`,
  `inventory/movements` — endpoint bor, bazada 0 qator (seeder kerak);
  `suppliers` va `staff` (ro'yxat ekrani) — API ustunlari ekran ustunlarining
  faqat 2 tasini qoplaydi, avval **migratsiya** kerak; `analytics` —
  sahifalanmagan boshqa shakl.
- **CRM'da ikkita ustun ataylab bo'sh** (`—`): _segment_ — bu biznes egallaydigan
  tasnif, tashrif sonidan chiqarib tashlash mijozga restoran rozi bo'lmagan
  yorliq yopishtirish bo'lardi; _oxirgi tashrif_ — mijoz yozuvida sana yo'q,
  uni buyurtmalardan olish endpoint ishi.

## Hujjatlar (Documents in this directory)

| File                             | Purpose                                                                 |
| -------------------------------- | ----------------------------------------------------------------------- |
| `docs/RESTAURANT_30_MODULLAR.md` | To'liq spetsifikatsiya — 30 modul, arxitektura, texnologiyalar, roadmap |
| `docs/modules/`                  | Har bir modulning batafsil hujjati                                      |
| `docs/decisions/`                | ADR — qabul qilingan arxitektura qarorlari                              |
| `docs/design/README.md`          | Dizayn handoff — token shartnomasi, brif, Tailwind v4 tuzoqlari         |
| `CLAUDE.md`                      | This file — live working context                                        |

## Phase 1 — 10 modul

| #   | Modul         | Alias       | Maqsad                                                    |
| --- | ------------- | ----------- | --------------------------------------------------------- |
| 1   | **Menu**      | `menu`      | Menyu, taomlar, narxlar, modifikatorlar, stop-list        |
| 2   | **Orders**    | `orders`    | Buyurtmalar: zal, olib ketish, yetkazib berish, agregator |
| 3   | **Kitchen**   | `kitchen`   | Oshxona displey tizimi (KDS), sexlar, tayyorlash vaqti    |
| 4   | **Tables**    | `tables`    | Zallar, stollar, bronlar, QR-menyu                        |
| 5   | **Inventory** | `inventory` | Ombor, ingredientlar, texnologik kartalar, chiqim         |
| 6   | **Suppliers** | `suppliers` | Yetkazib beruvchilar, xarid arizalari, kirim              |
| 7   | **Staff**     | `staff`     | Xodimlar, smenalar, davomat (Face ID/QR), ish haqi        |
| 8   | **Finance**   | `finance`   | Kassa smenasi, to'lovlar, fiskal cheklar, xarajatlar      |
| 9   | **CRM**       | `crm`       | Mijozlar, sodiqlik, aksiyalar, fikr-mulohaza              |
| 10  | **Analytics** | `analytics` | Sotuv, food-cost, ABC tahlil, KPI dashboard               |

Qo'shimcha: **TelegramBots** — 50 botli infratuzilma (gateway modul).

**Pos** — 12-modul: kassa terminali. Ingichka modul — hisob `Orders`da, pul
`Finance`da qoladi; POS ularni `App\Contracts\Orders\BillRegistry` va
`App\Contracts\Finance\TillLedger` orqali chaqiradi. To'rt rejim
(restoran / fast food / bar / kafe), 8 rol uchun ish maydoni, offline sotuv.
Batafsil: [`docs/modules/12-pos.md`](docs/modules/12-pos.md).

> **Interfeys `apps/web` ichida.** Kassa ilgari alohida ilova edi (`apps/pos`,
> 3002). U olib tashlandi: modul — konsolning bir bo'limi, alohida ilova emas.
> Backend `Modules/Pos` o'z joyida — schema, shartnomalar va testlar tegilmagan.

To'liq 30 modullik vizion: [`docs/RESTAURANT_30_MODULLAR.md`](docs/RESTAURANT_30_MODULLAR.md).

## Tamoyillar (Principles — set by user)

1. **Super ultra pro darajada** — production-grade from day one. No toy/MVP code
   that needs rewriting.
2. **Bosqichma-bosqich** — step-by-step. User confirms direction before major
   builds. Don't preemptively scaffold modules they didn't ask for.
3. **Multi-tenant, multi-branch, multi-lingual from start** — uz / ru / en at
   minimum. Bitta tenant = bitta restoran biznesi; filiallar tenant ichida.
4. **Kengaytiriladigan** — Phase 1 arxitekturasi qolgan 20 modulni qayta
   yozishsiz qabul qilishi kerak.
5. **Foydalanuvchi bilan o'zbek tilida** — respond to the user in Uzbek.
   Code/identifiers stay in English.

## Til (Communication)

- **Chat & docs prose:** Uzbek (Latin script)
- **Code, file names, identifiers, comments:** English
- **DB columns, API fields:** English (snake_case)
- **Foydalanuvchiga ko'rinadigan kontent** (taom nomi, kategoriya): jsonb
  `{uz, ru, en}` — `App\Models\Concerns\HasTranslations` orqali

## Tech stack (CONFIRMED)

| Layer             | Choice                                                                                                                           |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **Backend**       | PHP 8.3+ / Laravel 13 (modular monolith, `nwidart/laravel-modules`) / Eloquent                                                   |
| **Auth**          | Laravel Sanctum + Keycloak (SSO, later)                                                                                          |
| **Frontend**      | Next.js 16 (App Router) + React 19 + TypeScript 5 / Tailwind v4 / shadcn/ui                                                      |
| **Dizayn tizimi** | `packages/ui` — 26 primitiv, uchala ilova uchun yagona. Tokenlar: `packages/ui/src/styles/tokens.css`. Jonli galereya: `/design` |
| **Realtime**      | Laravel Reverb — KDS, zal xaritasi, kassa                                                                                        |
| **Mobile**        | React Native + Expo (Phase 2 — deferred)                                                                                         |
| **AI/ML**         | Python 3.13+ / FastAPI / uv                                                                                                      |
| **Bots**          | Python / aiogram 3 — bitta dispatcher, 50 bot                                                                                    |
| **Database**      | PostgreSQL 16 (primary), Redis 7 (cache/queue), ClickHouse (analytics), MinIO (objects)                                          |
| **Monorepo**      | pnpm workspaces + Composer + Turborepo                                                                                           |
| **Containers**    | Docker + Compose (dev), Kubernetes (prod, later)                                                                                 |
| **Code hosting**  | GitHub + GitHub Actions                                                                                                          |
| **i18n**          | next-intl, languages: uz / ru / en                                                                                               |

❌ Rejected: Prisma (JS-only), Better Auth (JS-only) — incompatible with Laravel.

## Muhim konventsiyalar (binding)

1. **Pul — butun son, tiyinda.** 1 so'm = 100 tiyin. Hech qachon float
   ishlatilmaydi: bir tiyinlik yaxlitlash xatosi bir kunlik buyurtmaga
   ko'paytirilganda kassada real farq bo'lib chiqadi.
2. **Har bir biznes jadvalida `tenant_id`** bor va model `BelongsToTenant`
   trait'ini ishlatadi. Bitta restoran boshqasining ma'lumotini hech qachon
   ko'rmaydi — buni `TenantIsolationTest` tekshiradi.
3. **Manzilda sodir bo'ladigan narsada `branch_id` ham bor** (`BelongsToBranch`):
   stol, buyurtma, oshxona chiptasi, kassa smenasi, xodim va smena. Menyu,
   mijoz va yetkazib beruvchi esa biznesga tegishli — ularda filial yo'q.
   Muhim farq: **bo'sh tenant — teshik, bo'sh filial — yig'indi.** Filial
   ko'rsatilmasa, so'rov restoranning barcha filiallari bo'ylab ishlaydi;
   egasi va buxgalter aynan shunday o'qiydi. `BranchIsolationTest` ikkalasini
   ham tekshiradi.
4. **Tenant `X-Tenant`, filial `X-Branch` header orqali** aniqlanadi
   (`ResolveTenant` → `ResolveBranch`). Production'da
   `TENANCY_REQUIRE_TENANT=true` bo'lishi shart; filial uchun bunday majburlash
   ataylab yo'q.
5. **Har bir modul route'i `auth:sanctum` + `tenant` middleware ostida**, har
   bir amal Spatie permission bilan (`{module}.{action}`).
6. **Mehmonga qaragan endpointlar login talab qilmaydi** (`/api/v1/public/*`),
   lekin baribir tenant bilan chegaralangan va faqat sotuvda bor narsani
   ko'rsatadi.
7. **Buyurtma va to'lovlar hech qachon hard-delete qilinmaydi** — soft delete.
8. **Modul testlari `Modules/*/tests/`da** va `phpunit.xml`dagi `Modules`
   suite'i orqali ishga tushadi.

## Working agreements

- Before scaffolding a new module → confirm with user which one and at what depth
- Before adding a new dependency → confirm choice with user
- Before destructive ops (rm, force-push, dropping data) → always confirm
- Memory of project decisions lives in
  `C:\Users\User\.claude\projects\C--Users-User-Desktop-Smart-Restaurant-Campus-Project\memory\`
  — read it at session start, update it when decisions are made

## Local dev gotchas

- **PHP:** `C:\Users\User\php8424\php.exe` (8.4.24) — boshqa PHP o'rnatmalari
  ishlamaydi. `export PATH="/c/Users/User/php8424:$PATH"` qiling.
- **Baza:** PostgreSQL 18, `restaurant_campus` (+ `restaurant_campus_test`).
  Har bir modul o'z schema'sida: `menu`, `orders`, `kitchen`, `tables`,
  `inventory`, `suppliers`, `staff`, `finance`, `crm`, `telegram`, `analytics`,
  `pos`; `public` — core. Batafsil: [ADR-0010](docs/decisions/0010-schema-per-module.md).
- **Testlar:** `php vendor/bin/phpunit` — Unit + Feature + Modules + Architecture.
  **PostgreSQL kerak** (SQLite emas): `restaurant_campus_test` bazasi ishlab
  turishi shart. Schema'lar faqat PostgreSQL'da bor, shuning uchun test ham,
  production ham bir xil dvigatelda ishlaydi.
- **Test ishga tushirishdan oldin `tinker`/`psql` seanslarini yoping.** Test
  to'plami `migrate:fresh` bilan boshlanadi va 54 ta jadvalni `DROP … CASCADE`
  qiladi; ochiq ulanish deadlock beradi va test tasodifan yiqiladi.
  Tekshirish: `select pid, state from pg_stat_activity where datname =
'restaurant_campus_test'`.
- **Yangi modul:** `php artisan restaurant:make-module Nomi --icon=… --uz=… --ru=…
--en=…` — modulni yaratadi va oltita joyda ro'yxatdan o'tkazadi (schema
  migratsiyasi, `search_path`, `ModuleBoundaryTest`, RBAC seeder,
  `modules_statuses.json`, autoload). Natija darhol arxitektura testlaridan
  o'tadi.
- **psql/pgAdmin'da qo'lda so'rov yozganda** schema'ni ko'rsating —
  `select * from menu.menu_items` — chunki `search_path` faqat ilovada o'rnatiladi.
- **Python:** `uv run pytest` — `apps/telegram-bots` va `apps/ai-services` uchun.
