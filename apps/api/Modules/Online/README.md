# Modul 3 — Online (5-6 kurs platforma)

## Maqsad
Magistratura va sirtqi/kechki ta'lim uchun online ta'lim platformasi.

## Asosiy funksiyalar
- Live video darslar (WebRTC, HD + recording)
- Video konferensiya integratsiyasi (Zoom, Google Meet, BigBlueButton)
- Screen sharing, interactive whiteboard
- Dars rejasi, materiallar, vazifalar
- Real-time davomat (face ID + activity)
- Dars chat va savol-javob
- Yozib olingan darslar arxivi

## Yaratish
```bash
php artisan module:make Online
```

## Database jadvallar
- `online_courses` (kurslar)
- `online_lessons` (darslar — jadval bilan)
- `online_lesson_recordings` (yozib olinganlar)
- `online_attendance` (davomat)
- `online_materials` (materiallar)

## API endpoints
- `GET  /api/v1/online/courses` — kurslar
- `GET  /api/v1/online/lessons/today` — bugungi darslar
- `POST /api/v1/online/lessons/{id}/join` — darsga ulanish
- `GET  /api/v1/online/recordings/{id}` — yozib olingan video

## Integratsiyalar
- **Students** — talaba ma'lumotlari
- **HR** — o'qituvchi
- **MinIO** — video saqlash
- **Reverb** — real-time dars chat

## Status
Phase 1 · skeleton placeholder
