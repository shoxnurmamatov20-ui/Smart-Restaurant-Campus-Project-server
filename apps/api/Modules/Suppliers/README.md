# Modul 6 — Yetkazib beruvchilar (Suppliers & Procurement)

> Yetkazib beruvchilar bazasi, xarid arizalari, kirim hujjatlari va qarzdorlik.

**Alias:** `suppliers` · **Namespace:** `Modules\Suppliers` · **API prefiks:** `/api/v1/suppliers`

---

## Asosiy funksiyalar

- Yetkazib beruvchilar reestri (shartnoma, to'lov sharti, aloqa)
- Narxlar jadvali va yetkazib beruvchilar taqqoslash
- Xarid arizasi (purchase order) va tasdiqlash marshruti
- Kirim hujjati (накладная) — ombor qoldig'ini oshiradi
- Qaytarish va da'vo (buzilgan mahsulot)
- Yetkazib beruvchi bilan hisob-kitob va qarzdorlik
- Yetkazish sifati reytingi (kechikish, sifat, narx)
- E-IMZO bilan elektron shartnoma imzolash
- Telegram bot orqali yetkazib beruvchiga avtomatik buyurtma

---

## Database jadvallar (rejalashtirilgan)

- `suppliers` — yetkazib beruvchilar
- `supplier_contracts` — shartnomalar
- `supplier_prices` — narxlar jadvali
- `purchase_orders` — xarid arizalari
- `purchase_order_items` — ariza satrlari
- `goods_receipts` — kirim hujjatlari
- `supplier_payments` — hisob-kitoblar

Har bir jadvalda `tenant_id` bo'ladi va model `BelongsToTenant` trait'ini
ishlatadi — bitta restoran boshqasining ma'lumotini hech qachon ko'rmaydi.

---

## API endpointlar (rejalashtirilgan)

```
GET    /api/v1/suppliers/                 — modul ma'lumoti
GET    /api/v1/suppliers/suppliers        — yetkazib beruvchilar
POST   /api/v1/suppliers/purchase-orders  — xarid arizasi
POST   /api/v1/suppliers/receipts         — kirim hujjati
GET    /api/v1/suppliers/debts            — qarzdorlik hisoboti
GET    /api/v1/suppliers/price-comparison — narx taqqoslash
```

Barcha endpointlar `auth:sanctum` + `tenant` middleware ostida.
Har bir amal Spatie permission bilan himoyalangan:
`suppliers.view`, `suppliers.create`, `suppliers.update`, `suppliers.delete`, `suppliers.manage`.

---

## Boshqa modullar bilan bog'liqlik

- **Inventory** — kirim ombor qoldig'ini oshiradi
- **Expenses / Finance** — xarid xarajat sifatida yoziladi
- **Analytics** — xarid tannarxi dinamikasi
- **TelegramBots** — yetkazib beruvchi boti

---

## Ishlab chiqish

```bash
cd apps/api

# Migratsiya yaratish
php artisan module:make-migration create_<table>_table Suppliers

# Model + factory
php artisan module:make-model <Name> Suppliers --factory

# Controller
php artisan module:make-controller <Name>Controller Suppliers --api

# Testlar
php artisan test --filter=Modules\\Suppliers
```

---

## Status

Phase 1 · ✅ **Implementatsiya qilingan** — Supplier, PurchaseOrder, PurchaseOrderItem.
Model, migratsiya, factory, form request, API resource, controller, RBAC route,
seeder va feature testlar mavjud.

Kanonik namuna: `Modules/Menu`.
