# Modul 9 — Media (DAM — Digital Asset Management)

## Maqsad
Universitet barcha rasm, video, audio materiallari — bitta cloud arxivda.

## Asosiy funksiyalar
- Rasm, video, audio arxivi (terabaytlab)
- Cloud saqlash (MinIO/S3)
- Avtomatik teglar (AI orqali — odamlar, joylar, narsalar)
- Yuz tanish bo'yicha qidiruv
- Video editor (oddiy kesish, qo'shish)
- YouTube/Instagram/Facebook auto-publish
- Brending shablonlari (logo, ranglar)
- Tadbirlar bo'yicha avtomatik to'plamlar
- Universitet sayti uchun media galereya API
- Huquqlar boshqaruvi

## Yaratish
```bash
php artisan module:make Media
```

## Database jadvallar
- `media_assets` (rasm/video/audio — Spatie MediaLibrary)
- `media_collections` (to'plamlar)
- `media_tags` (teglar)
- `media_albums` (albomlar)
- `media_publications` (tashqi publish'lar)

## API endpoints
- `POST /api/v1/media/upload` — yuklash
- `GET  /api/v1/media/search` — qidiruv (mavzu, sana, yuz)
- `POST /api/v1/media/{id}/tag` — teg qo'shish
- `POST /api/v1/media/{id}/publish` — tashqi (YouTube/IG)

## Integratsiyalar
- **MinIO** — fayl saqlash
- **AI Services** — yuz tanish, auto-tagging (OpenAI Vision / AWS Rekognition)
- **CDN** (CloudFlare) — tezkor yetkazib berish

## Spatie paket
Bu modul `spatie/laravel-medialibrary` paketidan to'liq foydalanadi.

## Status
Phase 1 · skeleton placeholder
