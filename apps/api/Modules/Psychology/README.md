# Modul 6 — Psychology (Psixologik testlar)

## Maqsad
Talabalar va xodimlarning ruhiy holatini doimiy monitoring.

## Asosiy funksiyalar
- 100+ tasdiqlangan psixologik testlar (Beck, MMPI, Eysenck, Lusher)
- Davriy testlar (har semestr/yilda)
- AI orqali avtomatik tahlil va xulosalar
- Risk guruhini aniqlash (depressiya, suitsid)
- Psixolog kabineti (barcha holatlar)
- Online maslahat (chat/video)
- To'liq maxfiylik (encryption at rest)
- Favqulodda yordam tugmasi

## Yaratish
```bash
php artisan module:make Psychology
```

## Database jadvallar
- `psy_tests` (test shablonlari)
- `psy_questions` (savollar)
- `psy_attempts` (urinishlar — encrypted)
- `psy_results` (natijalar — encrypted)
- `psy_consultations` (psixolog bilan uchrashuvlar)
- `psy_emergencies` (favqulodda yordam so'rovlari)

## API endpoints
- `GET  /api/v1/psychology/tests` — mavjud testlar
- `POST /api/v1/psychology/tests/{id}/start` — testni boshlash
- `POST /api/v1/psychology/tests/{id}/submit` — javoblar
- `POST /api/v1/psychology/emergency` — yordam tugmasi
- `GET  /api/v1/admin/psychology/risk-groups` — psixolog uchun

## Integratsiyalar
- **AI Services** (Python) — natijalarni tahlil qilish
- **Notifications** — psixologga xabar (risk darajasi yuqori bo'lsa)
- **Students/HR** — kim test topshiradi

## Xavfsizlik
- Barcha javoblar **AES-256 encrypted** (database column-level)
- Faqat psixolog ko'ra oladi (RBAC)
- Audit log barcha kirishlar

## Status
Phase 1 · skeleton placeholder
