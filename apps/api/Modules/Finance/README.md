# Modul 8 — Moliya va kassa (Finance & POS Payments)

> Kassa smenasi, to'lovlar, fiskal cheklar, xarajatlar va kunlik moliyaviy yopilish.

**Alias:** `finance` · **Namespace:** `Modules\Finance` · **API prefiks:** `/api/v1/finance`

---

## Asosiy funksiyalar

- Kassa smenasi: ochish, X-hisobot, Z-hisobot, yopish
- To'lov usullari: naqd, bank kartasi, Payme, Click, Uzum, korporativ
- Aralash to'lov (bir chek — bir necha usul)
- Fiskal modul integratsiyasi (O'zbekiston onlayn-kassa talabi)
- Chek chop etish va elektron chek (QR)
- Qaytarish (refund) va bekor qilish — sabab va rahbar tasdig'i bilan
- Kassadagi naqd pul nazorati (inkassatsiya)
- Xarajatlar: ijara, kommunal, ish haqi, xarid
- Kunlik / oylik moliyaviy hisobot (P&L)
- Filiallar bo'yicha konsolidatsiya

---

## Database jadvallar (rejalashtirilgan)

- `cash_shifts` — kassa smenalari
- `payments` — to'lovlar
- `payment_methods` — to'lov usullari
- `fiscal_receipts` — fiskal cheklar
- `refunds` — qaytarishlar
- `expenses` — xarajatlar
- `expense_categories` — xarajat kategoriyalari
- `cash_movements` — kassa pul harakati

Har bir jadvalda `tenant_id` bo'ladi va model `BelongsToTenant` trait'ini
ishlatadi — bitta restoran boshqasining ma'lumotini hech qachon ko'rmaydi.

---

## API endpointlar (rejalashtirilgan)

```
GET    /api/v1/finance/                   — modul ma'lumoti
POST   /api/v1/finance/shifts/open        — kassa smenasini ochish
POST   /api/v1/finance/shifts/close       — Z-hisobot va yopish
POST   /api/v1/finance/payments           — to'lovni qabul qilish
POST   /api/v1/finance/refunds            — qaytarish
GET    /api/v1/finance/expenses           — xarajatlar
GET    /api/v1/finance/reports/daily      — kunlik hisobot
```

Barcha endpointlar `auth:sanctum` + `tenant` middleware ostida.
Har bir amal Spatie permission bilan himoyalangan:
`finance.view`, `finance.create`, `finance.update`, `finance.delete`, `finance.manage`.

---

## Boshqa modullar bilan bog'liqlik

- **Orders** — yopilgan buyurtma to'lovga o'tadi
- **Staff** — kassir smenasi va javobgarligi
- **Suppliers** — xarid xarajatlari
- **Analytics** — tushum, marja, P&L

---

## Ishlab chiqish

```bash
cd apps/api

# Migratsiya yaratish
php artisan module:make-migration create_<table>_table Finance

# Model + factory
php artisan module:make-model <Name> Finance --factory

# Controller
php artisan module:make-controller <Name>Controller Finance --api

# Testlar
php artisan test --filter=Modules\\Finance
```

---

## Status

Phase 1 · ✅ **Implementatsiya qilingan** — CashShift, Payment, Expense.
Model, migratsiya, factory, form request, API resource, controller, RBAC route,
seeder va feature testlar mavjud.

Kanonik namuna: `Modules/Menu`.
