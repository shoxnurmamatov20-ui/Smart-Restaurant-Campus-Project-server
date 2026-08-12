# 🍽️ SMART RESTAURANT CAMPUS — YAGONA RAQAMLI PLATFORMA

> **Slogan:** _SMART RESTAURANT CAMPUS — RESTORANINGIZ BITTA EKRANDA_

**Versiya:** 1.0
**Hujjat turi:** Modullar texnik xaritasi (30 modul)
**Loyiha maqsadi:** Restoran, kafe, oshxona va fast-food tarmoqlari uchun yagona
raqamli ekotizim — ovqatlanish biznesini 100% raqamlashtirish.

---

## 📑 Mundarija

### A BLOK — Asosiy operatsion modullar (10 ta)

1. [Menyu boshqaruvi (Menu)](#1-menyu-boshqaruvi-menu)
2. [Buyurtmalar (Orders)](#2-buyurtmalar-orders)
3. [Oshxona displey tizimi (Kitchen / KDS)](#3-oshxona-displey-tizimi-kitchen--kds)
4. [Stollar va bronlar (Tables)](#4-stollar-va-bronlar-tables)
5. [Ombor va texnologik kartalar (Inventory)](#5-ombor-va-texnologik-kartalar-inventory)
6. [Yetkazib beruvchilar va xaridlar (Suppliers)](#6-yetkazib-beruvchilar-va-xaridlar-suppliers)
7. [Xodimlar va smenalar (Staff)](#7-xodimlar-va-smenalar-staff)
8. [Moliya va kassa (Finance)](#8-moliya-va-kassa-finance)
9. [Mijozlar va sodiqlik (CRM)](#9-mijozlar-va-sodiqlik-crm)
10. [Analitika va BI (Analytics)](#10-analitika-va-bi-analytics)

### B BLOK — Ishlab chiqarish va sifat (5 ta)

11. [Kalkulyatsiya va tex-karta konstruktori](#11-kalkulyatsiya-va-tex-karta-konstruktori)
12. [HACCP va oziq-ovqat xavfsizligi](#12-haccp-va-oziq-ovqat-xavfsizligi)
13. [Chiqim va yo'qotishlar nazorati](#13-chiqim-va-yoqotishlar-nazorati)
14. [Jihozlar va texnik xizmat](#14-jihozlar-va-texnik-xizmat)
15. [Sifat nazorati va sirli mehmon](#15-sifat-nazorati-va-sirli-mehmon)

### C BLOK — Moliyaviy modullar (3 ta)

16. [Ish haqi va motivatsiya](#16-ish-haqi-va-motivatsiya)
17. [Byudjet va xarajatlar nazorati](#17-byudjet-va-xarajatlar-nazorati)
18. [Ko'p yuridik shaxs va soliq hisoboti](#18-kop-yuridik-shaxs-va-soliq-hisoboti)

### D BLOK — Smart infratuzilma (IoT) (4 ta)

19. [Smart Kitchen (IoT oshxona)](#19-smart-kitchen-iot-oshxona)
20. [Kirish nazorati (Access Control)](#20-kirish-nazorati-access-control)
21. [CCTV + AI video analitika](#21-cctv--ai-video-analitika)
22. [Energiya va kommunal monitoring](#22-energiya-va-kommunal-monitoring)

### E BLOK — Mijoz kanallari (4 ta)

23. [Online buyurtma (sayt + WebApp)](#23-online-buyurtma-sayt--webapp)
24. [Mobil ilova](#24-mobil-ilova)
25. [Yetkazib berish va kuryerlar](#25-yetkazib-berish-va-kuryerlar)
26. [Agregatorlar integratsiyasi](#26-agregatorlar-integratsiyasi)

### F BLOK — AI va kelajak texnologiyalari (2 ta)

27. [AI yordamchi (mehmon va menejer uchun)](#27-ai-yordamchi-mehmon-va-menejer-uchun)
28. [Talab bashorati va dinamik narx](#28-talab-bashorati-va-dinamik-narx)

### G BLOK — Aloqa tizimi (1 ta)

29. [Communication Hub (chat + push + help desk)](#29-communication-hub-chat--push--help-desk)

### H BLOK — Hamkorlar (1 ta)

30. [Franchayzing kabineti](#30-franchayzing-kabineti)

---

## 📊 Loyiha statistikasi

| Ko'rsatkich           | Qiymat                                                                                                                                                               |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Modullar soni         | **30**                                                                                                                                                               |
| Bloklar soni          | **8**                                                                                                                                                                |
| Foydalanuvchi rollari | **15** (Egasi, Tarmoq menejeri, Filial menejeri, Osh-boshi, Oshpaz, Ofitsiant, Barmen, Kassir, Hostes, Kuryer, Omborchi, Buxgalter, Marketolog, Super Admin, Mehmon) |
| Telegram botlar       | **50** (10 faol + 40 rejada)                                                                                                                                         |
| Database jadvallar    | **~200+**                                                                                                                                                            |
| API endpointlar       | **~1200+**                                                                                                                                                           |
| Sotuv kanallari       | **4** (zal, olib ketish, yetkazib berish, agregator)                                                                                                                 |

---

# 🅰️ A BLOK — ASOSIY OPERATSION MODULLAR

## 1. Menyu boshqaruvi (Menu)

> Restoran nima sotishini belgilaydigan modul. Hamma narsa shu yerdan boshlanadi.

### 🎯 Asosiy funksiyalar

- 📖 Kategoriyalar daraxti (issiq taomlar, salatlar, ichimliklar, desertlar)
- 🍲 Taom kartochkasi: rasm, tarkib, chiqish og'irligi, kaloriya, tayyorlash vaqti
- ➕ Modifikatorlar va qo'shimchalar (o'tkirlik, garnir, sous, porsiya hajmi)
- 🌐 Ko'p tilli nom va tavsif (uz / ru / en) — bitta satrda jsonb
- ⚠️ Allergenlar va parhez belgilari (halol, vegetarian, gluten-free)
- 💰 Kanal bo'yicha narx: zal, olib ketish, yetkazib berish, agregator
- 🛑 **Stop-list** — ingredient tugaganda taom avtomatik o'chadi, muddat bilan
- 🎁 Aksiya narxlari, biznes-lanch, happy hour
- 📱 QR-menyu uchun publik API (login talab qilmaydi)
- 🔁 Menyu versiyalari va o'zgarishlar tarixi (audit log)

### 👤 Foydalanuvchilar

Osh-boshi, Filial menejeri, Tarmoq menejeri, Marketolog, Mehmon (o'qish)

### 🔗 Integratsiyalar

Orders (narx va mavjudlik), Inventory (tex-karta → tannarx va stop-list),
Kitchen (sex va tayyorlash vaqti), Analytics (ABC tahlil, food-cost)

### 📈 Kutilgan natija

Narx xatolari **0%**, stop-list kechikishi **soatlardan soniyalarga**

---

## 2. Buyurtmalar (Orders)

> Restoran daromadining barcha kanali bitta oqimda.

### 🎯 Asosiy funksiyalar

- 🧾 Buyurtma turlari: zal (dine-in), olib ketish, yetkazib berish, agregator
- 🪑 Stol sessiyasi — bitta stolda bir nechta mehmon, bo'lingan hisob
- 🤵 Ofitsiant terminali: taom qo'shish, izoh, kurs (podacha) tartibi
- 🔄 Holat oqimi: qabul qilindi → oshxonada → tayyor → berildi → to'landi
- ✂️ Hisobni bo'lish (split bill) va birlashtirish
- ❌ Bekor qilish va qaytarish — sabab + rahbar tasdig'i majburiy
- 🏷️ Xizmat haqi, chegirma, promo-kod qo'llash
- ⚡ Real-time yangilanish (Laravel Reverb)
- 🚚 Yetkazib berish: manzil, zona, kuryer, yetkazish vaqti

### 👤 Foydalanuvchilar

Ofitsiant, Hostes, Kassir, Filial menejeri, Kuryer, Mehmon

### 🔗 Integratsiyalar

Menu, Kitchen (chiptaga aylanish), Tables (stol bandligi), Finance (to'lov),
CRM (mijoz tarixi va bonus)

### 📈 Kutilgan natija

Buyurtma xatolari **70% kamayadi**, o'rtacha xizmat vaqti **20% qisqaradi**

---

## 3. Oshxona displey tizimi (Kitchen / KDS)

> Qog'oz chek va qichqiriq o'rniga — ekran, taymer va aniq navbat.

### 🎯 Asosiy funksiyalar

- 🖥️ Sexlar bo'yicha ekranlar: issiq, sovuq, mangal, bar, konditer
- 🎫 Chipta holati: yangi → tayyorlanmoqda → tayyor → berildi
- ⏱️ Tayyorlash taymeri va SLA kechikish ogohlantirishi
- 🍽️ Kurs boshqaruvi — taomlarni to'g'ri tartibda chiqarish
- 👆 Bump-bar / sensorli ekran uchun optimallashtirilgan interfeys
- 👨‍🍳 Oshpazlar bo'yicha yuklama taqsimoti
- 🛑 Stop-list e'lon qilish (ingredient tugadi) — bir tugma
- 🔔 "Tayyor" push → ofitsiant boti va zal ekrani
- 📊 O'rtacha tayyorlash vaqti statistikasi (taom va oshpaz kesimida)

### 👤 Foydalanuvchilar

Oshpaz, Osh-boshi, Barmen, Ofitsiant, Filial menejeri

### 🔗 Integratsiyalar

Orders, Menu (sex va standart vaqt), Inventory (hisobdan chiqarish), Analytics

### 📈 Kutilgan natija

Tayyorlash vaqti **25% barqarorlashadi**, yo'qolgan buyurtmalar **0%**

---

## 4. Stollar va bronlar (Tables)

> Zal — restoranning eng qimmat resursi. Har bir bo'sh stol yo'qotilgan pul.

### 🎯 Asosiy funksiyalar

- 🗺️ Zal xaritasi — real-time bandlik holati
- 🪑 Stollar reestri (sig'im, joylashuv, tur: VIP / terassa / bar)
- 📅 Online bron (sayt, Telegram bot, telefon)
- ✅ Bron tasdiqlash va eslatma (SMS / Telegram)
- ⏳ Kutish ro'yxati (waitlist) va navbat raqami
- 📱 Har stolga QR — mehmon menyuni ochadi va o'zi buyurtma beradi
- 🔗 Stollarni birlashtirish va bo'lish
- 📉 No-show statistikasi va oldindan to'lovli bron
- 🎉 Banket va tadbir bronlari

### 👤 Foydalanuvchilar

Hostes, Ofitsiant, Filial menejeri, Mehmon

### 🔗 Integratsiyalar

Orders (stol sessiyasi), CRM (mijoz afzalliklari), Menu (QR-menyu), TelegramBots

### 📈 Kutilgan natija

Stol aylanmasi **15% oshadi**, no-show **50% kamayadi**

---

## 5. Ombor va texnologik kartalar (Inventory)

> Restoran foydasi shu yerda yutiladi yoki saqlanadi.

### 🎯 Asosiy funksiyalar

- 🥩 Ingredientlar reestri (o'lchov birligi, saqlash sharti, yaroqlilik muddati)
- 📋 Texnologik karta (kalkulyatsiya) — har taom uchun aniq sarf
- 🥟 Yarim tayyor mahsulotlar (zagotovka) va ularning tex-kartasi
- 📉 Real-time qoldiq — sotuvdan avtomatik hisobdan chiqarish
- 🔢 Inventarizatsiya (sanoq) va farqlar akti
- 🗑️ Chiqim (write-off): buzilgan, yaroqsiz, xodim ovqati
- 🔔 Minimal qoldiq ogohlantirishi va avtomatik xarid arizasi
- 🔁 Filiallar o'rtasida ko'chirish (transfer)
- 💸 Food-cost: nazariy sarf vs real sarf farqi

### 👤 Foydalanuvchilar

Omborchi, Osh-boshi, Filial menejeri, Buxgalter

### 🔗 Integratsiyalar

Menu (tannarx va stop-list), Kitchen, Suppliers (kirim), Analytics

### 📈 Kutilgan natija

Yo'qotishlar **40% kamayadi**, inventarizatsiya **kunlardan soatlarga**

---

## 6. Yetkazib beruvchilar va xaridlar (Suppliers)

> Kirim narxi ustidan nazorat — foydaning ikkinchi yarmi.

### 🎯 Asosiy funksiyalar

- 🏢 Yetkazib beruvchilar reestri (shartnoma, to'lov sharti, aloqa)
- 💲 Narxlar jadvali va yetkazuvchilarni taqqoslash
- 📝 Xarid arizasi (purchase order) va tasdiqlash marshruti
- 📦 Kirim hujjati — ombor qoldig'ini oshiradi
- ↩️ Qaytarish va da'vo (buzilgan mahsulot)
- 💳 Hisob-kitob va qarzdorlik nazorati
- ⭐ Yetkazish sifati reytingi (kechikish, sifat, narx)
- ✍️ E-IMZO bilan elektron shartnoma
- 🤖 Telegram bot orqali avtomatik buyurtma

### 👤 Foydalanuvchilar

Omborchi, Filial menejeri, Buxgalter, Yetkazib beruvchi

### 🔗 Integratsiyalar

Inventory (kirim), Finance (xarajat), Analytics (tannarx dinamikasi), TelegramBots

### 📈 Kutilgan natija

Xarid tannarxi **8-12% pasayadi**, qarzdorlik nazorati **100%**

---

## 7. Xodimlar va smenalar (Staff)

> Restoranda xodim xarajati ikkinchi eng katta modda.

### 🎯 Asosiy funksiyalar

- 👥 Xodimlar bazasi: ofitsiant, oshpaz, kassir, barmen, kuryer, menejer
- 🔐 Lavozim va ruxsatlar (RBAC bilan bog'langan)
- 📅 Smenalar jadvali va almashinuv (shift swap)
- 🚪 Davomat: Face ID + QR + PIN orqali smenaga kirish/chiqish
- ⏰ Kechikish, erta ketish, ortiqcha soatlar
- 🏖️ Ta'til, kasallik varaqasi, ish safari
- 💵 Ish haqi asosi: stavka × soat + servis haqi ulushi + bonus
- 🏆 Ofitsiant reytingi (tushum, o'rtacha chek, mehmon bahosi)
- 🩺 Sanitariya kitobchasi va muddati nazorati (HACCP talabi)
- 📄 Mehnat shartnomalari arxivi

### 👤 Foydalanuvchilar

Filial menejeri, Osh-boshi, Buxgalter, Barcha xodimlar (o'z kabineti)

### 🔗 Integratsiyalar

Finance (kassir smenasi), Orders (ofitsiant tushumi), Analytics (KPI), TelegramBots

### 📈 Kutilgan natija

Kechikishlar **40% kamayadi**, ish haqi hisobi **xatosiz**

---

## 8. Moliya va kassa (Finance)

> Har bir so'm qayerdan kelib, qayerga ketganini biladigan modul.

### 🎯 Asosiy funksiyalar

- 🔓 Kassa smenasi: ochish, X-hisobot, Z-hisobot, yopish
- 💳 To'lov usullari: naqd, bank kartasi, Payme, Click, Uzum, korporativ
- 🔀 Aralash to'lov (bir chek — bir necha usul)
- 🧾 **Fiskal modul integratsiyasi** (O'zbekiston onlayn-kassa talabi)
- 🖨️ Chek chop etish va elektron chek (QR)
- ↩️ Qaytarish (refund) — sabab va rahbar tasdig'i bilan
- 💰 Kassadagi naqd nazorati (inkassatsiya)
- 📊 Xarajatlar: ijara, kommunal, ish haqi, xarid
- 📈 Kunlik / oylik moliyaviy hisobot (P&L)
- 🏢 Filiallar bo'yicha konsolidatsiya

### 👤 Foydalanuvchilar

Kassir, Filial menejeri, Buxgalter, Egasi

### 🔗 Integratsiyalar

Orders, Staff (kassir javobgarligi), Suppliers (xarajat), Analytics

### 📈 Kutilgan natija

Kassa farqlari **90% kamayadi**, soliq hisoboti **avtomatik**

---

## 9. Mijozlar va sodiqlik (CRM)

> Yangi mijoz jalb qilish — qaytganini ushlab qolishdan 5 baravar qimmat.

### 🎯 Asosiy funksiyalar

- 👤 Mijozlar bazasi (telefon, tug'ilgan kun, afzalliklar, allergiya)
- 💚 Sodiqlik dasturi: bonus, cashback, darajalar (bronza/kumush/oltin)
- 🎟️ Promo-kodlar va aksiyalar (chegirma, 1+1, biznes-lanch)
- 🎂 Tug'ilgan kun va bayram avtomatik takliflari
- 📊 Segmentatsiya (RFM tahlil)
- ⭐ Fikr-mulohaza va reyting (taom, xizmat, tozalik)
- 😠 Shikoyatlar va ularni hal qilish jarayoni (SLA bilan)
- 📣 SMS / Telegram / push kampaniyalari
- 🎯 Sovuqqon mijozlarni qaytarish (win-back)
- 💎 Mijoz hayotiy qiymati (LTV)

### 👤 Foydalanuvchilar

Marketolog, Filial menejeri, Hostes, Kassir, Mehmon

### 🔗 Integratsiyalar

Orders, Tables (bron tarixi), Analytics (RFM, LTV), TelegramBots

### 📈 Kutilgan natija

Qaytgan mijozlar ulushi **30% oshadi**, kampaniya ROI **o'lchanadigan**

---

## 10. Analitika va BI (Analytics)

> Qaror his-tuyg'u bilan emas, raqam bilan qabul qilinadi.

### 🎯 Asosiy funksiyalar

- 📊 Real-time tushum dashboardi (kun / hafta / oy)
- 🧮 O'rtacha chek, mehmonlar soni, stol aylanmasi
- 🔤 Taomlar ABC/XYZ tahlili — nima sotiladi, nima yo'q
- 💸 Food-cost va marja har bir taom bo'yicha
- 🔥 Soatlik yuklama xaritasi (peak hours heatmap)
- 🏢 Filiallar taqqoslash va reyting
- 👨‍🍳 Ofitsiant va oshpaz samaradorligi
- 🗑️ Yo'qotishlar tahlili (chiqim, bekor qilish, qaytarish)
- 🔮 AI talab bashorati — ertangi kun uchun xarid rejasi
- 📩 Rahbar uchun kunlik avtomatik hisobot (Telegram / email)
- ⚡ ClickHouse ustida tez OLAP so'rovlar

### 👤 Foydalanuvchilar

Egasi, Tarmoq menejeri, Filial menejeri, Buxgalter

### 🔗 Integratsiyalar

**BARCHA MODULLAR** — analitika ularning hammasidan o'qiydi · ai-services · ClickHouse

### 📈 Kutilgan natija

Qarorlar **ma'lumot asosida**, foyda **10-15% oshadi**

---

# 🅱️ B BLOK — ISHLAB CHIQARISH VA SIFAT

## 11. Kalkulyatsiya va tex-karta konstruktori

> Har bir taomning aniq tannarxi va texnologiyasi.

### 🎯 Asosiy funksiyalar

- 📋 Tex-karta konstruktori: ingredient → brutto/netto → chiqish
- 🔥 Issiqlik va sovuq ishlov berishda yo'qotish koeffitsienti
- 🥟 Ko'p bosqichli tayyorlash (zagotovka → yakuniy taom)
- 💰 Avtomatik tannarx (kirim narxi o'zgarganda qayta hisoblanadi)
- 📸 Tayyorlash bosqichlari: matn + rasm + video
- ⚖️ Porsiya kalkulyatori (banket uchun × N)
- 📄 Rasmiy tex-karta blankasi (chop etish)
- 🔄 Versiyalar va tasdiqlash (osh-boshi imzosi)

### 🔗 Integratsiyalar

Menu, Inventory, Analytics, Staff (o'qitish)

---

## 12. HACCP va oziq-ovqat xavfsizligi

> Bitta zaharlanish hodisasi restoranni yopadi.

### 🎯 Asosiy funksiyalar

- 🌡️ Muzlatkich va vitrina harorati (IoT sensor + qo'lda jurnal)
- 🧼 Tozalash jadvali va bajarilganini tasdiqlash (QR skan)
- 📅 Mahsulot yaroqlilik muddati va FIFO nazorati
- 🏷️ Zagotovka yorlig'i (tayyorlangan sana + muddat) chop etish
- 🩺 Xodim sanitariya kitobchasi muddati
- 📋 Kunlik/haftalik checklist va foto-tasdiq
- 🚨 Kritik nuqta buzilganda darhol ogohlantirish
- 📁 Tekshiruv uchun tayyor hujjatlar arxivi

### 🔗 Integratsiyalar

Inventory, Staff, Smart Kitchen (19), TelegramBots (`haccp` bot)

---

## 13. Chiqim va yo'qotishlar nazorati

> Axlat qutisiga tushgan har bir gramm — bu pul.

### 🎯 Asosiy funksiyalar

- 🗑️ Chiqim turlari: buzilgan, yaroqsiz, xodim ovqati, marketing, sinov
- 📸 Chiqim akti (foto majburiy) va rahbar tasdig'i
- 📊 Yo'qotish sabablarining tahlili
- ⚖️ Nazariy sarf vs real sarf farqi (har taom bo'yicha)
- 🚩 Anomaliya aniqlash — kim, qachon, nechta bekor qildi
- 📉 Yo'qotish normasi va undan oshish ogohlantirishi

### 🔗 Integratsiyalar

Inventory, Kitchen, Analytics, Finance

---

## 14. Jihozlar va texnik xizmat

> Ishlamay qolgan pech — yopilgan oshxona.

### 🎯 Asosiy funksiyalar

- 🔧 Jihozlar reestri (pech, muzlatkich, kofemashina, mangal)
- 🏷️ Har jihozga QR — pasport, kafolat, hujjatlar
- 📅 Profilaktika jadvali va eslatma
- 🛠️ Buzilish arizasi (ticket) va usta tayinlash
- 💸 Texnik xizmat xarajatlari va amortizatsiya
- ⏱️ Ishlamay qolgan vaqt (downtime) statistikasi
- 📞 Servis kompaniyalari bazasi

### 🔗 Integratsiyalar

Finance (xarajat), Smart Kitchen (19), Communication Hub (29)

---

## 15. Sifat nazorati va sirli mehmon

> Mehmon aytmaydi — u shunchaki qaytmaydi.

### 🎯 Asosiy funksiyalar

- ✅ Menejer checklistlari (ochilish, smena, yopilish)
- 🕵️ Sirli mehmon (mystery guest) anketasi va natijalari
- 📸 Foto-audit (zal, oshxona, sanuzel)
- 📊 Filiallar bo'yicha sifat reytingi
- 🔁 Tuzatuvchi chora-tadbirlar va ularning bajarilishi
- 🎓 Servis standartlari va xodim attestatsiyasi

### 🔗 Integratsiyalar

Staff, CRM (mehmon fikri), Analytics, Franchayzing (30)

---

# 🅲 C BLOK — MOLIYAVIY MODULLAR

## 16. Ish haqi va motivatsiya

### 🎯 Asosiy funksiyalar

- 🧮 Avtomatik hisob: stavka × soat + servis haqi + bonus − ushlanmalar
- 💚 Servis haqini (tips) adolatli taqsimlash (pool yoki individual)
- 🎯 KPI-ga bog'liq bonuslar (tushum, o'rtacha chek, upsell)
- 📄 Payslip generatsiyasi va Telegram orqali yuborish
- 🏦 Banklarga avtomatik o'tkazish (XML/API)
- 📊 Ish haqi fondi va tushumga nisbati (labour cost %)
- ⚖️ Avans va jarimalar hisobi

### 🔗 Integratsiyalar

Staff, Finance, Analytics, TelegramBots (`payroll` bot)

---

## 17. Byudjet va xarajatlar nazorati

### 🎯 Asosiy funksiyalar

- 💰 Yillik/oylik byudjet rejasi (kategoriya bo'yicha)
- 📊 Real-time xarajat monitoringi va reja/fakt farqi
- 🛒 Xarid arizalari tasdiqlash marshruti (limit bo'yicha)
- 🧾 Kvitansiyalar va chiqimlar arxivi
- 📈 P&L, EBITDA, break-even nuqtasi
- 🔮 Moliyaviy bashorat (AI)
- 🔍 Auditorlik logi — kim nimani o'zgartirdi

### 🔗 Integratsiyalar

Finance, Suppliers, Staff, Analytics

---

## 18. Ko'p yuridik shaxs va soliq hisoboti

### 🎯 Asosiy funksiyalar

- 🏢 Bir nechta yuridik shaxs va ular orasida filiallarni taqsimlash
- 🧾 Fiskal ma'lumotlarni yuridik shaxs kesimida yig'ish
- 📑 Soliq hisoboti uchun eksport (soliq.uz formatlari)
- 💱 Ko'p valyutali hisob (xalqaro kengayish uchun)
- 📊 Konsolidatsiyalangan moliyaviy hisobot
- 🔐 Har bir yuridik shaxs uchun alohida kirish huquqi

### 🔗 Integratsiyalar

Finance, Analytics, Franchayzing (30)

---

# 🅳 D BLOK — SMART INFRATUZILMA (IoT)

## 19. Smart Kitchen (IoT oshxona)

### 🎯 Asosiy funksiyalar

- 🌡️ Muzlatkich, vitrina, sous-vide harorat sensorlari (real-time)
- 🚨 Harorat me'yordan chiqqanda darhol SMS/Telegram
- 💨 Ventilyatsiya va konditsioner avtomatik boshqaruvi
- 🔥 Pech va grill dasturlari (retsept bo'yicha)
- ⚖️ Aqlli tarozi — porsiya nazorati
- 💡 Yorug'lik va energiya avtomatik boshqaruvi
- 📊 Jihoz ishlash vaqti va yuklama monitoringi

### 🔧 Texnologiyalar

ESP32 / Raspberry Pi · MQTT · Zigbee · Edge AI

### 🔗 Integratsiyalar

HACCP (12), Jihozlar (14), Energiya (22), Kitchen (3)

---

## 20. Kirish nazorati (Access Control)

### 🎯 Asosiy funksiyalar

- 🚪 Xodimlar kirishi: Face ID / RFID / PIN
- 🕒 Smenaga kirish-chiqish avtomatik qayd etiladi
- 🔐 Zonalar bo'yicha cheklov (ombor, kassa, ofis)
- 📊 Ish vaqtidan tashqari kirishlar jurnali
- 🚨 Ruxsatsiz kirish urinishida signal
- 🔥 Yong'in xavfi — eshiklar avtomatik ochiladi

### 🔗 Integratsiyalar

Staff (davomat), CCTV (21), Xavfsizlik

---

## 21. CCTV + AI video analitika

### 🎯 Asosiy funksiyalar

- 📹 Kameralarni markazlashgan boshqarish
- 🤖 AI orqali aniqlash:
  - Kassa yonidagi shubhali harakat (chek ochilmagan sotuv)
  - Gigiyena buzilishi (qo'lqop, qalpoq)
  - Navbat uzunligi va kutish vaqti
  - Zalda to'kilish / yiqilish hodisasi
- 🔍 Smart qidiruv ("kecha 19:00 da kassada nima bo'ldi?")
- 💾 Video arxiv va chek bilan bog'lash (kassa hodisasi → video)
- 📊 Mehmonlar oqimi heatmap

### 🔗 Integratsiyalar

Finance (kassa hodisalari), HACCP (12), ai-services (`food_vision`)

---

## 22. Energiya va kommunal monitoring

### 🎯 Asosiy funksiyalar

- ⚡ Elektr, gaz, suv iste'moli real-time
- 📊 Filial va jihoz kesimida taqsimot
- 🚨 Anomaliya (kechasi iste'mol o'smasligi kerak)
- 💡 Tejash tavsiyalari va ularning samarasi
- 💸 Kommunal xarajat tushumga nisbati

### 🔗 Integratsiyalar

Smart Kitchen (19), Finance, Analytics

---

# 🅴 E BLOK — MIJOZ KANALLARI

## 23. Online buyurtma (sayt + WebApp)

### 🎯 Asosiy funksiyalar

- 🌐 Restoran sayti (menyu, galereya, bron, kontakt)
- 🛒 Online buyurtma savati va to'lov
- 📱 Telegram Mini App — bir klikda kirish (initData HMAC)
- 📍 Manzil tanlash (xarita) va yetkazish zonasi tekshiruvi
- ⏱️ Yetkazish/tayyorlash vaqti hisoblagichi
- 💚 Sodiqlik bonusini shu yerda ishlatish
- 🔁 "Yana buyurtma qilish" (oxirgi buyurtmani takrorlash)

### 🔗 Integratsiyalar

Menu, Orders, CRM, Finance, TelegramBots

---

## 24. Mobil ilova

### 🎯 Asosiy funksiyalar

- 📱 Mehmon ilovasi: menyu, buyurtma, bron, bonus, tarix
- 🔔 Push bildirishnomalar (buyurtma holati, aksiya)
- 🎫 Raqamli sodiqlik kartasi (QR/NFC)
- 🛵 Kuryer ilovasi: topshiriqlar, marshrut, yetkazildi
- 👨‍🍳 Xodim ilovasi: smena, davomat, payslip
- 📴 Offline rejim (kuryer uchun kritik)

### 🔧 Texnologiyalar

React Native + Expo · FCM · MapKit/Yandex Maps

---

## 25. Yetkazib berish va kuryerlar

### 🎯 Asosiy funksiyalar

- 🗺️ Yetkazish zonalari: narx, minimal buyurtma, vaqt
- 🛵 Kuryerlar reestri va smenalari
- 🎯 Buyurtmalarni avtomatik taqsimlash (masofa + yuklama)
- 📍 Real-time GPS kuzatuv (mehmon uchun ham)
- ⏱️ Yetkazish vaqti SLA va kechikish sababi
- 💰 Kuryer daromadi va yoqilg'i hisobi
- ⭐ Kuryer reytingi

### 🔗 Integratsiyalar

Orders, CRM, Staff, Mobil ilova (24), Agregatorlar (26)

---

## 26. Agregatorlar integratsiyasi

### 🎯 Asosiy funksiyalar

- 🔗 Yandex Eats, Express24, Uzum Tezkor — bitta oqimda
- 📖 Menyu va narxlarni agregatorlarga avtomatik sinxronlash
- 🛑 Stop-list bir joydan barcha kanalga tarqaladi
- 🧾 Agregator buyurtmasi ham KDS'ga tushadi
- 💸 Komissiya hisobi va real marja
- 📊 Kanal bo'yicha rentabellik taqqoslash

### 🔗 Integratsiyalar

Menu, Orders, Kitchen, Finance, Analytics

---

# 🅵 F BLOK — AI VA KELAJAK TEXNOLOGIYALARI

## 27. AI yordamchi (mehmon va menejer uchun)

### 🎯 Asosiy funksiyalar

- 🤖 **Mehmon uchun:** "yengilroq, achchiq bo'lmagan narsa" → menyudan tavsiya
- ⚠️ Allergiyani hisobga oladi va nima uchun taklif qilmaganini aytadi
- 🗣️ Ko'p tilli (uz / ru / en)
- 📊 **Menejer uchun:** "bu hafta nega food-cost oshdi?" → tahlil va sabab
- 📝 Sharh va shikoyatlarga javob loyihasini tayyorlaydi
- 🔍 Butun ekotizim bo'ylab tabiiy tilda qidiruv

### ⚠️ Muhim qoida

AI **faqat sotuvda bor taomni** tavsiya qiladi. Stop-listdagi taomni taklif
qilish — javob bermaslikdan yomonroq.

### 🔧 Texnologiyalar

Anthropic Claude / OpenAI · RAG · FastAPI (`apps/ai-services`)

---

## 28. Talab bashorati va dinamik narx

### 🎯 Asosiy funksiyalar

- 🔮 Ertangi kun uchun buyurtmalar va tushum bashorati
- 🧾 Bashoratdan avtomatik prep-list va xarid rejasi
- 🌦️ Ob-havo, bayram, tadbir, ish haqi kunlari hisobga olinadi
- 💸 Dinamik narx / aksiya tavsiyasi (past soatlarni to'ldirish)
- 📉 Yo'qotish bashorati (nima buzilib qolishi mumkin)
- 👥 Smenaga nechta xodim kerakligi tavsiyasi

### 🔧 Texnologiyalar

Prophet / LightGBM · ClickHouse · FastAPI

### 📈 Kutilgan natija

Ortiqcha zagotovka **30% kamayadi**, stop-list hodisalari **yarmiga tushadi**

---

# 🅶 G BLOK — ALOQA TIZIMI

## 29. Communication Hub (chat + push + help desk)

### 🎯 Asosiy funksiyalar

**💬 Ichki aloqa:**

- Smena chati (zal ↔ oshxona ↔ menejer)
- Filiallar va tarmoq darajasidagi e'lonlar
- Fayl va foto ulashish

**🔔 Bildirishnomalar:**

- Push (mobile), SMS (Eskiz), Email, Telegram, In-app

**🎫 Help Desk:**

- Jihoz buzilishi, IT muammo, ta'minot masalasi
- Auto-routing va SLA monitoring
- Bilim bazasi (FAQ, video-yo'riqnoma)

**📢 Mehmonlarga e'lonlar:**

- Yangi menyu, aksiya, ish vaqti o'zgarishi

### 🔗 Integratsiyalar

**HAR BIR MODUL** bilan — bildirishnoma kanali sifatida

---

# 🅷 H BLOK — HAMKORLAR

## 30. Franchayzing kabineti

### 🎯 Asosiy funksiyalar

- 🤝 Franchayzi hamkorlar reestri va shartnomalari
- 📊 Har bir hamkor uchun cheklangan dashboard
- 💰 Royalti hisobi (tushumdan foiz) va to'lov nazorati
- 📖 Brend standartlari to'plami (menyu, tex-karta, dizayn)
- ✅ Standartlarga muvofiqlik auditi (15-modul bilan)
- 🎓 Yangi hamkorni ishga tushirish (onboarding) yo'l xaritasi
- 📈 Tarmoq bo'ylab benchmarking

### 🔗 Integratsiyalar

Analytics, Finance, Sifat nazorati (15), Ko'p yuridik shaxs (18)

---

# 🏗️ UMUMIY ARXITEKTURA

```
┌──────────────────────────────────────────────────────────────────┐
│                    FOYDALANUVCHI INTERFEYSLARI                    │
├──────────────────────────────────────────────────────────────────┤
│  Xodim web   │  POS/KDS     │  Mehmon      │  Telegram          │
│  (Next.js)   │  (tablet)    │  (QR/mobile) │  (50 bot)          │
└──────┬───────┴──────┬───────┴──────┬───────┴────────┬───────────┘
       │              │              │                │
       └──────────────┴──────┬───────┴────────────────┘
                             │
            ┌────────────────▼────────────────┐
            │   Nginx / API Gateway           │
            │   + Rate limit + TLS            │
            └────────────────┬────────────────┘
                             │
       ┌─────────────────────┼─────────────────────┐
       │                     │                     │
       ▼                     ▼                     ▼
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│  Auth/RBAC  │      │  Laravel    │      │   AI/ML     │
│  (Sanctum)  │      │  11 modul   │      │  (FastAPI)  │
└─────────────┘      └──────┬──────┘      └─────────────┘
                            │
       ┌────────────────────┼────────────────────┐
       │                    │                    │
       ▼                    ▼                    ▼
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│ PostgreSQL  │      │   Redis     │      │ ClickHouse  │
│ (asosiy)    │      │  + Reverb   │      │ (analytics) │
└─────────────┘      └─────────────┘      └─────────────┘
       │                    │                    │
       └────────────────────┼────────────────────┘
                            │
                     ┌──────▼──────┐
                     │  S3/MinIO   │
                     │  (fayllar)  │
                     └─────────────┘

┌──────────────────────────────────────────────────────────────────┐
│            INTEGRATSIYALAR (TASHQI XIZMATLAR)                     │
├──────────────────────────────────────────────────────────────────┤
│  Fiskal modul │ Payme │ Click │ Uzum │ Eskiz SMS │ E-IMZO       │
│  Yandex Eats  │ Express24 │ Uzum Tezkor │ Telegram │ Claude     │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│            IoT QURILMALARI                                        │
├──────────────────────────────────────────────────────────────────┤
│  Harorat sensorlari │ Aqlli tarozi │ CCTV │ Face ID turniket    │
│  Fiskal printer     │ KDS ekranlar │ Barcode/QR skanerlar       │
└──────────────────────────────────────────────────────────────────┘
```

---

# 🗓️ AMALGA OSHIRISH BOSQICHLARI (ROADMAP)

## 🚀 1-FAZA — Poydevor va sotuv oqimi (3 oy)

**Maqsad:** restoran haqiqatda ishlay oladigan minimal to'liq oqim

- Auth, RBAC, tenancy, monitoring, CI/CD
- **Modullar:** 1 (Menu), 2 (Orders), 3 (Kitchen), 8 (Finance)
- **Natija:** buyurtma qabul qilinadi → oshxonaga tushadi → to'lanadi → chek chiqadi

## 🏗️ 2-FAZA — Zal va ombor (3 oy)

- **Modullar:** 4 (Tables), 5 (Inventory), 6 (Suppliers), 11 (Tex-karta)

## 👥 3-FAZA — Xodim va mijoz (3 oy)

- **Modullar:** 7 (Staff), 9 (CRM), 10 (Analytics), 16 (Ish haqi)

## 📡 4-FAZA — Kanallar (3 oy)

- **Modullar:** 23 (Online), 25 (Yetkazish), 26 (Agregatorlar), 24 (Mobil)

## 🛡️ 5-FAZA — Sifat va nazorat (3 oy)

- **Modullar:** 12 (HACCP), 13 (Chiqim), 14 (Jihozlar), 15 (Sifat), 17 (Byudjet)

## 🏢 6-FAZA — Smart IoT (3 oy)

- **Modullar:** 19 (Smart Kitchen), 20 (Access), 21 (CCTV+AI), 22 (Energiya)

## 🤖 7-FAZA — AI va tarmoq (3 oy)

- **Modullar:** 27 (AI yordamchi), 28 (Bashorat), 29 (Communication), 30 (Franchayzing), 18 (Ko'p yuridik shaxs)

## ✅ 8-FAZA — Optimallashtirish (2 oy)

- Performance, security audit, UAT, hujjatlar

**UMUMIY MUDDAT:** ~23 oy

---

# 💎 LOYIHA YAKUNIY QIYMATI

| Ko'rsatkich            | Oldin   | Keyin     | O'zgarish     |
| ---------------------- | ------- | --------- | ------------- |
| Food-cost              | 38%     | 30%       | **−8 p.p.**   |
| Ombor yo'qotishlari    | 100%    | 60%       | **−40%**      |
| O'rtacha xizmat vaqti  | 100%    | 80%       | **−20%**      |
| Stol aylanmasi         | 100%    | 115%      | **+15%**      |
| Qaytgan mijozlar       | 100%    | 130%      | **+30%**      |
| Kassa farqlari         | Bor     | ~0        | **−90%**      |
| Inventarizatsiya vaqti | 1 kun   | 1 soat    | **8× tezroq** |
| Hisobot tayyorlash     | Soatlar | Soniyalar | **avtomatik** |

## 🏆 Strategik natija

- ✅ **Bitta tizim** — POS, ombor, oshxona, kadr, analitika alohida emas
- ✅ **Tarmoq sifatida o'sish** — yangi filial bir kunda ishga tushadi
- ✅ **Franchayzing tayyor** — standart va nazorat tizimi bilan
- ✅ **Eksport mahsuloti** — boshqa davlatlarga sotiladigan SaaS

---

# 📝 XULOSA

**Smart Restaurant Campus** — bu shunchaki POS emas. Bu restoranning menyusidan
kassasigacha, ombordan mehmon fikrigacha bo'lgan butun hayotini bitta
ma'lumot maydoniga yig'adigan platforma.

30 ta modul → **bitta ekotizim** → **boshqariladigan restoran biznesi**.

> _"Eng yaxshi restoran — bu har bir taomining tannarxini biladigan restoran."_

---

🚀 **SMART RESTAURANT CAMPUS — RESTORANINGIZ BITTA EKRANDA** 🚀
