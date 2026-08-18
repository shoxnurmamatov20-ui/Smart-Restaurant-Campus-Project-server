# API hujjatlari

## OpenAPI / Swagger

Laravel API uchun OpenAPI spec generatsiya:

```bash
cd apps/api
# scribe paketi orqali (composer require knuckleswtf/scribe)
php artisan scribe:generate
# Natija: apps/api/public/docs/index.html
```

Yoki:

```bash
# l5-swagger (composer require darkaonline/l5-swagger)
php artisan l5-swagger:generate
```

> **Hozir:** OpenAPI generatsiya quruq emas. API endpoint'lar yozilgach, generator sozlanadi.

## Auto-generated TypeScript SDK

OpenAPI'dan TypeScript types va clientni auto-generate qilish rejada. Ilgari
`packages/sdk/` da qo'lda yozilgan taxminiy client turgan edi; uni hech bir
ilova import qilmasdi va generator baribir ustidan yozardi, shuning uchun paket
olib tashlandi (tarixi git'da). Generator sozlanganda paket qaytadan, lekin
generatsiya natijasi sifatida tug'iladi:

```bash
pnpm openapi-typescript apps/api/storage/api-docs/api-docs.json -o packages/sdk/src/schema.ts
```

Konsollarning bugungi jonli yo'li — `apps/web/src/lib/api-server.ts`
(httpOnly cookie'dagi token bilan server komponentdan o'qish).

## API konventsiyalar

| Aspect     | Convention                                                                   |
| ---------- | ---------------------------------------------------------------------------- |
| URL        | `/api/v1/{module}/{resource}`                                                |
| Auth       | Sanctum (Bearer token)                                                       |
| Format     | JSON only                                                                    |
| Errors     | Standard Laravel: `{"message": "...", "errors": {...}}` (422 for validation) |
| Pagination | Cursor-based (`?cursor=...`)                                                 |
| Filtering  | Spatie Query Builder: `?filter[name]=foo&filter[status]=active`              |
| Sorting    | `?sort=-created_at,name` (`-` for desc)                                      |
| Includes   | `?include=author,comments`                                                   |
| Versioning | URL path: `/api/v1/...` (yangi versiya `/api/v2/...`)                        |

## Status codes

| Code | Use                                    |
| ---- | -------------------------------------- |
| 200  | OK                                     |
| 201  | Created                                |
| 204  | No content (delete)                    |
| 400  | Bad request                            |
| 401  | Unauthorized (no/bad token)            |
| 403  | Forbidden (auth OK, but no permission) |
| 404  | Not found                              |
| 409  | Conflict                               |
| 422  | Validation error                       |
| 429  | Rate limit                             |
| 500  | Server error                           |
