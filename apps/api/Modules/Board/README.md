# Board — menyu taxtasi

Peshtaxta ustidagi televizor. Konsoldagi `/board` ekranining serveri.

## Uch jadval, uchta yorliq

| Jadval           | Nima                                                         |
| ---------------- | ------------------------------------------------------------ |
| `board.columns`  | Devor qaysi menyu bo'limlarini, qaysi tartibda chizadi       |
| `board.playlist` | Rotatsiya: nima, necha soniya, yoki qaysi soatlar orasida    |
| `board.banners`  | Pastdagi reklama qatori — matn (uz/ru/en), turi, vaqt oynasi |

Uchalasi ham **filialga** bog'langan (`tenant_id` + `branch_id`). Chilonzor
peshtaxtasi bilan Termiz peshtaxtasi bir xil taxtani ko'rsatmaydi.

## Narx va stop-list bu yerda saqlanmaydi

Ustun faqat `menu_category_id` ni ushlaydi. Taomlar, narxlar va «tugadi»
belgisi har renderda Menu'dan o'qiladi:

- `App\Contracts\Menu\MenuCatalog::board()` — bo'limlar va taomlar
- `App\Contracts\Menu\StopList::stoppedItemIds()` — xiralashadiganlar

`Modules\Menu` **hech qachon** import qilinmaydi — `ModuleBoundaryTest` rad
etadi. Sabab tartib emas: o'z narx nusxasini saqlagan taxta narx ko'tarilganidan
keyin ham eskisini ko'rsatadi, o'z stop-list nusxasini saqlagani esa oshxona
pishira olmaydigan taomni sotadi.

Xuddi shu sababdan `menu_category_id` da tashqi kalit yo'q: Menu boshqa
schema'da, va schema orqali constraint — DDL'da yozilgan modul chegarasi.

## Push — yozuv **va** e'lon

`POST board/push` ikkala ishni ham qiladi:

1. **Yozuv:** o'zgargan qatorlarga `published_at` bosiladi. Shungacha uchala
   yorliq — menejerning ish nusxasi, va `updated_at > published_at` konsolga
   «devor hali ko'rmagan» deyishga imkon beradi.
2. **E'lon:** `branch.{branchId}.board` kanaliga `board.pushed`. Menyu taxtasi
   oldida hech kim turmaydi — faqat keyingi qayta yuklashda yangi narxni
   oladigan televizor navbatga o'tgan haftaning narxini reklama qiladi.

Hech narsa o'zgarmagan bo'lsa — hech narsa yozilmaydi va aytilmaydi.

## Endpointlar

```
GET    v1/board/                     modul haqida
GET    v1/board/preview              devor hozir nima ko'rsatyapti (jonli katalog bilan)
POST   v1/board/push                 e'lon qilish

GET    v1/board/columns              POST v1/board/columns
POST   v1/board/columns/reorder      PATCH|DELETE v1/board/columns/{column}
GET    v1/board/playlist             POST v1/board/playlist
POST   v1/board/playlist/reorder     PATCH|DELETE v1/board/playlist/{screen}
GET    v1/board/banners              POST v1/board/banners
                                     PATCH|DELETE v1/board/banners/{banner}
```

Hammasi `auth:sanctum` + `tenant` ostida, `board.{view|create|update|delete}`
ruxsati bilan. **O'qishlar** filialsiz ham ishlaydi (barcha filiallar bo'yicha
yig'indi), **yozuvlar** esa `X-Branch` talab qiladi: bu jadvallarda bo'sh
`branch_id` «filial yo'q» emas, «hamma filial» degani.

## Hali yo'q

**Ekran ro'yxati.** Platforma kassani (`pos.terminals`) va printerni
juftlaydi, tabloni esa yo'q — devordagi ekran shunchaki URL ochadi. Shuning
uchun «Efirda · 2 ekran» dagi raqam `config('board.screens')` dan keladi, ya'ni
operator aytgan son, ulangan son emas. To'g'ri yechim — terminal kabi juftlanadigan
qurilma yozuvi.
