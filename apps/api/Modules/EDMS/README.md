# Modul 4 — EDMS (Elektron hujjat aylanishi)

## Maqsad
Universitet bo'ylab barcha hujjatlar — qog'ozsiz, raqamli imzo (E-IMZO) bilan.

## Asosiy funksiyalar
- Elektron arizalar (talaba/xodim → dekan/rektor)
- Buyruqlar va farmoyishlar konstruktori (shablonlar)
- **E-IMZO integratsiyasi** (Elektron raqamli imzo)
- **QR-kod tasdiqlash** har hujjatda
- Workflow (qabul → ko'rib chiqish → tasdiqlash → arxiv)
- Hujjatlar arxivi (qidiruv, filter)
- OCR — eski qog'oz hujjatlarni indekslash
- Versiya nazorati

## Yaratish
```bash
php artisan module:make EDMS
```

## Database jadvallar
- `edms_documents` (hujjatlar)
- `edms_document_versions` (versiyalar)
- `edms_workflows` (marshrutlar)
- `edms_workflow_steps` (bosqichlar — kim, qachon, qaror)
- `edms_signatures` (E-IMZO)
- `edms_templates` (shablonlar)

## API endpoints
- `GET  /api/v1/edms/documents` — mening hujjatlarim
- `POST /api/v1/edms/documents` — yangi hujjat
- `POST /api/v1/edms/documents/{id}/sign` — E-IMZO
- `GET  /api/v1/edms/verify/{qr-code}` — QR orqali tekshirish
- `GET  /api/v1/edms/templates` — shablonlar

## Integratsiyalar
- **E-IMZO** (https://e-imzo.uz) — raqamli imzo
- **MinIO** — fayl saqlash
- **HR**, **Students** — workflow ishtirokchilari

## Status
Phase 1 · skeleton placeholder
