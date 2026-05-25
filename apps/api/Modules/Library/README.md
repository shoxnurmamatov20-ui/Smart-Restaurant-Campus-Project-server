# Modul 8 — Library (Elektron kutubxona)

## Maqsad
Raqamli kitoblar, jurnallar, ilmiy maqolalar — 24/7 mavjud.

## Asosiy funksiyalar
- 50,000+ kitob, jurnal, qo'llanma
- Aqlli qidiruv (Meilisearch — mavzu, muallif, ISBN)
- Online o'qish (PDF, EPUB, audio)
- Yuklab olish (litsenziyaga muvofiq)
- QR orqali jismoniy kitob olish/qaytarish
- Kitob band qilish (reservation)
- Eslatmalar (qaytarish muddati)
- Reyting va sharhlar
- AI tavsiyalari ("sizga yoqishi mumkin...")
- Xalqaro bazalar (Springer, IEEE, JSTOR — Phase 2)

## Yaratish
```bash
php artisan module:make Library
```

## Database jadvallar
- `library_books` (kitoblar)
- `library_authors` (mualliflar)
- `library_categories` (kategoriyalar)
- `library_copies` (jismoniy nusxalar)
- `library_loans` (qarz olishlar)
- `library_reservations` (band qilishlar)
- `library_reviews` (sharhlar)

## API endpoints
- `GET  /api/v1/library/search` — qidiruv (Meilisearch)
- `GET  /api/v1/library/books/{id}` — kitob ma'lumoti
- `POST /api/v1/library/books/{id}/reserve` — band qilish
- `POST /api/v1/library/loans` — qarz olish (QR scan)
- `POST /api/v1/library/loans/{id}/return` — qaytarish

## Integratsiyalar
- **Meilisearch** — qidiruv
- **MinIO** — fayllar (PDF, EPUB, audio)
- **AI Services** — tavsiyalar
- **Students** — qarz oluvchi

## Status
Phase 1 · skeleton placeholder
