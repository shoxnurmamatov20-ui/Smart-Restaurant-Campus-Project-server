# Modul 2 — Buyurtmalar (Orders)

> Barcha kanallar bo'yicha buyurtmalar: zal, olib ketish, yetkazib berish, agregator.

**Alias:** `orders` · **Namespace:** `Modules\Orders` · **API prefiks:** `/api/v1/orders`

---

## Asosiy funksiyalar

- Buyurtma turlari: dine-in (zal), takeaway, delivery, agregator
- Stol sessiyasi — bitta stolda bir nechta mehmon va bo'lingan hisob
- Ofitsiant terminali: taom qo'shish, izoh, kurs (podacha) tartibi
- Buyurtma holati: qabul qilindi → oshxonada → tayyor → berildi → yopildi
- Bekor qilish va qaytarish (sabab + rahbar tasdig'i bilan)
- Hisobni bo'lish (split bill) va birlashtirish
- Xizmat haqi, chegirma, promo-kod qo'llash
- Real-time yangilanish (Laravel Reverb websocket)
- Yetkazib berish: manzil, kuryer, yetkazish vaqti

---

## Database jadvallar (rejalashtirilgan)

- `orders` — buyurtma boshi
- `order_items` — buyurtma satrlari
- `order_item_modifiers` — tanlangan modifikatorlar
- `order_status_history` — holat o'zgarishlari jurnali
- `order_discounts` — chegirma va promo qo'llanishi
- `table_sessions` — stol sessiyasi (zal buyurtmalari uchun)

Har bir jadvalda `tenant_id` bo'ladi va model `BelongsToTenant` trait'ini
ishlatadi — bitta restoran boshqasining ma'lumotini hech qachon ko'rmaydi.

---

## API endpointlar (rejalashtirilgan)

```
GET    /api/v1/orders/                    — modul ma'lumoti
GET    /api/v1/orders/orders              — buyurtmalar ro'yxati
POST   /api/v1/orders/orders              — yangi buyurtma
GET    /api/v1/orders/orders/{order}      — bitta buyurtma
POST   /api/v1/orders/orders/{order}/items — taom qo'shish
PATCH  /api/v1/orders/orders/{order}/status — holatni o'zgartirish
POST   /api/v1/orders/orders/{order}/split — hisobni bo'lish
POST   /api/v1/orders/orders/{order}/cancel — bekor qilish
```

Barcha endpointlar `auth:sanctum` + `tenant` middleware ostida.
Har bir amal Spatie permission bilan himoyalangan:
`orders.view`, `orders.create`, `orders.update`, `orders.delete`, `orders.manage`.

---

## Boshqa modullar bilan bog'liqlik

- **Menu** — taom, narx, modifikator
- **Kitchen** — buyurtma oshxona chiptasiga aylanadi
- **Tables** — stol bandligi va bron
- **Finance** — yopilgan buyurtma to'lovga o'tadi
- **Crm** — mijoz tarixi va bonus hisobi

---

## Ishlab chiqish

```bash
cd apps/api

# Migratsiya yaratish
php artisan module:make-migration create_<table>_table Orders

# Model + factory
php artisan module:make-model <Name> Orders --factory

# Controller
php artisan module:make-controller <Name>Controller Orders --api

# Testlar
php artisan test --filter=Modules\\Orders
```

---

## Status

Phase 1 · ✅ **Implementatsiya qilingan** — Order, OrderItem + hisob oqimi.
Model, migratsiya, factory, form request, API resource, controller, RBAC route,
seeder va feature testlar mavjud.

Kanonik namuna: `Modules/Menu`.
