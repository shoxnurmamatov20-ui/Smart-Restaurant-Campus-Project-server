# Modul 10 — Analitika (Analytics & BI)

> Sotuv analitikasi, food-cost, ABC tahlil, filiallar taqqoslash va rahbar dashboardi.

**Alias:** `analytics` · **Namespace:** `Modules\Analytics` · **API prefiks:** `/api/v1/analytics`

---

## Asosiy funksiyalar

- Real-time tushum dashboardi (kun / hafta / oy)
- O'rtacha chek, mehmonlar soni, stol aylanmasi (table turnover)
- Taomlar ABC/XYZ tahlili — nima sotiladi, nima yo'q
- Food-cost va marja har bir taom bo'yicha
- Soatlik yuklama xaritasi (peak hours heatmap)
- Filiallar taqqoslash va reyting
- Ofitsiant va oshpaz samaradorligi
- Yo'qotishlar tahlili (chiqim, bekor qilish, qaytarish)
- AI talab bashorati — ertangi kun uchun xarid rejasi
- Rahbar uchun kunlik avtomatik hisobot (Telegram / email)
- ClickHouse ustida tez OLAP so'rovlar

---

## Database jadvallar (rejalashtirilgan)

- `analytics_daily_sales` — kunlik agregatsiya
- `analytics_item_stats` — taom bo'yicha statistika
- `analytics_branch_kpi` — filial KPI
- `analytics_staff_kpi` — xodim KPI
- `analytics_forecasts` — AI bashoratlari

Har bir jadvalda `tenant_id` bo'ladi va model `BelongsToTenant` trait'ini
ishlatadi — bitta restoran boshqasining ma'lumotini hech qachon ko'rmaydi.

---

## API endpointlar (rejalashtirilgan)

```
GET    /api/v1/analytics/                 — modul ma'lumoti
GET    /api/v1/analytics/dashboard        — asosiy dashboard
GET    /api/v1/analytics/sales            — sotuv dinamikasi
GET    /api/v1/analytics/abc              — ABC tahlil
GET    /api/v1/analytics/food-cost        — food-cost hisoboti
GET    /api/v1/analytics/branches         — filiallar taqqoslash
GET    /api/v1/analytics/forecast         — talab bashorati (AI)
```

Barcha endpointlar `auth:sanctum` + `tenant` middleware ostida.
Har bir amal Spatie permission bilan himoyalangan:
`analytics.view`, `analytics.create`, `analytics.update`, `analytics.delete`, `analytics.manage`.

---

## Boshqa modullar bilan bog'liqlik

- **BARCHA MODULLAR** — analitika ularning hammasidan o'qiydi
- **ai-services** — talab bashorati va anomaliya aniqlash
- **ClickHouse** — OLAP saqlash qatlami

---

## Ishlab chiqish

```bash
cd apps/api

# Migratsiya yaratish
php artisan module:make-migration create_<table>_table Analytics

# Model + factory
php artisan module:make-model <Name> Analytics --factory

# Controller
php artisan module:make-controller <Name>Controller Analytics --api

# Testlar
php artisan test --filter=Modules\\Analytics
```

---

## Status

Phase 1 · ✅ **Implementatsiya qilingan** — dashboard, sales, ABC, food-cost, channels, peak-hours.
Model, migratsiya, factory, form request, API resource, controller, RBAC route,
seeder va feature testlar mavjud.

Kanonik namuna: `Modules/Menu`.
