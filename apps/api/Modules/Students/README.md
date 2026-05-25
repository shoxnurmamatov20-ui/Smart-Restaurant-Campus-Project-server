# Modul 2 — Students (Talabalar boshqaruv)

## Maqsad
Talabaning butun universitet hayoti — qabuldan diplom olishigacha.

## Asosiy funksiyalar
- HEMIS to'liq integratsiyasi (real-time sinxron)
- Qabul jarayoni (online ariza, hujjat yuklash)
- Talaba shaxsiy kabineti (profil, jadval, baholar)
- Elektron jurnal va davomat
- Akademik tarix (GPA, kurslar)
- Online murojaatlar
- Talaba ID-kartochka (RFID/QR)
- Spravkalar avtomatik berish

## Yaratish

```bash
cd apps/api
php artisan module:make Students
```

## Database jadvallar (rejada)
- `students` (talabalar — HEMIS sync)
- `student_groups` (guruh-kurs)
- `student_grades` (baholar)
- `student_attendance` (davomat)
- `student_applications` (murojaatlar)
- `student_certificates` (spravkalar)

## API endpoints (rejada)
- `GET  /api/v1/students` — ro'yxat
- `GET  /api/v1/students/me` — talaba o'z kabineti
- `POST /api/v1/students/sync-hemis` — manual HEMIS sync (admin)
- `GET  /api/v1/students/{id}/grades` — baholar
- `POST /api/v1/students/applications` — yangi murojaat
- `GET  /api/v1/students/certificates/generate` — spravka PDF

## Integratsiyalar
- **HEMIS** (https://hemis.uz) — talaba ma'lumotlar manbai
- **HR** — guruh rahbarlari
- **Exams**, **Library**, **KPI** — talaba ma'lumotlari

## Status
Phase 1 · skeleton placeholder
