# Modul 1 — Menu (Menyu boshqaruvi)

> **Status:** ✅ To'liq implementatsiya qilingan — **kanonik namuna** · **Faza:** Phase 1

Restoran nima sotishini belgilaydigan modul. Boshqa hamma narsa shundan
boshlanadi: buyurtma narxni shu yerdan oladi, oshxona sexni shu yerdan biladi,
ombor tannarxni shu yerga qaytaradi.

---

## 1. Maqsad va kontekst

Ko'p restoranlarda menyu uch joyda yashaydi: chop etilgan papka, kassadagi
ro'yxat va oshpazning boshidagi bilim. Uchtasi bir-biriga hech qachon mos
kelmaydi. Bu modul menyuni **bitta manba** qiladi:

- **Kategoriyalar va taomlar** — audit log bilan, versiyalanadigan
- **Ko'p tilli kontent** — bitta satrda `{uz, ru, en}` jsonb
- **Kanal bo'yicha narx** — zal, olib ketish, yetkazish, agregator
- **Stop-list** — ingredient tugadi → bir tugma → hamma kanalda o'chadi
- **Tannarx va marja** — Inventory tex-kartasidan avtomatik

## 2. Foydalanuvchilar va rollar

| Rol                         | Permission                       | Tushuntirish                                  |
| --------------------------- | -------------------------------- | --------------------------------------------- |
| `chef`                      | `menu.*` to'liq                  | Osh-boshi menyuning egasi — barcha CRUD       |
| `brand-manager`             | `menu.view/create/update/manage` | Tarmoq bo'ylab menyu                          |
| `branch-manager`            | `menu.view`, `menu.update`       | Filial darajasida narx va stop-list           |
| `cook`, `bartender`         | `menu.view`, `menu.update`       | **Faqat stop-list** uchun update              |
| `waiter`, `cashier`, `host` | `menu.view`                      | O'qish                                        |
| `marketer`                  | `menu.view`                      | Aksiya tayyorlash uchun                       |
| `courier`                   | —                                | Menyuga umuman kirmaydi                       |
| Mehmon                      | —                                | Faqat publik QR-menyu (`/api/v1/public/menu`) |

**Nega oshpazga `menu.update` berilgan?** Ingredient tugagan payt osh-boshi
zalda bo'lmasligi mumkin. Bu ruxsatsiz zal tugagan taomni sotishda davom etadi
va mehmon 20 daqiqadan keyin "bu taom yo'q ekan" deb eshitadi.

## 3. Foydalanuvchi hikoyalari

1. **Osh-boshi sifatida**, men yangi taom qo'shaman → SKU, ko'p tilli nom,
   narx (tiyinda), sex va tayyorlash vaqti belgilanadi.
2. **Oshpaz sifatida**, qo'y go'shti tugadi → `POST /items/{id}/stop` bilan
   kechgacha to'xtataman, kechqurun yetkazma kelgach o'zi qaytadi.
3. **Filial menejeri sifatida**, men yetkazib berish kanali uchun narxni
   zaldan farqli qilaman.
4. **Mehmon sifatida**, stoldagi QR kodni skanerlab, faqat **hozir sotuvda bor**
   taomlarni ko'raman.

## 4. Database schema

### `menu_categories`

| Ustun                       | Tur                     | Tushuntirish                              |
| --------------------------- | ----------------------- | ----------------------------------------- |
| `id`                        | bigint PK               |                                           |
| `tenant_id`                 | bigint FK→tenants       | Har bir restoran o'z menyusi              |
| `parent_id`                 | bigint FK→self nullable | Ierarxiya                                 |
| `slug`                      | varchar(96)             | Tenant ichida unique                      |
| `name`                      | jsonb                   | `{"uz": "...", "ru": "...", "en": "..."}` |
| `description`               | jsonb nullable          |                                           |
| `icon`, `image_url`         | varchar                 |                                           |
| `sort_order`                | smallint                |                                           |
| `is_active`                 | boolean                 |                                           |
| `timestamps`, `softDeletes` |                         |                                           |

**Indekslar:** `(tenant_id, slug)` unique, `(tenant_id, is_active, sort_order)`,
`(tenant_id, parent_id)`.

### `menu_items`

| Ustun                       | Tur                       | Tushuntirish                                |
| --------------------------- | ------------------------- | ------------------------------------------- |
| `id`                        | bigint PK                 |                                             |
| `tenant_id`                 | bigint FK→tenants         |                                             |
| `menu_category_id`          | bigint FK→menu_categories |                                             |
| `sku`                       | varchar(48)               | Tenant ichida unique, masalan `OSH-001`     |
| `name`, `description`       | jsonb                     | Ko'p tilli                                  |
| `kind`                      | varchar(16)               | `food` / `drink` / `combo` / `other`        |
| `price`                     | bigint                    | **Tiyinda.** 45 000 so'm = `4500000`        |
| `cost_price`                | bigint nullable           | Tex-kartadan hisoblangan tannarx            |
| `currency`                  | char(3)                   | `UZS`                                       |
| `cook_time_minutes`         | smallint                  | KDS taymeri uchun                           |
| `station`                   | varchar(32)               | `hot` / `cold` / `grill` / `bar` / `pastry` |
| `weight_grams`, `calories`  | integer nullable          |                                             |
| `allergens`                 | jsonb nullable            | `["gluten","nuts","dairy"]`                 |
| `is_halal`, `is_vegetarian` | boolean                   |                                             |
| `spice_level`               | tinyint                   | 0..3                                        |
| `is_available`              | boolean                   | **Stop-list bayrog'i**                      |
| `stopped_until`             | timestamp nullable        | Muddat o'tgach taom o'zi qaytadi            |
| `status`                    | varchar(16)               | `draft` / `active` / `archived`             |
| `image_url`, `sort_order`   |                           |                                             |
| `channels`                  | jsonb nullable            | Qaysi kanalda sotiladi                      |
| `metadata`                  | jsonb nullable            |                                             |
| `timestamps`, `softDeletes` |                           |                                             |

**Indekslar:** `(tenant_id, sku)` unique, `(tenant_id, status, is_available)`,
`(tenant_id, menu_category_id, sort_order)`, `(tenant_id, station)`.

> **Nega pul butun son?** Float bilan bir tiyinlik yaxlitlash xatosi kunlik
> buyurtmalarga ko'paytirilganda kassada real farq bo'lib chiqadi. Butun tiyin
> bu muammoni butunlay yo'q qiladi.

## 5. API endpoints

### Xodimlar uchun (`auth:sanctum` + `tenant`)

| Method   | URL                                  | Permission                     |
| -------- | ------------------------------------ | ------------------------------ |
| `GET`    | `/api/v1/menu`                       | `auth` — modul info + counters |
| `GET`    | `/api/v1/menu/categories`            | `menu.view`                    |
| `POST`   | `/api/v1/menu/categories`            | `menu.create`                  |
| `GET`    | `/api/v1/menu/categories/{category}` | `menu.view`                    |
| `PATCH`  | `/api/v1/menu/categories/{category}` | `menu.update`                  |
| `DELETE` | `/api/v1/menu/categories/{category}` | `menu.delete`                  |
| `GET`    | `/api/v1/menu/items`                 | `menu.view`                    |
| `POST`   | `/api/v1/menu/items`                 | `menu.create`                  |
| `GET`    | `/api/v1/menu/items/{item}`          | `menu.view`                    |
| `PATCH`  | `/api/v1/menu/items/{item}`          | `menu.update`                  |
| `DELETE` | `/api/v1/menu/items/{item}`          | `menu.delete`                  |
| `POST`   | `/api/v1/menu/items/{item}/stop`     | `menu.update`                  |
| `POST`   | `/api/v1/menu/items/{item}/resume`   | `menu.update`                  |

### Mehmonlar uchun (login yo'q, faqat `tenant`)

| Method | URL                                   | Tushuntirish                         |
| ------ | ------------------------------------- | ------------------------------------ |
| `GET`  | `/api/v1/public/menu?channel=dine_in` | QR-menyu — faqat sotuvda bor taomlar |

### Query parametrlari (Spatie QueryBuilder)

- `?filter[search]=osh` — SKU va nomning barcha tillari bo'yicha
- `?filter[category]=3` — `menu_category_id`
- `?filter[station]=grill` — oshxona sexi
- `?filter[kind]=drink` · `?filter[status]=active` · `?filter[is_vegetarian]=1`
- `?filter[orderable]=1` — **hozir sotib bo'ladiganlar**
- `?filter[channel]=delivery` — kanal bo'yicha
- `?sort=-price` · `?sort=sort_order` — default `sort_order`
- `?include=category` · `?per_page=50` (max 100)

### Misol javob (`GET /api/v1/menu/items`)

```json
{
  "data": [
    {
      "id": 12,
      "sku": "NAT-001",
      "title": "Osh (to'y palov)",
      "name": { "uz": "Osh (to'y palov)", "ru": "Плов", "en": "Pilaf" },
      "category": { "id": 4, "title": "Milliy taomlar", "slug": "milliy-taomlar" },
      "kind": "food",
      "price": 4500000,
      "price_uzs": 45000,
      "cost_price": 1420000,
      "margin_percent": 68.4,
      "currency": "UZS",
      "cook_time_minutes": 12,
      "station": "hot",
      "weight_grams": 350,
      "calories": 680,
      "allergens": [],
      "is_halal": true,
      "is_vegetarian": false,
      "spice_level": 0,
      "is_available": true,
      "is_orderable": true,
      "stopped_until": null,
      "status": "active",
      "channels": ["dine_in", "takeaway", "delivery"]
    }
  ],
  "links": {},
  "meta": { "current_page": 1, "last_page": 2, "per_page": 25, "total": 32 }
}
```

`title` — joriy til bo'yicha tayyor qiymat (POS tugmasi shuni chizadi),
`name` — muharrir uchun to'liq til xaritasi. Ikkalasi ham ataylab qaytariladi.

## 6. UI/UX

- **Web** (`apps/web/src/app/(dashboard)/menu/page.tsx`) — kategoriyalar daraxti +
  taomlar jadvali (narx, tannarx, marja), stop-list boshqaruvi
- **Admin** — modul yoqilganini nazorat qilish
- **QR-menyu** — mehmon uchun publik ko'rinish
- **Telegram** — `guest` boti `/carte` orqali shu ma'lumotni ko'rsatadi

## 7. Integratsiyalar

| Boshqa modul       | Aloqa                                               |
| ------------------ | --------------------------------------------------- |
| **Orders (2)**     | Buyurtmaga taom qo'shishda narx va mavjudlik        |
| **Kitchen (3)**    | Taomning sexi va standart tayyorlash vaqti          |
| **Inventory (5)**  | Tex-karta → `cost_price`; qoldiq tugasa → stop-list |
| **Analytics (10)** | ABC tahlil, food-cost, marja                        |
| **TelegramBots**   | `guest`, `menu_ai`, `allergen` botlari              |

## 8. Xavfsizlik va izolyatsiya

- **Tenant scope** — `BelongsToTenant` global scope. Bitta restoran boshqasining
  menyusini hech qachon ko'rmaydi; buni `PublicMenuTest` va
  `MenuItemControllerTest` tekshiradi.
- **SKU tenant ichida unique** — ikki restoran ham `OSH-001` sotishi mumkin.
- **Publik endpoint faqat sotuvda bor narsani ko'rsatadi** — `draft`, `archived`
  va stop-listdagi taomlar mehmonga hech qachon chiqmaydi.
- **Audit log** — Spatie ActivityLog `menu.item` / `menu.category`. Narx
  o'zgarishi kim tomonidan qilinganini har doim ko'rsatish mumkin.
- **Validation** — `cost_price` hech qachon `price`dan katta bo'lmaydi;
  kategoriya o'ziga o'zi ota bo'la olmaydi (aks holda QR-menyu render'i cheksiz
  siklga tushardi).

## 9. Testlar

`apps/api/Modules/Menu/tests/Feature/` — **37 ta test**:

**`MenuItemControllerTest`** (24)

- Auth va RBAC: 401, kuryerga 403, ofitsiant o'qiydi lekin yaratolmaydi
- CRUD: yaratish, ko'rish, yangilash, soft delete
- Marja `cost_price`dan hisoblanishi
- Validatsiya: takror SKU, o'zbekcha nom majburiy, tannarx > narx, noma'lum sex
- Stop-list: to'xtatish, muddat o'tgach avtomatik qaytish, resume, `orderable` filtri
- Filter/sort/paginatsiya, `title` joriy tilga mos kelishi
- Modul info counterlari
- **Tenant izolyatsiyasi** — boshqa restoran menyusi ko'rinmasligi

**`MenuCategoryControllerTest`** (8) — CRUD, slug validatsiyasi, o'z-o'ziga ota
bo'lmaslik, `root` filtri, `items_count`

**`PublicMenuTest`** (5) — tenant majburiyligi, faqat sotuvdagi taomlar,
nofaol kategoriyalar yashirinishi, restoranlar orasidagi izolyatsiya

```bash
cd apps/api
php vendor/bin/phpunit --testsuite=Modules
# yoki faqat menyu
php vendor/bin/phpunit --filter=Menu
```

## 10. Seed ma'lumot

`MenuDatabaseSeeder` — real o'zbek restorani menyusi: 8 kategoriya, 32 taom
(osh, manti, lag'mon, shashlik, somsa, salatlar, sho'rvalar, ichimliklar,
desertlar) real narx va 25–40% food-cost bilan.

```bash
php artisan module:seed Menu
```

## 11. Open questions

- [ ] **Modifikatorlar** — alohida `menu_item_modifiers` jadvali qachon kerak
      bo'ladi? Hozircha `metadata`da saqlash mumkin, lekin buyurtma narxiga
      ta'sir qiladigan modifikator alohida jadval talab qiladi.
- [ ] **Kanal bo'yicha narx** — hozir bitta `price`. `menu_prices` jadvali
      Orders moduli bilan birga kiritiladi.
- [ ] **Filial bo'yicha menyu** — bitta tarmoqning ikki filialida menyu farq
      qilsa? `branch_code` ustuni yoki pivot jadval.

## 12. Bog'liq fayllar

```
apps/api/Modules/Menu/
├── app/
│   ├── Http/
│   │   ├── Controllers/
│   │   │   ├── MenuController.php            — modul info + counters
│   │   │   ├── MenuCategoryController.php    — kategoriyalar REST
│   │   │   ├── MenuItemController.php        — taomlar REST + stop-list
│   │   │   └── PublicMenuController.php      — mehmon uchun QR-menyu
│   │   ├── Requests/
│   │   │   ├── StoreMenuCategoryRequest.php
│   │   │   ├── UpdateMenuCategoryRequest.php
│   │   │   ├── StoreMenuItemRequest.php
│   │   │   └── UpdateMenuItemRequest.php
│   │   └── Resources/
│   │       ├── MenuCategoryResource.php
│   │       └── MenuItemResource.php
│   └── Models/
│       ├── MenuCategory.php
│       └── MenuItem.php
├── database/
│   ├── factories/
│   │   ├── MenuCategoryFactory.php
│   │   └── MenuItemFactory.php
│   ├── migrations/
│   │   ├── 2026_08_10_100000_create_menu_categories_table.php
│   │   └── 2026_08_10_100001_create_menu_items_table.php
│   └── seeders/
│       └── MenuDatabaseSeeder.php
├── routes/api.php
└── tests/Feature/
    ├── MenuItemControllerTest.php
    ├── MenuCategoryControllerTest.php
    └── PublicMenuTest.php
```

Core'dagi bog'liq fayllar:

```
apps/api/app/Models/Concerns/
├── BelongsToTenant.php     — tenant global scope
└── HasTranslations.php     — jsonb {uz, ru, en} accessor
```
