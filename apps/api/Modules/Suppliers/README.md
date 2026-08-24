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

## Qurilgan qismi — buyurtma zinapoyasi va yetkazib beruvchi ustunlari (2026-08-22)

Konsolning ikkala jadvali ham endi jonli. Ilgari faqat buyurtmalar kitobi
o'qilardi: `suppliers-server.ts` yetti ustundan to'rttasining ortida ustun
yo'qligini yozib qo'ygan edi.

| Ustun                               | Qayerdan                                                       |
| ----------------------------------- | -------------------------------------------------------------- |
| kategoriya, yetkazish muddati       | `suppliers.category`, `suppliers.lead_time_days` — yangi ustun |
| oxirgi yetkazish                    | `suppliers.last_delivery_at` — `receive()` yozadi              |
| o'z vaqtida %, ochiq buyurtma, sarf | **hisoblanadi**, `Supplier::scopeWithPurchaseFigures()` bilan  |

Nega uchtasi ustun emas: saqlangan `on_time` yozilgan kuni to'g'ri, ertasiga
xato, va ekranda buni ayta oladigan hech narsa yo'q. Ular buyurtmalarning
o'zidan bitta so'rovda subquery bo'lib keladi.

**Holat zinapoyasi bitta yo'nalishda** (`PurchaseOrder::TRANSITIONS`):
`draft → sent → confirmed`, va uchtasidan ham `cancelled`. `received` bu
ro'yxatda ataylab yo'q — unga faqat `receive()` orqali boriladi, chunki u
zaxirani ko'taradi va qarzni o'stiradi. Holatni e'lon qila oladigan endpoint
javonga hech narsa tushmagan yetkazishni "keldi" deb yopish yo'li bo'lardi.

```
GET    /api/v1/suppliers/suppliers                       — reytinglar bilan (suppliers.view)
POST   /api/v1/suppliers/purchase-orders                 — sarlavha + qatorlar, bitta tranzaksiya (suppliers.create)
POST   /api/v1/suppliers/purchase-orders/{po}/status     — sent | confirmed | cancelled (suppliers.update)
POST   /api/v1/suppliers/purchase-orders/{po}/receive    — zaxira va qarz (suppliers.update)
```

Buyurtma raqamini mijoz yubormaydi: `BranchCounters` beradi (`PO-0009`) — ikki
xaridor ikki ekranda bir xil raqamni o'ylab topmasligi uchun.

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
