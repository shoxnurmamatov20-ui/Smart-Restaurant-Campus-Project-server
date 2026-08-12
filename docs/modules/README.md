# Modullar texnik spec

Har modulning to'liq spetsifikatsiyasi (database schema, API endpoints, UI
flows, va h.k.) shu papkada.

## Phase 1 modullar (10)

| #   | Fayl                       | Modul                                                | Status                |
| --- | -------------------------- | ---------------------------------------------------- | --------------------- |
| 1   | [`01-menu.md`](01-menu.md) | Menu — Menyu, taomlar, narxlar, stop-list            | ✅ **kanonik namuna** |
| 2   | `02-orders.md`             | Orders — Buyurtmalar (zal / olib ketish / yetkazish) | ✅ implementatsiya    |
| 3   | `03-kitchen.md`            | Kitchen — Oshxona displey tizimi (KDS)               | ✅ implementatsiya    |
| 4   | `04-tables.md`             | Tables — Stollar, zallar, bronlar, QR-menyu          | ✅ implementatsiya    |
| 5   | `05-inventory.md`          | Inventory — Ombor va texnologik kartalar             | ✅ implementatsiya    |
| 6   | `06-suppliers.md`          | Suppliers — Yetkazib beruvchilar va xaridlar         | ✅ implementatsiya    |
| 7   | `07-staff.md`              | Staff — Xodimlar, smenalar, davomat                  | ✅ implementatsiya    |
| 8   | `08-finance.md`            | Finance — Kassa, to'lovlar, fiskal cheklar           | ✅ implementatsiya    |
| 9   | `09-crm.md`                | CRM — Mijozlar, sodiqlik, aksiyalar                  | ✅ implementatsiya    |
| 10  | `10-analytics.md`          | Analytics — Sotuv, food-cost, KPI                    | ✅ implementatsiya    |

Qo'shimcha: **TelegramBots** — 50 botli gateway modul
(`apps/telegram-bots/src/bots/README.md`).

> **Muhim:** `01-menu.md` — bu shunchaki hujjat emas, balki **standart**.
> `Modules/Menu` to'liq yozilgan (model, migratsiya, factory, form request,
> resource, controller, RBAC route, seeder, 37 ta test). Qolgan 9 modul aynan
> shu shaklni takrorlaydi. Yangi modul yozishdan oldin `Modules/Menu` ni o'qing.

## Modul spec shabloni

Har modul spec quyidagi bo'limlarni o'z ichiga olishi kerak:

```markdown
# Modul XX — Nom

## Maqsad va kontekst

## Foydalanuvchilar va rollar

## Foydalanuvchi hikoyalari (user stories)

## Database schema

## API endpoints

## UI/UX

## Integratsiyalar

## Xavfsizlik va izolyatsiya

## Testlar

## Seed ma'lumot

## Open questions

## Bog'liq fayllar
```

## Barcha modullar uchun majburiy qoidalar

1. **Pul — butun son, tiyinda.** Float ishlatilmaydi.
2. **Har bir biznes jadvalida `tenant_id`** va model `BelongsToTenant` bilan.
3. **Har bir route `auth:sanctum` + `tenant` ostida**, har bir amal Spatie
   permission bilan (`{module}.{action}`).
4. **Mehmonga qaragan endpointlar** `/api/v1/public/*` ostida — login yo'q,
   lekin tenant bilan chegaralangan va faqat sotuvda bor narsani ko'rsatadi.
5. **Buyurtma va to'lov hech qachon hard-delete qilinmaydi.**
6. **Testlar `Modules/<Name>/tests/`da** — `Modules` phpunit suite'i ularni
   yig'adi. Har bir modul kamida bitta tenant izolyatsiya testiga ega bo'lishi
   kerak.

## Phase 2 modullar

Phase 2 ga rejalashtirilgan 20 ta qo'shimcha modul
[`docs/RESTAURANT_30_MODULLAR.md`](../RESTAURANT_30_MODULLAR.md) da.
Phase 2 boshlangach, shu yerda alohida fayllar yaratiladi.
