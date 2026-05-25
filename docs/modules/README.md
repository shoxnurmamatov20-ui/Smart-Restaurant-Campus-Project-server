# Modullar texnik spec

Har modulning to'liq spetsifikatsiyasi (database schema, API endpoints, UI flows, va h.k.) shu papkada.

## Phase 1 modullar (10)

| # | Fayl | Modul |
|---|------|-------|
| 1 | `01-hr.md` | HR — Kadrlar boshqaruvi |
| 2 | `02-students.md` | Students — Talabalar (HEMIS integratsiya) |
| 3 | `03-online.md` | Online — 5–6 kurs platforma |
| 4 | `04-edms.md` | EDMS — Elektron hujjat aylanishi |
| 5 | `05-rttm.md` | RTTM — IT inventarizatsiya |
| 6 | `06-psychology.md` | Psychology — Psixologik testlar |
| 7 | `07-exams.md` | Exams — Fanlar test tizimi |
| 8 | `08-library.md` | Library — Elektron kutubxona |
| 9 | `09-media.md` | Media — DAM (rasm/video) |
| 10 | `10-kpi.md` | KPI — Shaffof KPI |

> **Hozir:** Har bir modul spec yozilmagan. Modul qurish boshlanishi bilan shu papkada faylga ega bo'ladi.

## Modul spec shabloni

Har modul spec quyidagi bo'limlarni o'z ichiga olishi kerak:

```markdown
# Modul XX — Nom

## Maqsad va kontekst
## Foydalanuvchilar va rollar
## Foydalanuvchi xikoyalari (user stories)
## Database schema
## API endpoints
## UI/UX
## Integratsiyalar
## Xavfsizlik va ruxsatlar
## Testlar
## Migratsiya rejasi (eski tizimdan agar mavjud bo'lsa)
## Open questions
```

## Phase 2 modullar

Phase 2 ga rejalashtirilgan 20 ta qo'shimcha modul `docs/CAMPUS_30_MODULLAR.md` da.
Phase 2 boshlangach, shu yerda alohida fayllar yaratiladi.
