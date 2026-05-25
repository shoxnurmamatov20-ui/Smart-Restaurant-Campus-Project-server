# Modul 7 — Exams (Fanlar test tizimi)

## Maqsad
Universitet darajasidagi online imtihon platformasi — adolatli va xavfsiz.

## Asosiy funksiyalar
- Test bazasi (10,000+ savol har fan bo'yicha)
- Tasodifiy savollar generatori
- Vaqt nazorati
- Avtomatik baholash (test) + qo'lda (essay)
- **Anti-cheat (AI proktoring):**
  - Webcam orqali talaba monitoringi
  - Ko'z harakati tahlili
  - Boshqa ilovalar bloklash (kiosk mode)
  - Tab switch detection
  - Ovoz monitoringi
- Proktoring (live yoki recorded)
- Apellyatsiya tizimi
- Olimpiada va musobaqalar uchun rejim

## Yaratish
```bash
php artisan module:make Exams
```

## Database jadvallar
- `exam_question_banks` (savollar bazasi)
- `exam_questions` (savollar)
- `exam_options` (variantlar)
- `exam_sessions` (imtihonlar)
- `exam_attempts` (urinishlar)
- `exam_answers` (javoblar)
- `exam_proctoring_logs` (anti-cheat logs)
- `exam_appeals` (apellyatsiyalar)

## API endpoints
- `GET  /api/v1/exams/upcoming` — kelayotgan imtihonlar
- `POST /api/v1/exams/{id}/start` — boshlash (proctoring start)
- `POST /api/v1/exams/{id}/submit` — yakunlash
- `POST /api/v1/exams/{id}/proctoring-event` — anti-cheat hodisa
- `POST /api/v1/exams/{id}/appeal` — apellyatsiya

## Integratsiyalar
- **AI Services** — anti-cheat AI (yuz tanish, gaze tracking)
- **Students** — kim topshirayapti
- **KPI** — talaba natijalari

## Status
Phase 1 · skeleton placeholder
