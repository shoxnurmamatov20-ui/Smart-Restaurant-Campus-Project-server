# Modul 10 — KPI (Shaffof KPI tizimi)

## Maqsad
Har xodim va bo'limning natijadorligi — real vaqtda ko'rinadi.

## Asosiy funksiyalar
- Avtomatik KPI hisoblash (boshqa modullardan ma'lumot)
- Maqsadlar (OKR) belgilash va kuzatish
- O'qituvchi reytingi (talaba bahosi, dars sifati, ilmiy ishlar)
- Kafedra/Fakultet reytingi
- Real-time dashboardlar (ClickHouse)
- KPI-ga bog'liq bonuslar (HR + Moliya bilan)
- Past natijaga sabablar tahlili (AI)
- Choraklik / yillik hisobotlar
- 360-graduslik baholash

## Yaratish
```bash
php artisan module:make KPI
```

## Database jadvallar (ClickHouse uchun)
- `kpi_metrics` (xom metrikalar — time-series)
- `kpi_definitions` (KPI formula'lari)
- `kpi_scores` (hisoblangan ballar)
- `kpi_goals` (OKR maqsadlari)
- `kpi_evaluations` (360-graduslik baholash)

## API endpoints
- `GET  /api/v1/kpi/my` — mening KPI'lim
- `GET  /api/v1/kpi/department/{id}` — kafedra KPI
- `GET  /api/v1/kpi/top` — eng yaxshi xodimlar
- `POST /api/v1/kpi/evaluations` — kollegani baholash
- `GET  /api/v1/admin/kpi/overview` — rektor uchun

## Integratsiyalar
- **HAR BIR MODUL** — KPI manbai (HR davomat, Students baholar, Library qarz, va h.k.)
- **ClickHouse** — analytics database
- **AI Services** — past natija sabab tahlili

## Texnik xususiyat
KPI dashboardlar **ClickHouse** ustida ishlaydi (PostgreSQL emas), chunki:
- Agregat hisoblar 1000x tezroq
- Million qator over time series
- Real-time analytics

## Status
Phase 1 · skeleton placeholder
