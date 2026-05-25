# Modul 1 — HR (Kadrlar boshqaruv)

## Maqsad
Universitet xodimlarining to'liq raqamli boshqaruvi: ishga olishdan pensiyaga chiqishigacha.

## Asosiy funksiyalar
- Xodimlar ma'lumotlar bazasi (passport, diplom, oilaviy holat)
- Face ID + QR + RFID orqali kelish-ketish monitoringi
- Ish vaqti, kechikish, smenalar
- Ta'til, xizmat safari, kasallik varaqasi
- Mehnat shartnomalari, buyruqlar arxivi
- Statistik hisobotlar

## Yaratish

```bash
cd apps/api
php artisan module:make HR
# Modules/HR/ to'liq Laravel modul strukturasi yaratiladi
```

## Database jadvallar (rejada)
- `employees` (xodimlar)
- `employee_attendances` (kelish-ketish)
- `employee_leaves` (ta'til/safar)
- `employee_contracts` (shartnomalar)
- `employee_documents` (hujjatlar)

## API endpoints (rejada)
- `GET    /api/v1/hr/employees` — ro'yxat
- `POST   /api/v1/hr/employees` — yaratish
- `GET    /api/v1/hr/employees/{id}` — bitta
- `PATCH  /api/v1/hr/employees/{id}` — yangilash
- `DELETE /api/v1/hr/employees/{id}` — o'chirish
- `POST   /api/v1/hr/attendance/check-in` — Face ID/QR kelish
- `GET    /api/v1/hr/attendance/today` — bugungi davomat
- `POST   /api/v1/hr/leaves` — ta'til so'rovi

## Boshqa modullar bilan integratsiya
- **KPI** — xodim faolligi va ishlash sifatini hisoblash
- **EDMS** — kadr buyruqlari va shartnomalar
- **Stipendiya/maosh** (Phase 2) — oylik hisoblash

## Status
Phase 1 · Hali boshlanmagan (skeleton placeholder)
