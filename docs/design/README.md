# Dizayn handoff — claude.ai/design bilan ishlash

Bu hujjat ikki tomonlama shartnoma: **dizaynerga nima beriladi** va **qaytgan
dizayn kodga qanday tushadi**.

---

## 1. Tizim hozir nima

| Ilova        | Port | Kim uchun                | Palitra        |
| ------------ | ---- | ------------------------ | -------------- |
| `apps/web`   | 3000 | Xodimlar konsoli         | Iliq terakota  |
| `apps/admin` | 3001 | Platforma administratori | Ko'mir kulrang |

Konsolda hozir **10 ta modul sahifasi** bor (hammasi hali bo'sh qolip).
Kassa — 12-modul — hali qurilmagan: backend'i tayyor, interfeysi yo'q.

**Ikkita ilova, o'ttizta modul.** Ilovalar modul bo'yicha emas, **auditoriya va
qurilma** bo'yicha bo'linadi. Shuning uchun 13-, 20-, 30-modul ham `apps/web`
ichiga tushadi — yangi ilova ochilmaydi.

**Yagona komponent kutubxonasi:** `packages/ui` — 26 primitiv (shadcn/ui ·
Radix · Tailwind v4). Ikkala ilova ham shundan oladi; ilgari ikkalasida
bayt-bayt bir xil nusxalar bor edi va ular birlashtirildi.

> **Kassa (12-modul) endi konsol ichida.** U alohida ilova edi (`apps/pos`,
> 3002, o'z komponentlari va qora token qatlami bilan) — olib tashlandi. Uning
> dizayn talablari yo'qolmadi: kassa ekranlari hamon **teginish uchun** (nishon
> ≥ 44px, hover'ga bog'liq hech narsa yo'q), **qorong'i zal uchun** va
> **oflayn** ishlashi kerak. Endi bular alohida tizim emas, `apps/web` ichidagi
> **qamrovli (scoped) rejim** sifatida ifodalanadi — 7-bo'limga qarang.

**Token qatlami:** `packages/ui/src/styles/tokens.css` — bu **shartnoma**.
Semantik nomlarni e'lon qiladi va neytral shkalani beradi; mahsulot qanday
ko'rinishini esa har bir ilova o'z `globals.css` ida xom qiymatlarni qayta
belgilab hal qiladi.

**Jonli galereya:** `pnpm --filter @restaurant/web dev` → **http://localhost:3000/design**
Barcha tokenlar va primitivlar bitta sahifada. Yangi dizayn shunga solishtiriladi.

---

## 2. Eng muhim qoida

> Komponent **semantik nomga** murojaat qiladi — `bg-primary`,
> `text-muted-foreground`, `border-border`. Xom rangni hech qachon yozmaydi va
> yangi token o'ylab topmaydi.

Shu sababli yangi vizual yo'nalish — bitta fayldagi o'nta qiymat, o'ttizta
komponentni qayta yozish emas.

Rang `oklch` da, `hex` da emas: oklch'da yorqinlik idrok bo'yicha chiziqli,
shuning uchun `L` ni surish bilan hosil qilingan palitra har qadamda o'qilishli
qoladi — hex'da bunday emas, va bu bir xil komponentlar yorug' admin konsolida
ham, qorong'i zaldagi kassada ham ishlashi kerak bo'lganda ahamiyatli.

---

## 3. claude.ai/design ga beriladigan brif

Quyidagini o'zgartirmasdan nusxalab bering — unda tizimning haqiqiy holati bor.

```text
Loyiha: Smart Restaurant Campus — restoran, kafe, bar va fast food
shaxobchalari uchun multi-tenant SaaS platforma (O'zbekiston).

Ikkita ilova, uchta yuza:

1. Xodimlar konsoli — desktop, kunduzi, sichqoncha. 12 modul: menyu,
   buyurtmalar, oshxona, stollar, ombor, yetkazib beruvchilar, xodimlar,
   moliya, CRM, analitika, telegram botlar, kassa.
2. O'sha konsol ichidagi KASSA bo'limi — bu alohida ilova emas, lekin
   butunlay boshqa qurilma uchun: gorizontal planshet, qorong'i zal,
   barmoq, kursor yo'q, tez. Uni konsolning qamrovli (scoped) rejimi deb
   qarang: bir xil komponentlar, boshqa tokenlar va boshqa o'lchamlar.
3. Platforma administratori — alohida ilova, desktop, kam ishlatiladi,
   jiddiy.

Texnik cheklovlar — dizayn shularga tushishi kerak:
- Tailwind v4, CSS o'zgaruvchilari, oklch ranglar
- shadcn/ui + Radix primitivlari (26 ta mavjud: accordion, alert, alert-dialog,
  avatar, badge, button, card, checkbox, command, dialog, dropdown-menu, form,
  input, label, popover, radio-group, select, separator, sheet, skeleton,
  sonner, switch, table, tabs, textarea, tooltip)
- Semantik token nomlari: background, foreground, card, popover, primary,
  secondary, muted, accent, destructive, border, input, ring, chart-1..5,
  sidebar va sidebar-*
- Yorug' va qorong'i mavzu — ikkalasi ham
- Radius bitta --radius dan hosil bo'ladi

Kontent qoidalari:
- Interfeys tili: o'zbek (lotin). Ruscha va inglizcha ham bor, lekin dizayn
  o'zbekcha matn bilan tekshirilsin — u eng uzun
- Pul: butun son, tiyinda. Ekranda "45 000 so'm" ko'rinishida, ajratgich —
  uzilmas bo'shliq. Raqamlar tabular (kenglik sakramaydi)
- Sana/vaqt: restoran savdo kuni 06:00 da boshlanadi

Kassa terminali uchun qo'shimcha:
- Teginish nishoni ≥ 44px, raqamli klaviatura 64px
- Hover'ga bog'liq hech narsa bo'lmasin — kursor yo'q
- To'rt rejim, har biri o'z urg'u rangida: restoran (ko'k), fast food
  (to'q sariq), bar (binafsha), kafe (yashil)
```

Dizayner qaytarganda kerak bo'ladigan narsalar:

| Kerak                             | Nega                                            |
| --------------------------------- | ----------------------------------------------- |
| Token qiymatlari (oklch yoki hex) | To'g'ridan-to'g'ri `globals.css` ga tushadi     |
| Yorug' **va** qorong'i variant    | Ikkalasi ham ishlatiladi                        |
| Tipografika shkalasi              | O'lchamlar, og'irliklar, `letter-spacing`       |
| Komponent holatlari               | hover, focus, disabled, error                   |
| Bo'sh va xato holatlar            | Ular dizaynsiz qolsa, kod improvizatsiya qiladi |

---

## 4. Qaytgan dizayn qayerga tushadi

| Dizaynda nima o'zgardi             | Kodda qayer                                                           |
| ---------------------------------- | --------------------------------------------------------------------- |
| Ranglar, radius, shrift            | `apps/*/src/app/globals.css` — faqat qiymatlar                        |
| Yangi semantik token               | `packages/ui/src/styles/tokens.css` — `@theme inline` ga qo'shiladi   |
| Primitiv ko'rinishi (tugma, karta) | `packages/ui/src/components/*.tsx`                                    |
| Yangi primitiv                     | `packages/ui/src/components/` + `src/index.ts` ga eksport             |
| Sahifa maketi                      | `apps/*/src/app/**/page.tsx`                                          |
| Modulga xos komponent              | `apps/web/src/components/<modul>/` — papka kerak bo'lganda yaratiladi |

**Yangi token qo'shishda:** `@theme inline` ga qo'shilmagan o'zgaruvchi
Tailwind'da `bg-*` sinfini hosil qilmaydi. Ikkala joyga ham yozing.

**Yangi primitiv qo'shishda:** 6-bo'limdagi buyruqqa qarang.

---

## 5. Tailwind v4 tuzoqlari

Bular galereyani qurish paytida jonli topildi. Dizayn kelganda ular albatta
uchraydi, shuning uchun oldindan yozib qo'yildi.

**1. Sinf nomi yig'ilmaydi — to'liq yoziladi.**

```tsx
// ✗ hech nima hosil qilmaydi — Tailwind manba matnini o'qiydi, kod ishlatmaydi
<div className={`rounded-${size}`} />
<div className={`bg-chart-${n}`} />

// ✓ to'liq nom
const RADII = [{ name: 'radius-sm', className: 'rounded-sm' }, ...];
```

**2. Ishlatilmagan token umuman chiqmaydi.**

Tailwind v4 `@theme` o'zgaruvchilarini tree-shaking qiladi: birorta utility sinf
murojaat qilmagan token CSS'ga yozilmaydi ham. Shuning uchun

```tsx
// ✗ shaffof chiqadi, chunki --color-chart-3 hech qayerda ishlatilmagan
<div style={{ background: 'var(--color-chart-3)' }} />

// ✓ utility sinf tokenning chiqishini kafolatlaydi
<div className="bg-chart-3" />
```

Bu galereyada aynan shunday bo'ldi: `chart-2` ishladi, chunki uni boshqa joyda
karta ishlatgan edi; qolgan to'rttasi bo'sh qoldi.

**3. Workspace paketi avtomatik skanerlanmaydi.**

`packages/ui` ilova daraxtidan tashqarida, shuning uchun har bir
`globals.css` da:

```css
@source '../../../../packages/ui/src';
```

Busiz kutubxona komponentlari stilsiz chiqadi.

**4. `:root` da belgilangan token `.dark` da ham belgilanishi shart.**

`:root` va `.dark` ikkalasi ham `<html class="dark">` ga bir xil spetsifiklikda
mos keladi, ya'ni **keyin yozilgani yutadi**. Ilova palitrasi umumiy token
qatlamidan keyin keladi — demak faqat `:root` da belgilangan token qorong'i
mavzuda ham **yorug' qiymatini** saqlab qoladi.

Bu farazi emas: admin palitrasi ajratilganda oltita `--sidebar-*` tokeni faqat
`:root` da qolib ketdi va qorong'i panelda deyarli qora fonga deyarli qora
matn tushdi. Hech nima yiqilmadi — shunchaki bir mavzuda panel o'qib
bo'lmaydigan bo'lib qoldi.

Shuning uchun bu qoida endi **test bilan majburlanadi**:
`apps/web/src/app/design/tokens.test.ts`. Dizayn kelib palitra o'zgarganda
birinchi bo'lib shu test gapiradi.

**5. CSS `@import` paket nomi bilan ishlamadi.**

Tailwind CSS importini paketning `exports` xaritasidan `style` sharti bo'yicha
qidiradi va `@restaurant/ui/styles/tokens.css` ni qanday e'lon qilinmasin qabul
qilmadi. Nisbiy yo'l ishlatiladi — `@source` ham baribir nisbiy.

---

## 6. Tekshirish

Har qanday dizayn o'zgarishidan keyin:

```bash
pnpm type-check && pnpm lint && pnpm test && pnpm format:check && pnpm build
```

Vizual tekshiruv: **http://localhost:3000/design** — yorug' va qorong'i
mavzuda. Galereyada **26 primitivning hammasi** bor, shu jumladan interaktivlari
(dialog, sheet, dropdown, select, command, form). Buzilgan swatch = butun
tizimda buzilgan tugma.

### Shartnomani majburlaydigan testlar

Uchta narsa endi sharh emas, test:

| Test                                       | Nimani ushlaydi                                                                            |
| ------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `packages/ui/src/index.test.ts`            | Komponent xom rang yozsa (`bg-white`, `text-slate-500`) va barreldan eksport tushib qolsa  |
| `apps/web/src/app/design/tokens.test.ts`   | `:root` da belgilanib `.dark` da unutilgan token — qorong'i mavzuni jimgina buzadigan xato |
| `apps/web/src/app/(dashboard)/nav.test.ts` | Havolasiz sahifa yoki sahifasiz havola                                                     |

Birinchisi eng muhimi: agar u yiqilsa, demak yangi palitra o'sha komponentga
yetib bormaydi — dizayn o'zgardi-yu, ekran o'zgarmadi.

### Yangi primitiv qo'shish

`components.json` `packages/ui` ichida turadi (ilgari `apps/web` va `apps/admin`
da nusxa bor edi va ikkalasi ham allaqachon mavjud bo'lmagan `@/components/ui`
ga ko'rsatardi):

```bash
cd packages/ui && pnpm dlx shadcn@latest add <nom>
# keyin src/index.ts ga eksport qo'shing — index.test.ts buni tekshiradi
```

---

## 7. Ataylab qilinmagan narsalar

- **Storybook yo'q.** `/design` sahifasi xuddi shu ishni qiladi va u haqiqiy
  ilova ichida ishlaydi — ya'ni haqiqiy tokenlar bilan, alohida muhitda emas.
- **Dizayn tokenlari JSON'da emas.** CSS o'zgaruvchisi yagona manba; JSON nusxa
  bo'lsa, ikkalasi bir kun kelib farq qiladi.
- **Kassa uchun alohida ilova yo'q.** Bu qaror ataylab qayta ko'rib chiqildi:
  ilgari `apps/pos` alohida PWA edi, endi u 12-modul sifatida konsol ichida.
  Sabab oddiy — ilova auditoriya bo'yicha bo'linadi, modul bo'yicha emas; aks
  holda 30 modul 30 ta ilovaga aylanardi.

  **Lekin qurilma farqi yo'qolgani yo'q**, va dizaynda buni hal qilish kerak.
  Kassir qorong'i zalda, planshetda, ho'l qo'l bilan, kursorsiz ishlaydi;
  menejer yorug' xonada, sichqoncha bilan. Bitta `Button` ikkala holatga
  birdek xizmat qila olmaydi.

  Shuning uchun kassa ekranlari **qamrovli rejim** bo'lib ifodalanadi: konsol
  ichidagi bir bo'lim `data-surface="till"` kabi belgi ostida o'z tokenlarini
  (qora fon, rejim urg'usi) va o'z o'lchamlarini (nishon ≥ 44px, raqamli
  klaviatura 64px) oladi. Dizayn kelganda **shu ikki holat ham** kerak —
  bittasi yetmaydi.
