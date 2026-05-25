# Modul 5 — RTTM (IT inventarizatsiya)

## Maqsad
Universitetdagi barcha IT texnikalari — bitta tizimda nazorat.

## Asosiy funksiyalar
- Kompyuter, printer, server, proyektor reestri
- Har uskunaga QR/Barcode yorliq
- Joylashuv xaritasi (qaysi xonada, kim foydalanmoqda)
- Texnik xizmat ko'rsatish jurnali
- Remont so'rovlari (ticket tizimi)
- Yillik inventarizatsiya (avtomatik)
- Amortizatsiya hisob-kitobi
- Litsenziyalar muddati nazorati

## Yaratish
```bash
php artisan module:make RTTM
```

## Database jadvallar
- `rttm_assets` (texnika)
- `rttm_locations` (joylashuvlar)
- `rttm_assignments` (kim ishlatmoqda)
- `rttm_maintenance` (xizmat ko'rsatish jurnali)
- `rttm_tickets` (remont so'rovlari)
- `rttm_licenses` (litsenziyalar)

## API endpoints
- `GET  /api/v1/rttm/assets` — barcha texnika
- `GET  /api/v1/rttm/assets/scan/{qr}` — QR skan
- `POST /api/v1/rttm/tickets` — remont so'rovi
- `GET  /api/v1/rttm/inventory/yearly` — inventarizatsiya hisoboti

## Integratsiyalar
- **HR** — javob beruvchi xodim
- **EDMS** — texnika sotib olish hujjatlari
- **Byudjet** (Phase 2) — moliyaviy hisob

## Status
Phase 1 · skeleton placeholder
