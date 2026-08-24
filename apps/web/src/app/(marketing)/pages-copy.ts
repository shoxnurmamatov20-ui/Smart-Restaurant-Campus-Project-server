/**
 * The public site's own copy, transcribed from the design file.
 *
 * `files/Smart Restaurant Cloud - Sayt v2.dc.html` — its `t` object and its
 * MODS / ROLES / PLANS / CMP / FAQ / integrations / cases / pains / surfaces
 * arrays, in the order the design declares them.
 *
 * **Why not `src/i18n`.** That catalogue is shared with the staff console and
 * is keyed by namespace; this is one surface's prose, six pages of it, and it
 * follows the pattern `(guest)/guest-copy.ts` and `(customer)/customer-copy.ts`
 * already set — the copy for a surface lives beside the surface.
 *
 * **It was generated, not retyped.** Every string below was read out of the
 * design file by evaluating its own script block once per language, so the
 * three languages cannot have drifted in transcription and no sentence is a
 * paraphrase. Structure that is not prose — prices, chip keys, tone names,
 * device dimensions — is in `pages-data.ts` instead, so a colour is never
 * translated and a price is never in three places.
 */

const uz = {
  roiInputs: [
    {
      label: 'Filiallar soni',
      hint: '1 dan 20 gacha',
    },
    {
      label: 'Bir filialning oylik tushumi',
      hint: 'so’m, QQS bilan · 20 mln qadam bilan',
    },
    {
      label: 'Bir filialdagi xodimlar',
      hint: 'Barcha smenalar bo’yicha',
    },
  ],
  roiRows: [
    {
      label: 'Kassa va bekor qilish yo’qotishi',
      basis: 'Aylanmaning 1.2% · nazorat paneli va tasdiq zanjiri hisobiga',
    },
    {
      label: 'Oziq-ovqat foizini kamaytirish',
      basis: 'Aylanmaning 1.8% · texnologik karta va chiqindi nazorati',
    },
    {
      label: 'Hisobotga ketadigan vaqt',
      basis: ' soat / oy · soati 45 000 so’m hisobida',
    },
    {
      label: 'Tarif to’lovi',
      basis: 'Start',
    },
  ],
  roiPaybackBefore: 'Tarif to’lovi ',
  roiPaybackAfter: '-kunda o’zini oqlaydi',
  roiNoPayback:
    'Bu hajmda tizim hozircha o’zini oqlamaydi — bizga qo’ng’iroq qiling, boshqa yechim taklif qilamiz',
  planYearBefore: 'Yiliga ',
  planYearAfter: ' so’m · ikki oy bepul',
  planCustom: 'Kelishuv',
  planPer: 'so’m / oyiga',
  cusCities:
    'Platforma shu shaharlarda ishlaydi — to’lov, fiskal qoida va til shu yerda hal qilingan:',
  cities: ['Toshkent', 'Samarqand', 'Buxoro', 'Termiz', 'Farg’ona'],
  steps: [
    {
      title: 'Qo’ng’iroq yoki xabar',
      body: 'Restoraningiz haqida so’raymiz: nechta filial, qanday oshxona, hozir nima ishlatasiz. Sotuv bosimi yo’q — mos kelmasa, o’zimiz aytamiz.',
      when: 'Shu kuni',
    },
    {
      title: 'Jonli demo',
      body: 'Sizning menyungiz bilan to’ldirilgan tizimni ko’rsatamiz — namoyish ma’lumoti bilan emas. Ofitsiant, oshpaz va egasi ekranini ketma-ket ko’rasiz.',
      when: '2–3 kun ichida · 40 daqiqa',
    },
    {
      title: 'Bitta filialda sinov',
      body: '14 kun, to’liq funksiyalar, karta talab qilinmaydi. Ma’lumotni biz ko’chiramiz, xodimlarni biz o’rgatamiz. Yoqmasa — hech narsa to’lamaysiz.',
      when: 'Bir kunda ishga tushadi',
    },
  ],
  contactRows: [
    {
      label: 'Telefon',
      copied: 'Raqam nusxalandi',
    },
    {
      label: 'Telegram',
      copied: 'Manzil nusxalandi',
    },
    {
      label: 'Elektron pochta',
      copied: 'Pochta nusxalandi',
    },
    {
      label: 'Ofis',
      copied: 'Manzil nusxalandi',
    },
  ],
  branchOptions: ['1 filial', '2–5', '6–15', '15 dan ko’p'],
  whenOptions: ['Shu hafta', 'Bu oyda', 'Hozircha o’rganmoqdaman'],
  roiMillions: 'mln',
  roiPlanExtra: 'Growth + qo’shimcha filiallar',
  mock: {
    date: 'Seshanba, 11-avgust',
    branch: 'Chilonzor filiali',
    day: 'Bugun',
    week: 'Hafta',
    revenue: 'Tushum',
    orders: 'Buyurtmalar',
    closed: 'yopilgan',
    chart: 'So’nggi 12 oy',
    alert: 'Mol go’shti kritik darajada — 2.4 kg qoldi',
  },
  stats: ['bo’lim konsolda', 'modul serverda', 'til: uz · ru · en', 'kassa rejimi'],
  compliance: [
    {
      title: 'Onlayn-kassa va fiskal modul',
      body: 'Har bir chek soliq.uz ga real vaqtda yuboriladi. Modul holati kassir ekranida ko’rinadi.',
    },
    {
      title: 'Elektron hisob-faktura (EHF)',
      body: 'Didox orqali yetkazib beruvchilar bilan hujjat almashinuvi. Kutilayotganlar bir navbatda.',
    },
    {
      title: 'QQS va soliq hisoboti',
      body: 'Chorak hisoboti tizim ichida shakllanadi va topshirishga tayyor beriladi.',
    },
    {
      title: '1C ga eksport',
      body: 'Buxgalteriyani 1C da yuritsangiz, oylik ma’lumot bir tugma bilan ko’chiriladi.',
    },
  ],
  quotes: [
    {
      quote:
        'Uch filialda uch xil hisob yuritardik. Endi ertalab telefonni ochib, kechagi foydani ko’raman. Menyudan ikkita taomni olib tashladik — ular foyda keltirmayotgan ekan.',
      role: 'Egasi · uch filialli milliy oshxona',
    },
    {
      quote:
        'Kassa farqi oyiga bir necha marta chiqardi va sababini topolmasdik. Nazorat paneli birinchi haftadayoq javobni ko’rsatdi.',
      role: 'Menejer · 24 soatlik choyxona',
    },
    {
      quote:
        'Oshxonada chekni qo’lda yozardik va yo’qotardik. Endi grill o’z navbatini, salat o’z navbatini ko’radi. Kutish vaqti sezilarli qisqardi.',
      role: 'Egasi · to’y va tadbir zali',
    },
  ],
  page: {
    nProduct: 'Mahsulot',
    nRoles: 'Kim uchun',
    nPricing: 'Narxlar',
    nCustomers: 'Stsenariylar',
    nFaq: 'Savollar',
    nContact: 'Aloqa',
    nLogin: 'Kirish',
    nDemo: 'Demo so’rash',
    heroPill: '24 bo’lim · kassa, oshxona, ombor, hisob — bitta tizimda',
    heroH: 'Restoraningiz bitta ekranda',
    heroP:
      'Buyurtmadan hisobotgacha. Ofitsiant, oshpaz, kassir, omborchi va egasi — hammasi bitta tizimda, o’zbek tilida.',
    heroCta1: 'Bepul demo olish',
    heroCta2: 'Mahsulotni ko’rish',
    heroNote: '14 kun bepul sinov · Karta talab qilinmaydi · 1 kunda ishga tushirish',
    mockDate: 'Seshanba, 11-avgust',
    mockTitle: 'Chilonzor filiali',
    mockDay: 'Bugun',
    mockWeek: 'Hafta',
    mockRev: 'Tushum',
    mockOrd: 'Buyurtmalar',
    mockDone: 'yopilgan',
    mockChart: 'So’nggi 12 oy',
    mockAlert: 'Mol go’shti kritik darajada — 2.4 kg qoldi',
    painEyebrow: 'Nima o’zgaradi',
    painH: 'Uchta narsa restoranning foydasini yeydi',
    painP:
      'Ular ko’rinmaydi, chunki hech kim ularni o’lchamaydi. Tizim o’lchashni boshlaganda ular o’z-o’zidan kamayadi.',
    painBefore: 'Hozir',
    painAfter: 'Tizim bilan',
    surfEyebrow: 'Qurilmalar',
    surfH: 'Har bir ish joyi uchun alohida ekran',
    surfP:
      'Oshxona ekranini planshetga siqib qo’ymaymiz. Har bir qurilma o’z ishi uchun alohida loyihalashtirilgan.',
    cEyebrow: 'Qonuniy moslik',
    cH: 'O’zbekiston talablariga to’liq mos',
    cP: 'Soliq va hisobot masalalarini tizim o’zi hal qiladi. Buxgalteringiz Excel ga qaytmaydi.',
    cLink: 'Integratsiyalarni ko’rish',
    tEyebrow: 'Namunaviy stsenariylar',
    tH: 'Tizim qanday holatlarni yechadi',
    tNote:
      'Bu — tizimning o‘z hisobotlari asosida tuzilgan namunaviy holatlar, mijoz iqtiboslari emas.',
    tAll: 'Barcha stsenariylar',
    ctaH: 'Restoraningizni bir hafta ichida ko’chiring',
    ctaP: 'Ma’lumotlarni biz ko’chiramiz, xodimlarni biz o’rgatamiz. Siz faqat ishlashda davom etasiz.',
    ctaBtn1: 'Demo so’rash',
    ctaBtn2: 'Narxlarni ko’rish',
    ctaCall: 'Qo’ng’iroq qiling',
    ctaMail: 'Elektron pochta',
    ctaHours: 'Ish vaqti',
    ctaHoursV: 'Har kuni, 9:00–21:00',
    fBlurb: 'O’zbekistondagi restoranlar uchun qurilgan POS va boshqaruv tizimi.',
    fRights: 'Barcha huquqlar himoyalangan',
    fMade: 'Termizda ishlab chiqilgan',
    fCompany: 'Kompaniya',
    fProduct: 'Mahsulot',
    fHelp: 'Yordam',
    prodH: 'Restoranning har bir bo’limi uchun',
    prodP:
      'Alohida dasturlar va Excel jadvallari o’rniga bitta tizim. Quyida har bir modul — nima qiladi va qanday ko’rinadi.',
    intEyebrow: 'Integratsiyalar',
    intH: 'Sizda allaqachon bor tizimlar bilan ishlaydi',
    intP: 'Fiskal modul, elektron faktura, to’lov tizimlari va agregatorlar — hammasi ulangan holda keladi.',
    rolH: 'Har kim faqat o’z ishini ko’radi',
    rolP: 'To’qqizta rol, to’qqizta boshqa ekran. Har birida nima mumkin va nima mumkin emasligi aniq belgilangan.',
    rolCan: 'Nima qila oladi',
    rolCant: 'Nima qila olmaydi',
    rolNote:
      'Ko’rinmaydigan modul taqiqlangan degani emas — ruxsat serverda ham tekshiriladi. Bir odam bir nechta rolni birga olishi mumkin: kichik restoranda ofitsiant va kassir odatda bitta odam bo’ladi.',
    priH: 'Ochiq narx, yashirin to’lovsiz',
    priP: 'Filial soniga qarab to’laysiz. Yangilanishlar, yordam va ma’lumot zaxirasi narxga kiritilgan.',
    billM: 'Oylik',
    billY: 'Yillik',
    billSave: 'Yillik to’lovda ikki oy bepul',
    prPop: 'Ommabop',
    prCta: 'Demo so’rash',
    prNote:
      'Narxlar QQS bilan ko’rsatilgan. Uskuna alohida sotib olinadi yoki ijaraga beriladi. 14 kunlik sinov muddatida karta talab qilinmaydi — sinov tugaganda tizim o’zi to’xtaydi, avtomatik to’lov olinmaydi.',
    roiEyebrow: 'Hisob',
    roiH: 'Tizim o’zini oqlaydimi — o’zingiz hisoblang',
    roiP: 'Uch raqamni kiritsangiz, taxminiy hisobni ko’rasiz. Har bir qatorning asosi ochiq yozilgan — rozi bo’lmasangiz, o’z raqamingizni qo’yasiz.',
    roiResult: 'Taxminiy sof foyda',
    roiPerMonth: 'so’m / oyiga',
    roiDisclaimer:
      'Bu taxminiy hisob, kafolat emas: foizlar siz kiritgan raqamlarga qo’llanadigan namunaviy koeffitsientlar bo’lib, o’lchangan natija emas. Sizning holatingizda boshqacha bo’ladi.',
    roiCta: 'Aniq hisob uchun bog’lanish',
    cmpEyebrow: 'Solishtirish',
    cmpH: 'Tariflar nima bilan farq qiladi',
    cmpFeature: 'Imkoniyat',
    cusH: 'Raqamlar bilan aytilgan uchta stsenariy',
    cusP: 'Har bir stsenariyda nima muammo bo’lgani, nima o’zgargani va natija qanday o’lchanishi yozilgan. Bular — tizimning o’z hisobotlari asosida tuzilgan namunaviy holatlar, haqiqiy mijoz keyslari emas.',
    cusBefore: 'Muammo',
    cusAfter: 'Nima o’zgardi',
    cusResult: 'Natija',
    faqH: 'Ko’p so’raladigan savollar',
    faqP: 'Javobini topmadingizmi? Qo’ng’iroq qiling yoki Telegram orqali yozing — o’sha kuni javob beramiz.',
    faqLink: 'Savol berish',
    faqNone: 'Bu bo’limda savol yo’q.',
    conH: 'Bir qo’ng’iroqdan boshlanadi',
    conP: 'Formani to’ldirsangiz shu kuni javob beramiz. Yoki to’g’ridan-to’g’ri qo’ng’iroq qiling — bizda avtojavob yo’q.',
    conCopy: 'Nusxalash',
    conFormH: 'Demo so’rash',
    conFormP: 'To’rt maydon. Qolganini qo’ng’iroqda so’raymiz.',
    conName: 'Ismingiz',
    conNamePlaceholder: 'Ism va familiya',
    conRest: 'Restoran nomi',
    conPhone: 'Telefon raqami',
    conBranches: 'Nechta filial',
    conWhen: 'Qachon boshlashni rejalashtirasiz',
    conMsg: 'Qo’shimcha (majburiy emas)',
    conMsgPh: 'Hozir qanday tizim ishlatasiz, nima ishlamayapti',
    conSend: 'Yuborish',
    conNote: 'Raqamingizni faqat shu so’rov uchun ishlatamiz. Reklama xabari yubormaymiz.',
    conDoneH: 'So’rov qabul qilindi',
    conAgain: 'Yana bir so’rov yuborish',
    lEyebrow: 'Tizimga kirish',
    lH: 'Uchta eshik, uchta boshqa yo’l',
    lP: 'Egasi kompyuterdan parol bilan kiradi, ofitsiant planshetdan PIN bilan, platforma operatori esa ikki bosqichli tasdiq bilan.',
    lTab1: 'Pochta',
    lTab2: 'PIN kod',
    lTab3: 'Platforma',
    lEmailH: 'Egasi va menejer',
    lEmailP: 'Buxgalter ham shu yerdan kiradi',
    lMail: 'Elektron pochta',
    lPass: 'Parol',
    lForgot: 'Parolni tiklash',
    lRemember: 'Meni eslab qol',
    lEnter: 'Kirish',
    lEmailNote: 'Bir necha filialda ishlasangiz, kirgandan keyin filial tanlanadi.',
    lPinH: 'Smena boshlanishi',
    lPinP: 'Ofitsiant, kassir va oshpaz uchun',
    lPinNote:
      'PIN kodni menejer beradi. Uch marta xato kiritilsa, kod menejer tomonidan tiklanadi.',
    lAdminH: 'Platforma operatori',
    lAdminP: 'Smart Restaurant Cloud xodimlari uchun',
    lAdminWarn: 'Har bir kirish jurnalga yoziladi va restoran egasiga ko’rinadi.',
    lCode: 'Tasdiqlash kodi',
    lAdminNote: 'Kod ilovadan olinadi. Sessiya 30 daqiqada avtomatik yopiladi.',
    fTerms: 'Shartlar',
    fPrivacy: 'Maxfiylik',
    fDownload: 'Ilovani yuklab olish',
    fTermsSoon: 'Shartlar hujjati tayyorlanmoqda',
    fPrivacySoon: 'Maxfiylik siyosati tayyorlanmoqda',
    fTelegram: 'Telegram orqali yozish',
    fCall: 'Qo’ng’iroq qilish',
    conRefBefore: 'So’rov raqami: ',
    conSentBefore: 'Yuborildi · ',
    conDoneBody:
      ', biz bugun ish vaqti ichida qo’ng’iroq qilamiz. Demo 40 daqiqa oladi va sizning menyungiz bilan tayyorlanadi.',
    conPhoneHintEmpty: 'Kamida 9 raqam',
    conPhoneHintOk: 'To’g’ri',
    conPhoneHintShort: ' raqam · kamida 9 kerak',
    conNeedName: 'Ismingizni kiriting',
    conNeedRest: 'Restoran nomini kiriting',
    conNeedPhone: 'Telefon raqami to’liq emas',
  },
  mods: [
    {
      tab: 'Zal va buyurtmalar',
      tag: 'Ofitsiant ekrani',
      head: 'Uch teginishda buyurtma',
      body: 'Stol tanlaysiz, taom bosasiz, oshxonaga yuborasiz. Tugagan taom xiralashgan bo’lib turadi — mijozga taklif qilib bo’lmaydi.',
      points: [
        'Hisobni mehmon, pozitsiya yoki summa bo’yicha bo’lish',
        'Stollarni birlashtirish va ko’chirish — hisob va mehmonlar bilan',
        'Modifikator va oshpazga izoh',
        'Chegirma menejer PIN kodi bilan tasdiqlanadi',
      ],
      statLabel: 'teginish — stoldan oshxonagacha',
      screen: 'Zal · Chilonzor',
      rows: [
        {
          title: 'Stol 12 · 4 mehmon',
          meta: '284 000 so’m · 48 daq',
          state: 'Band',
        },
        {
          title: 'Stol 14 · 6 mehmon',
          meta: '612 000 so’m',
          state: 'To’lov kutmoqda',
        },
        {
          title: 'Stol 19 · Alisher K.',
          meta: '19:30',
          state: 'Bandlangan',
        },
        {
          title: 'Stol 3',
          meta: '18 daqiqa bo’sh',
          state: 'Bo’sh',
        },
        {
          title: 'Stol 7 · 2 mehmon',
          meta: 'Tozalanmoqda',
          state: 'Tozalash',
        },
      ],
      note: 'Holat rangga tayanmaydi — har birida yozuvi va hoshiya uslubi ham bor.',
    },
    {
      tab: 'Oshxona ekrani',
      tag: 'Devordagi ekran',
      head: 'Har bo’lim o’z navbatini ko’radi',
      body: 'Grill, issiq, salat va ichimlik alohida oqim ko’radi. Chek 10 daqiqadan oshsa taymer qizil bo’ladi va hoshiya bir marta yonadi.',
      points: [
        'Stop-list: taom tugadi deb belgilasangiz, POS da shu zahoti o’chadi',
        'Beshta holat: Yangi, Qabul qilindi, Tayyorlanmoqda, Tayyor, Berildi',
        'Klaviatura bilan boshqariladi — raqam tanlaydi, Enter o’tkazadi',
        'Tayyor bo’lganda ofitsiant telefoniga signal boradi',
      ],
      statLabel: 'daqiqa · o’rtacha kutish vaqti',
      screen: 'Oshxona · Grill',
      rows: [
        {
          title: 'Stol 12 · 2× Osh, 1× Lag’mon',
          meta: '1:20',
          state: 'Tayyorlanmoqda',
        },
        {
          title: 'Stol 14 · 3× Shashlik',
          meta: '0:35',
          state: 'Yangi',
        },
        {
          title: 'Terrace 1 · 1× Double beef',
          meta: '11:40',
          state: 'Kechikdi',
        },
        {
          title: 'VIP 2 · 2× Manti',
          meta: '3:05',
          state: 'Tayyor',
        },
        {
          title: 'Manti · stop-listda',
          meta: 'Zalda o’chirilgan',
          state: 'Tugadi',
        },
      ],
      note: 'Stop-list barcha planshetlarga real vaqtda yetadi — so’rov bo’yicha emas.',
    },
    {
      tab: 'Kassa va fiskal',
      tag: 'Kassir ekrani',
      head: 'Smena nominal bo’yicha sanaladi',
      body: 'Kassa ochilganda va yopilganda pul nominal bo’yicha sanaladi. Farq chiqsa sabab so’raladi va menejerga xabar ketadi.',
      points: [
        'X-hisobot — smenani yopmasdan ko’rish',
        'Z-hisobot — sanoq, farq va yopish',
        'Naqd to’lovda 1000 ga yaxlitlash, farq alohida hisobga tushadi',
        'Click, Payme, Uzum va karta — alohida hisoblanadi',
      ],
      statLabel: 'so’m · farq shu darajada aniqlanadi',
      screen: 'Kassa · kechki smena',
      rows: [
        {
          title: 'Kassadagi naqd',
          meta: 'ochilish 500 000',
          state: '3 840 000',
        },
        {
          title: 'Bugungi cheklar',
          meta: 'o’rtacha 1.4 daqiqa',
          state: 'Fiskal OK',
        },
        {
          title: 'Karta',
          meta: '39 chek',
          state: '46%',
        },
        {
          title: 'Naqd',
          meta: '28 chek',
          state: '33%',
        },
        {
          title: 'Farq',
          meta: 'sabab yozilishi kerak',
          state: '−32 000',
        },
      ],
      note: 'Kun yopilganda beshta raqam solishtiriladi: POS, fiskal, to’lovlar, Z-hisobot va buxgalteriya.',
    },
    {
      tab: 'Ombor va tannarx',
      tag: 'Omborchi ekrani',
      head: 'Xomashyo o’zi kamayadi',
      body: 'Texnologik karta har bir taomga qancha xomashyo ketishini biladi. Buyurtma yopilganda ombor avtomatik kamayadi.',
      points: [
        'Qabul qilish: shtrix-kod skaneri, kam kelgan tovar qayd etiladi',
        'Inventarizatsiya: tizim soni yashiriladi, avval sanaysiz',
        'Chiqindi sabab bilan, filiallar orasida ko’chirish',
        'Muddat nazorati va past qoldiq ogohlantirishi',
      ],
      statLabel: 'pozitsiya avtomatik hisoblanadi',
      screen: 'Ombor · past qoldiq',
      rows: [
        {
          title: 'Mol go’shti',
          meta: '12 kg · 1.3 kunga yetadi',
          state: 'Kritik',
        },
        {
          title: 'Mozzarella',
          meta: '7 kg · muddati 2 kun',
          state: 'Muddat',
        },
        {
          title: 'Guruch, lazer',
          meta: '48 kg · 6.1 kun',
          state: 'Yetarli',
        },
        {
          title: 'Farg’ona Meat · yetkazish',
          meta: '14:30 · 7 pozitsiya',
          state: 'Yo’lda',
        },
        {
          title: 'Oziq-ovqat foizi',
          meta: 'me’yor 32%',
          state: '34.1%',
        },
      ],
      note: 'Texnologik kartasiz ombor avtomatik kamaymaydi — shuning uchun u modulning asosi.',
    },
    {
      tab: 'Moliya va buxgalteriya',
      tag: 'Buxgalter ekrani',
      head: 'Oy ikki kunda emas, ikki soatda yopiladi',
      body: 'Xarajat kiritish, yetkazib beruvchi qarzlari, maosh, davrni yopish va sverka — hammasi bir joyda. Davr yopilgandan keyin ma’lumot qulflanadi.',
      points: [
        'QQS narx ichida, chekda alohida qator bilan ko’rsatiladi',
        'Maosh: hisoblandi → tasdiqlandi → to’landi',
        'Sverka: naqd, bank, karta va e-hamyon yonma-yon',
        'EHF, QQS hisoboti va 1C eksporti',
      ],
      statLabel: 'QQS narx ichida hisoblanadi',
      screen: 'Buxgalteriya · iyul',
      rows: [
        {
          title: 'Tushum, QQS’siz',
          meta: 'kassa aylanmasi 214.7 mln',
          state: '191.7 mln',
        },
        {
          title: 'Xarajatlar',
          meta: '7 kategoriya · byudjet 94%',
          state: '68.2 mln',
        },
        {
          title: 'Yetkazib beruvchi qarzi',
          meta: '2 ta muddati o’tgan',
          state: '14.8 mln',
        },
        {
          title: 'Sverka',
          meta: 'naqd, bank, karta, Click',
          state: 'Mos',
        },
        {
          title: '1C eksporti',
          meta: 'iyul davri yopilgan',
          state: 'Tayyor',
        },
      ],
      note: 'Tushum QQS’siz, kassa aylanmasi QQS bilan — ikkisi hech qachon aralashtirilmaydi.',
    },
    {
      tab: 'Ko’p filial',
      tag: 'Egasi ekrani',
      head: 'Filiallar yonma-yon solishtiriladi',
      body: 'Tushum, o’rtacha chek, yalpi marja, mehnat foizi va reja bajarilishi — bitta jadvalda. Har bir filialga alohida maqsad qo’yiladi.',
      points: [
        'Menyu rentabelligi: yulduzlar, ish otlari, jumboqlar, itlar',
        'Nazorat paneli: bekor qilish, chegirma, kassa farqi, xavf darajasi',
        'Telefonda: bugungi raqam va masofadan tasdiqlash',
        'Filial bo’yicha ombor, xodim va hisobot alohida',
      ],
      statLabel: 'filial bitta hisobda',
      screen: 'Filiallar · bugun',
      rows: [
        {
          title: 'Chilonzor',
          meta: '68 buyurtma · marja 62.4%',
          state: '6.24 mln',
        },
        {
          title: 'Yunusobod',
          meta: '54 buyurtma · marja 61.1%',
          state: '4.91 mln',
        },
        {
          title: 'Sergeli',
          meta: 'rejadan 24% orqada',
          state: '3.18 mln',
        },
        {
          title: 'Mirzo Ulug’bek',
          meta: '28 buyurtma · marja 63.9%',
          state: '2.62 mln',
        },
        {
          title: 'Termiz',
          meta: 'eng tez o’sish · +11.2%',
          state: '1.47 mln',
        },
      ],
      note: 'Ish kuni 06:00 dan 06:00 gacha — kechqurungi tushum ikki kunga bo’linmaydi.',
    },
  ],
  roles: [
    {
      title: 'Ofitsiant',
      device: 'Planshet',
      short: 'O’z stollari va tayyor buyurtma signali',
      can: [
        'Buyurtma ochish, taom qo’shish, oshxonaga yuborish',
        'Hisobni bo’lish va stolni ko’chirish',
        'Chegirma so’rash — menejer tasdiqlaydi',
        'O’z smenasi hisobotini ko’rish',
      ],
      cannot: [
        'Narxni o’zgartirish',
        'Yopilgan chekni bekor qilish',
        'Moliya va hisobotlarni ko’rish',
      ],
    },
    {
      title: 'Kassir',
      device: 'Kassa',
      short: 'Kassa, to’lov, X va Z hisobot',
      can: [
        'Kassani ochish va yopish, naqdni sanash',
        'To’lov qabul qilish: naqd, karta, Click, Payme',
        'Inkassatsiya va chekni qayta chop etish',
      ],
      cannot: ['Menyuni tahrirlash', 'Menejer tasdig’isiz qaytarish'],
    },
    {
      title: 'Oshpaz',
      device: 'Devor ekrani',
      short: 'Faqat o’z bo’limining navbati',
      can: [
        'Buyurtma holatini o’zgartirish',
        'Stop-listga taom qo’yish — zalda darhol o’chadi',
        'Texnologik kartani ko’rish',
      ],
      cannot: ['Narx va chekni ko’rish', 'Buyurtmani bekor qilish'],
    },
    {
      title: 'Omborchi',
      device: 'Telefon',
      short: 'Qabul, sanoq, chiqindi, ko’chirish',
      can: [
        'Shtrix-kod bilan mahsulot qabul qilish',
        'Inventarizatsiya o’tkazish',
        'Chiqindini sabab bilan yozish',
      ],
      cannot: ['Tannarx va foydani ko’rish', '5% dan katta farqni o’zi tasdiqlash'],
    },
    {
      title: 'Menejer',
      device: 'Kompyuter + telefon',
      short: 'Bitta filial: smena, tasdiq, jadval',
      can: [
        'Chegirma, bekor qilish va qaytarishni tasdiqlash',
        'Smena jadvalini tuzish va nashr etish',
        'Smenani yopish va nazorat panelini ko’rish',
        'Telefondan masofadan tasdiqlash',
      ],
      cannot: ['Boshqa filiallarni ko’rish', 'Davrni yopish va maoshni to’lash'],
    },
    {
      title: 'Buxgalter',
      device: 'Kompyuter',
      short: 'Barcha filiallar, faqat moliya',
      can: [
        'Xarajat kiritish va qarzlarni yuritish',
        'Maosh hisoblash, davrni yopish, sverka',
        'EHF, QQS va 1C eksporti',
      ],
      cannot: ['Buyurtma va menyuga tegish', 'Xodim huquqlarini o’zgartirish'],
    },
    {
      title: 'Operator',
      device: 'Kompyuter',
      short: 'Besh kanaldan buyurtma qabul qilish',
      can: [
        'Telefon buyurtmasini qo’lda kiritish',
        'Telegram, sayt, Yandex va Uzum buyurtmalarini boshqarish',
        'Kuryer tayinlash va mijozga qo’ng’iroq qilish',
      ],
      cannot: ['Narx va chegirmani o’zgartirish', 'Zal stollarini boshqarish'],
    },
    {
      title: 'Restoran egasi',
      device: 'Hammasi',
      short: 'Barcha filiallar, foyda, nazorat',
      can: [
        'Barcha filiallarni solishtirish va maqsad qo’yish',
        'Menyu rentabelligi va mehnat xarajatini ko’rish',
        'Nazorat paneli: xavf darajasi bo’yicha xodimlar',
        'Katta xarajatni telefondan tasdiqlash',
      ],
      cannot: ['Yopilgan davr ma’lumotini o’zgartirish', 'Jurnaldan yozuvni o’chirish'],
    },
    {
      title: 'Platforma operatori',
      device: 'Alohida panel',
      short: 'Bizning xodimimiz — obuna va texnik yordam',
      can: [
        'Restoran qo’shish, tarif va obunani boshqarish',
        'Terminal holati va tizim sog’lig’ini kuzatish',
      ],
      cannot: ['Restoran moliyasini ko’rish', 'Jurnalga tushmasdan tizimga kirish'],
    },
  ],
  plans: [
    {
      sub: 'Bitta filial, 15 foydalanuvchigacha',
      items: [
        'Zal, buyurtma va kassa',
        'Oshxona ekrani va stop-list',
        'Fiskal modul va soliq.uz',
        'Asosiy ombor va hisobotlar',
        'Elektron pochta orqali yordam',
      ],
    },
    {
      sub: '5 filialgacha, 60 foydalanuvchigacha',
      items: [
        'Start dagi hamma narsa',
        'Texnologik karta va tannarx',
        'Buxgalteriya, maosh, EHF',
        'Nazorat paneli va menyu rentabelligi',
        'Telefon va Telegram orqali yordam',
      ],
    },
    {
      sub: 'Cheklanmagan filial va foydalanuvchi',
      items: [
        'Growth dagi hamma narsa',
        'Ko’p filialli konsolidatsiya',
        '1C va tashqi tizimlar integratsiyasi',
        'Shaxsiy menejer va SLA',
        'Joyida o’rnatish va o’qitish',
      ],
    },
  ],
  capabilities: [
    'Zal va buyurtma qabul qilish',
    'Oshxona ekrani va stop-list',
    'Fiskal modul, soliq.uz',
    'Texnologik karta va tannarx',
    'Buxgalteriya va maosh',
    'Nazorat paneli',
    'Menyu rentabelligi',
    'EHF (Didox) va QQS hisoboti',
    '1C ga eksport',
    'Ko’p filialli konsolidatsiya',
    'Shaxsiy menejer va SLA',
    'Joyida o’rnatish va o’qitish',
  ],
  faqCategories: ['Ishga tushirish', 'Kundalik ish', 'Xavfsizlik va qonun', 'Narx va to’lov'],
  faq: [
    {
      q: 'Ishga tushirish qancha vaqt oladi?',
      a: 'Bitta filial uchun bir kun. Menyuni biz kiritamiz, uskunani sozlaymiz, xodimlarni ikki soatlik mashg’ulotda o’rgatamiz. Bir necha filial bo’lsa, haftasiga bitta filial tavsiya qilamiz — shunda har bir jamoa o’rganib olishga vaqt topadi.',
    },
    {
      q: 'Eski tizimdagi ma’lumotlar ko’chadimi?',
      a: 'Ha. Menyu, mijozlar bazasi, ombor qoldig’i va xodimlar ro’yxatini biz ko’chiramiz — Excel dan yoki boshqa POS dan bo’lishidan qat’i nazar. Ko’chirish sinov muddatida bajariladi, ya’ni siz to’lashdan oldin natijani ko’rasiz.',
    },
    {
      q: 'Internet uzilsa nima bo’ladi?',
      a: 'Planshet va kassa oflayn ishlashda davom etadi: buyurtma qabul qilinadi, chek chiqadi. Bajarilgan amallar navbatga yoziladi va ulanish tiklanganda tartib bo’yicha yuboriladi. Har bir amalda bir martalik kalit bor — shuning uchun ikki nusxa chek chiqmaydi.',
    },
    {
      q: 'Qanday uskuna kerak?',
      a: 'Har bir ofitsiantga planshet, kassaga chek printeri va naqd yashigi, oshxonaga televizor yoki monitor. Fiskal modul majburiy. Uskunani bizdan sotib olsangiz ham, ijaraga olsangiz ham, o’zingiznikini ishlatsangiz ham bo’ladi.',
    },
    {
      q: 'Xodimlar o’rganib ketadimi?',
      a: 'Ofitsiant ekrani uchta amaldan iborat: stolni tanlash, taom qo’shish, yuborish. Odatda birinchi smenadayoq o’rganib ketishadi. Oshpaz ekrani esa umuman o’rgatishni talab qilmaydi — u faqat ko’rsatadi va bitta tugmasi bor.',
    },
    {
      q: 'Fiskal modul va soliq talablari qanday hal qilinadi?',
      a: 'Har bir chek soliq.uz ga real vaqtda yuboriladi va fiskal raqam oladi. Modul ulanmagan bo’lsa, kassir ekranida darhol ko’rinadi — chek chiqarilmaydi. QQS 12% narx ichida hisoblanadi va chekda alohida qator bilan ko’rsatiladi.',
    },
    {
      q: 'Ma’lumotlarim xavfsizmi?',
      a: 'Ma’lumot shifrlangan holda saqlanadi va kuniga ikki marta zaxiralanadi. Har bir foydalanuvchi faqat o’z roliga ruxsat etilgan ma’lumotni ko’radi. Har bir muhim amal — chegirma, bekor qilish, narx o’zgarishi — jurnalga yoziladi va o’chirilmaydi.',
    },
    {
      q: 'Biz tizimni tashlab ketsak, ma’lumotimiz nima bo’ladi?',
      a: 'Ma’lumot sizniki. Ketishdan oldin hammasini Excel va 1C formatida eksport qilib beramiz — menyu, buyurtmalar tarixi, mijozlar, ombor, moliya. Bu bepul va so’rovdan keyin ikki ish kunida bajariladi.',
    },
    {
      q: 'Narx nimaga bog’liq?',
      a: 'Faqat filial soniga. Foydalanuvchi soni tarif ichida cheklangan, lekin amalda bu chegara kamdan-kam yetadi. Buyurtma soniga, tushumga yoki chek soniga qarab qo’shimcha to’lov yo’q.',
    },
    {
      q: 'Sinov muddatida karta kerakmi?',
      a: 'Yo’q. 14 kun to’liq funksiyalar bilan, karta talab qilinmaydi. Sinov tugaganda tizim o’zi to’xtaydi — avtomatik to’lov olinmaydi va sizga qo’ng’iroq qilib bezovta qilmaymiz.',
    },
  ],
  integrations: [
    {
      body: 'Fiskal modul, onlayn-kassa',
      state: 'Ulangan',
    },
    {
      body: 'Elektron hisob-faktura (EHF)',
      state: 'Ulangan',
    },
    {
      body: 'To’lov qabul qilish',
      state: 'Ulangan',
    },
    {
      body: 'To’lov qabul qilish',
      state: 'Ulangan',
    },
    {
      body: 'To’lov va bo’lib to’lash',
      state: 'Ulangan',
    },
    {
      body: 'Buxgalteriya eksporti',
      state: 'Fayl orqali',
    },
    {
      body: 'Buyurtma to’g’ridan-to’g’ri oshxonaga',
      state: 'Ulangan',
    },
    {
      body: 'Bot, mini ilova, bildirishnoma',
      state: 'Ulangan',
    },
  ],
  cases: [
    {
      title: 'Ko’p filialli tarmoq',
      meta: '5 filial · Toshkent va Termiz · milliy va fast-casual',
      before:
        'Uch filialda uch xil hisob yuritilardi. Kunlik foydani hech kim bilmasdi — oy oxirida Excel yig’ilardi va o’shanda ham raqamlar to’g’ri kelmasdi.',
      after:
        'Texnologik karta har bir taomning tannarxini ko’rsatdi. Ikki taom foyda keltirmayotgani aniqlandi va menyudan olib tashlandi. Egasi endi ertalab telefonda kechagi foydani ko’radi.',
      quote:
        'Menyudan ikkita taomni olib tashladik. Ular sotilardi, lekin foyda keltirmayotgan ekan — buni ko’rish uchun bizga tizim kerak bo’ldi.',
      who: 'Egasi · besh filialli tarmoq',
      period: 'Namunaviy hisob-kitob · uch oylik oyna, tizimning o‘z hisobotlari shaklida',
      metrics: [
        {
          label: 'Yalpi foyda',
          note: 'uch oy ichida',
        },
        {
          label: 'Oziq-ovqat foizi',
          note: '36.2% → 34.1%',
        },
        {
          label: 'Oyni yopish',
          note: 'soat',
        },
      ],
    },
    {
      title: 'Kechayu kunduz ishlaydigan oshxona',
      meta: '2 filial · Toshkent · milliy oshxona, 24 soat',
      before:
        'Kassa oyiga bir necha marta kam chiqardi. Kim, qachon va nima sababdan — hech qachon aniqlanmasdi. Har safar ayblanish va bahs bo’lardi.',
      after:
        'Nazorat paneli birinchi haftada javobni ko’rsatdi: yuborilgandan keyin o’chirilgan pozitsiyalar bir xodimda to’plangan edi. Endi har bir bekor qilish menejer PIN kodini talab qiladi.',
      quote:
        'Muammo o’g’irlikda emas edi — nazorat yo’qligida edi. Tizim buni bir haftada ko’rsatdi.',
      who: 'Menejer · ikki filial, 24 soat',
      period: 'Namunaviy hisob-kitob · ikki oylik oyna, tizimning o‘z hisobotlari shaklida',
      metrics: [
        {
          label: 'Kassa yo’qotishi',
          note: 'so’m / oy',
        },
        {
          label: 'Yuborilgandan keyin o’chirish',
          note: 'ikki oyda',
        },
        {
          label: 'Kassa farqi',
          note: 'holat / oy',
        },
      ],
    },
    {
      title: 'Bitta zalli fast-casual',
      meta: '1 filial · Samarqand · 180 o’rin, to’y va tadbirlar',
      before:
        'Oshxonada chek qo’lda yozilardi. Band kechqurun cheklar yo’qolardi, taom ikki marta tayyorlanardi yoki umuman chiqmasdi. Mijoz shikoyati kunda uch-to’rtta bo’lardi.',
      after:
        'Grill, issiq va salat bo’limi o’z navbatini ko’radi. Kechikkan chek qizil bo’ladi. Taom tayyor bo’lganda ofitsiant telefoniga signal boradi — hech kim oshxonaga qarab yurmaydi.',
      quote: 'Eng katta o’zgarish — oshxona endi jim. Hech kim baqirib chek so’ramaydi.',
      who: 'Egasi · fast-casual, bitta zal',
      period: 'Namunaviy hisob-kitob · uch oylik oyna, tizimning o‘z hisobotlari shaklida',
      metrics: [
        {
          label: 'O’rtacha kutish',
          note: 'daqiqa',
        },
        {
          label: 'Mijoz shikoyati',
          note: 'bir oyda',
        },
        {
          label: 'Kechki smena aylanmasi',
          note: 'stol aylanishi tezlashdi',
        },
      ],
    },
  ],
  changes: [
    {
      before: 'Kassada pul kam chiqadi, lekin sababi topilmaydi',
      after:
        'Har bir bekor qilish, chegirma va qaytarish kim tomonidan va nima sababdan qilinganini ko’rsatadi. Xodim bo’yicha xavf darajasi hisoblanadi.',
      metricLabel: 'so’m / oy, o’rtacha',
    },
    {
      before: 'Menyudagi qaysi taom foyda keltirmasligi noma’lum',
      after:
        'Texnologik karta har bir taomning haqiqiy tannarxini hisoblaydi. Taomlar to’rt guruhga bo’linadi: yulduzlar, ish otlari, jumboqlar va itlar.',
      metricLabel: 'oziq-ovqat foizi',
    },
    {
      before: 'Hisobotni yig’ish har oy ikki kun oladi',
      after:
        'Kunlik yopilish, oylik P&L, QQS hisoboti va 1C eksporti tizim ichida shakllanadi. Davr yopilgandan keyin ma’lumot qulflanadi.',
      metricLabel: 'soat / oy',
    },
  ],
  devices: [
    {
      title: 'Kompyuter',
      body: 'Boshqaruv paneli, moliya, tahlil, hisobotlar',
      who: 'Egasi, menejer, buxgalter',
    },
    {
      title: 'Planshet POS',
      body: 'Buyurtma qabul qilish, 44 px teginish maydoni',
      who: 'Ofitsiant',
    },
    {
      title: 'Oshxona ekrani',
      body: '2–3 metrdan o’qiladi, bo’limlarga ajratilgan',
      who: 'Oshpaz',
    },
    {
      title: 'Telefon',
      body: 'PIN bilan kirish, push bildirishnoma, oflayn navbat',
      who: 'Besh rol',
    },
    {
      title: 'Kassa',
      body: 'Naqd sanash, X va Z hisobot, fiskal modul',
      who: 'Kassir',
    },
  ],

  /**
   * `/download` — the one block on this site the design file does not draw.
   *
   * `Smart Restaurant Sayt va PWA.dc.html` argues the PWA case and shows the
   * install sheet; it has no page for handing out a native build, because at
   * the time there was no native build. There is one now (`apps/mobile`,
   * `srcp-apk`), so the words are written here rather than transcribed — in the
   * same voice as the rest of that file, which is deliberately plain about what
   * a thing cannot do.
   */
  download: {
    badges: {
      appleOver: 'Yuklab olish',
      apple: 'App Store',
      appleNote: 'App Store’da hali yo’q · iPhone’da veb-ilova sifatida o’rnatiladi',
      googleOver: 'Olish',
      google: 'Google Play',
      googleNote: 'To’g’ridan-to’g’ri saytdan · Play Market’da hali yo’q',
      googleNone: 'Android fayli hali nashr qilinmagan',
    },
    eyebrow: 'Ilova',
    h: 'Ilovani telefoningizga o’rnating',
    lede: 'Bitta Android ilovasi, ichida to’rtta yuza. iPhone uchun fayl yo’q — u yerda saytning o’zi ilova bo’lib o’rnatiladi. Ikkala yo’l ham quyida yozilgan.',

    andEyebrow: 'Android',
    andH: 'Android uchun ilova',
    andP: 'Faylni to’g’ridan-to’g’ri shu saytdan olasiz. Ilova do’kondan kelmagani uchun telefon bir marta ruxsat so’raydi — quyidagi uchta qadam aynan shu haqda.',
    andBtn: 'Android uchun yuklab olish',
    andNotPlay: 'Play Market orqali emas, to’g’ridan-to’g’ri saytdan',

    verLbl: 'Versiya',
    sizeLbl: 'Hajmi',
    sizeUnit: 'MB',
    builtLbl: 'Yig’ilgan sana',
    minLbl: 'Eng kam Android',
    pkgLbl: 'Paket nomi',
    sumLbl: 'SHA-256',
    sumP: 'Yuklab olgan faylingiz aynan shu ekanini tekshirmoqchi bo’lsangiz — faylning summasini o’zingiz hisoblang va quyidagi qator bilan solishtiring.',
    signerLbl: 'Imzo sertifikati',
    signerP:
      'Ilova har safar shu kalit bilan imzolanadi. Boshqa kalit bilan imzolangan yangilanishni telefon qabul qilmaydi — bu bizni ham chegaralaydi, sizni ham himoya qiladi.',
    copy: 'Nusxalash',
    copied: 'Nusxalandi',

    stepsH: 'Uch qadamda o’rnatiladi',
    stepsP:
      'Ikkinchi qadam g’alati ko’rinadi, lekin u xato emas: Android do’kondan kelmagan har qanday faylni shu tarzda so’raydi.',
    steps: [
      {
        t: 'Faylni yuklab oling',
        b: 'Yuqoridagi tugma .apk faylini telefoningizga tushiradi. Yuklab olish tugagach, bildirishnomadagi faylni bosing.',
      },
      {
        t: '«Noma’lum manbalardan o’rnatishga ruxsat» ni yoqing',
        b: 'Android bir marta so’raydi: sozlamalar ochiladi, brauzer yoki fayl menejeri uchun ruxsatni yoqasiz va orqaga qaytasiz.',
      },
      {
        t: '«O’rnatish» ni bosing',
        b: 'Ilova o’rnatiladi va bosh ekranda paydo bo’ladi. Keyingi versiya chiqqanda shu sahifaga qaytasiz.',
      },
    ],

    noneH: 'Ilova hali nashr qilinmagan',
    noneP:
      'Android fayli hozircha bu yerda yo’q. Tayyor bo’lganda aynan shu sahifada versiya, hajm va tekshiruv summasi bilan paydo bo’ladi. Sana aytmaymiz, chunki bilmaymiz.',
    noneAlt:
      'Kutib turish shart emas: sayt hozir ham telefonga ilova bo’lib o’rnatiladi va bu yo’l iPhone da ham, Android da ham ishlaydi.',

    iosEyebrow: 'iPhone va iPad',
    iosH: 'iPhone uchun fayl yo’q — sayt o’zi ilova bo’ladi',
    iosP: 'Apple saytdan ilova o’rnatishga ruxsat bermaydi, shuning uchun iPhone uchun .ipa fayli yo’q va yaqin orada bo’lmaydi ham. O’rniga Safari saytni bosh ekranga ilova qilib qo’yadi: belgi boshqa ilovalar qatorida turadi, manzil qatori ko’rinmaydi, menyu esa tarmoqsiz ham ochiladi.',
    iosSteps: [
      'Kerakli sahifani Safari da oching',
      'Pastdagi «Ulashish» tugmasini bosing',
      '«Bosh ekranga qo’shish» ni tanlang',
    ],
    iosNote:
      'iPhone dagi Chrome va Firefox ham Safari dvigatelida ishlaydi va o’rnata olmaydi — shuning uchun qadamlar aynan Safari uchun yozilgan.',

    surfEyebrow: 'Nima ichida',
    surfH: 'Bitta ilova, ichida to’rtta yuza',
    surfP:
      'Ilova ochilganda qaysi biri kerakligini so’raydi. Nomlar telefon bosh ekranida ko’rinadigan nomlar bilan bir xil.',
    surfaces: [
      { name: 'Buyurtma', body: 'Menyu, yetkazib berish va olib ketish' },
      { name: 'MyPOS', body: 'Yaqin atrofdagi restoranlardan buyurtma' },
      { name: 'Stol QR', body: 'Stoldagi QR kodni o’qing — kamera ilova ichida' },
      { name: 'Xodimlar', body: 'Stollar, buyurtmalar, tasdiqlar va smena' },
    ],
    surfNote:
      'Kassa, oshxona ekrani va konsol bu ilovada yo’q: ular planshet va kompyuter uchun mo’ljallangan va brauzerda ochiladi.',

    linkH: 'Telefonda ochish',
    linkP:
      'Kompyuterda o’qiyotgan bo’lsangiz, shu manzilni telefon brauzeriga kiriting — sahifa o’sha yerda ham shu.',
    linkCopy: 'Havolani nusxalash',
    linkCopied: 'Havola nusxalandi',
  },
};

/** The shape every language has to fill. */
export type SitePages = typeof uz;

const ru: SitePages = {
  roiInputs: [
    {
      label: 'Филиалов',
      hint: 'От 1 до 20',
    },
    {
      label: 'Месячная выручка филиала',
      hint: 'сум с НДС · шаг 20 млн',
    },
    {
      label: 'Сотрудников на филиал',
      hint: 'По всем сменам',
    },
  ],
  roiRows: [
    {
      label: 'Потери по кассе и отменам',
      basis: '1.2% оборота · за счёт панели контроля',
    },
    {
      label: 'Снижение фудкоста',
      basis: '1.8% оборота · техкарты и контроль списаний',
    },
    {
      label: 'Время на отчётность',
      basis: ' часов / месяц · по 45 000 сум в час',
    },
    {
      label: 'Плата за тариф',
      basis: 'Start',
    },
  ],
  roiPaybackBefore: 'Тариф окупается за ',
  roiPaybackAfter: ' дней',
  roiNoPayback: 'На таком объёме система пока не окупается — позвоните нам',
  planYearBefore: 'В год ',
  planYearAfter: ' сум · два месяца бесплатно',
  planCustom: 'По договору',
  planPer: 'сум / месяц',
  cusCities: 'Платформа работает в этих городах — оплата, фискальные правила и язык здесь решены:',
  cities: ['Ташкент', 'Самарканд', 'Бухара', 'Термез', 'Фергана'],
  steps: [
    {
      title: 'Звонок или сообщение',
      body: 'Спросим о ресторане: сколько филиалов, какая кухня, что используете сейчас. Без давления.',
      when: 'В тот же день',
    },
    {
      title: 'Живое демо',
      body: 'Покажем систему с вашим меню, а не с демо-данными.',
      when: 'В течение 2–3 дней · 40 минут',
    },
    {
      title: 'Проба в одном филиале',
      body: '14 дней, полный функционал, без карты. Не понравится — ничего не платите.',
      when: 'Запуск за один день',
    },
  ],
  contactRows: [
    {
      label: 'Телефон',
      copied: 'Номер скопирован',
    },
    {
      label: 'Telegram',
      copied: 'Адрес скопирован',
    },
    {
      label: 'Почта',
      copied: 'Почта скопирована',
    },
    {
      label: 'Офис',
      copied: 'Адрес скопирован',
    },
  ],
  branchOptions: ['1 филиал', '2–5', '6–15', 'больше 15'],
  whenOptions: ['На этой неделе', 'В этом месяце', 'Пока изучаю'],
  roiMillions: 'млн',
  roiPlanExtra: 'Growth + дополнительные филиалы',
  mock: {
    date: 'Вторник, 11 августа',
    branch: 'Филиал Чиланзар',
    day: 'День',
    week: 'Неделя',
    revenue: 'Выручка',
    orders: 'Заказы',
    closed: 'закрыто',
    chart: 'Последние 12 месяцев',
    alert: 'Говядина на исходе — осталось 2.4 кг',
  },
  stats: ['разделов в консоли', 'модулей на сервере', 'языка: uz · ru · en', 'режима кассы'],
  compliance: [
    {
      title: 'Онлайн-касса и фискальный модуль',
      body: 'Каждый чек уходит в soliq.uz в реальном времени.',
    },
    {
      title: 'Электронный счёт-фактура',
      body: 'Обмен счётами-фактурами через Didox.',
    },
    {
      title: 'НДС и налоговая отчётность',
      body: 'Квартальный отчёт формируется внутри системы.',
    },
    {
      title: 'Выгрузка в 1С',
      body: 'Если бухгалтерия в 1С, месяц выгружается одной кнопкой.',
    },
  ],
  quotes: [
    {
      quote:
        'Три филиала вели учёт по-разному. Теперь утром открываю телефон и вижу вчерашнюю прибыль.',
      role: 'Владелец · национальная кухня, три филиала',
    },
    {
      quote:
        'Расхождения по кассе случались несколько раз в месяц. Панель контроля показала ответ в первую же неделю.',
      role: 'Менеджер · чайхана, круглосуточно',
    },
    {
      quote: 'На кухне писали чеки от руки и теряли их. Теперь каждый цех видит свою очередь.',
      role: 'Владелец · банкетный зал',
    },
  ],
  page: {
    nProduct: 'Продукт',
    nRoles: 'Для кого',
    nPricing: 'Цены',
    nCustomers: 'Сценарии',
    nFaq: 'Вопросы',
    nContact: 'Контакты',
    nLogin: 'Вход',
    nDemo: 'Запросить демо',
    heroPill: '24 раздела · касса, кухня, склад, учёт — в одной системе',
    heroH: 'Ваш ресторан на одном экране',
    heroP: 'От заказа до отчёта. Официант, повар, кассир, кладовщик и владелец — в одной системе.',
    heroCta1: 'Получить демо',
    heroCta2: 'Смотреть продукт',
    heroNote: '14 дней бесплатно · Без карты · Запуск за 1 день',
    mockDate: 'Вторник, 11 августа',
    mockTitle: 'Филиал Чиланзар',
    mockDay: 'День',
    mockWeek: 'Неделя',
    mockRev: 'Выручка',
    mockOrd: 'Заказы',
    mockDone: 'закрыто',
    mockChart: 'Последние 12 месяцев',
    mockAlert: 'Говядина на исходе — осталось 2.4 кг',
    painEyebrow: 'Что меняется',
    painH: 'Три вещи съедают прибыль ресторана',
    painP:
      'Их не видно, потому что их никто не измеряет. Как только система начинает измерять, они сокращаются сами.',
    painBefore: 'Сейчас',
    painAfter: 'С системой',
    surfEyebrow: 'Устройства',
    surfH: 'Свой экран для каждого рабочего места',
    surfP:
      'Мы не втискиваем кухонный экран в планшет. Каждое устройство спроектировано под свою задачу.',
    cEyebrow: 'Соответствие',
    cH: 'Полное соответствие требованиям Узбекистана',
    cP: 'Налоги и отчётность система берёт на себя.',
    cLink: 'Смотреть интеграции',
    tEyebrow: 'Типовые сценарии',
    tH: 'Какие ситуации решает система',
    tNote:
      'Это смоделированные ситуации на основе собственных отчётов системы, а не отзывы клиентов.',
    tAll: 'Все сценарии',
    ctaH: 'Перенесите ресторан за неделю',
    ctaP: 'Мы переносим данные и обучаем персонал. Вы просто продолжаете работать.',
    ctaBtn1: 'Запросить демо',
    ctaBtn2: 'Смотреть цены',
    ctaCall: 'Позвоните нам',
    ctaMail: 'Почта',
    ctaHours: 'Часы работы',
    ctaHoursV: 'Ежедневно, 9:00–21:00',
    fBlurb: 'POS и система управления, созданная для ресторанов Узбекистана.',
    fRights: 'Все права защищены',
    fMade: 'Сделано в Термезе',
    fCompany: 'Компания',
    fProduct: 'Продукт',
    fHelp: 'Помощь',
    prodH: 'Для каждого участка ресторана',
    prodP:
      'Одна система вместо разрозненных программ и таблиц. Ниже — каждый модуль и как он выглядит.',
    intEyebrow: 'Интеграции',
    intH: 'Работает с тем, что у вас уже есть',
    intP: 'Фискальный модуль, ЭСФ, платёжные системы и агрегаторы — уже подключены.',
    rolH: 'Каждый видит только свою работу',
    rolP: 'Девять ролей — девять разных экранов. Для каждой чётко определено, что можно и что нельзя.',
    rolCan: 'Что может',
    rolCant: 'Что не может',
    rolNote:
      'Скрытый модуль не равно запрет — права проверяются и на сервере. Один человек может совмещать роли.',
    priH: 'Открытые цены, без скрытых платежей',
    priP: 'Вы платите по числу филиалов. Обновления, поддержка и резервные копии включены.',
    billM: 'Месячно',
    billY: 'Годовой',
    billSave: 'При годовой оплате два месяца бесплатно',
    prPop: 'Популярный',
    prCta: 'Запросить демо',
    prNote:
      'Цены с НДС. Оборудование покупается или арендуется отдельно. В пробный период карта не нужна — автосписания нет.',
    roiEyebrow: 'Расчёт',
    roiH: 'Окупится ли система — посчитайте сами',
    roiP: 'Введите три числа и увидите оценку. Основание каждой строки указано открыто.',
    roiResult: 'Оценка чистой выгоды',
    roiPerMonth: 'сум / месяц',
    roiDisclaimer:
      'Это оценка, а не гарантия: проценты — модельные коэффициенты, применённые к вашим цифрам, а не измеренный результат. В вашем случае будет иначе.',
    roiCta: 'Связаться для точного расчёта',
    cmpEyebrow: 'Сравнение',
    cmpH: 'Чем отличаются тарифы',
    cmpFeature: 'Возможность',
    cusH: 'Три сценария, рассказанные цифрами',
    cusP: 'В каждом сценарии — в чём была проблема, что изменилось и как измеряется результат. Это смоделированные ситуации на основе собственных отчётов системы, а не реальные клиентские кейсы.',
    cusBefore: 'Проблема',
    cusAfter: 'Что изменилось',
    cusResult: 'Результат',
    faqH: 'Частые вопросы',
    faqP: 'Не нашли ответ? Позвоните или напишите в Telegram — ответим в тот же день.',
    faqLink: 'Задать вопрос',
    faqNone: 'В этом разделе вопросов нет.',
    conH: 'Всё начинается с одного звонка',
    conP: 'Заполните форму — ответим в тот же день. Или позвоните напрямую — автоответчика у нас нет.',
    conCopy: 'Копировать',
    conFormH: 'Запросить демо',
    conFormP: 'Четыре поля. Остальное спросим по телефону.',
    conName: 'Ваше имя',
    conNamePlaceholder: 'Имя и фамилия',
    conRest: 'Название ресторана',
    conPhone: 'Номер телефона',
    conBranches: 'Сколько филиалов',
    conWhen: 'Когда планируете начать',
    conMsg: 'Комментарий (необязательно)',
    conMsgPh: 'Какую систему используете, что не работает',
    conSend: 'Отправить',
    conNote: 'Номер используем только для этого запроса. Рекламу не присылаем.',
    conDoneH: 'Запрос принят',
    conAgain: 'Отправить ещё один запрос',
    lEyebrow: 'Вход в систему',
    lH: 'Три двери, три разных пути',
    lP: 'Владелец входит с компьютера по паролю, официант — с планшета по PIN.',
    lTab1: 'Почта',
    lTab2: 'PIN-код',
    lTab3: 'Платформа',
    lEmailH: 'Владелец и менеджер',
    lEmailP: 'Бухгалтер входит здесь же',
    lMail: 'Электронная почта',
    lPass: 'Пароль',
    lForgot: 'Восстановить пароль',
    lRemember: 'Запомнить меня',
    lEnter: 'Войти',
    lEmailNote: 'Если вы работаете в нескольких филиалах, филиал выбирается после входа.',
    lPinH: 'Начало смены',
    lPinP: 'Для официанта, кассира и повара',
    lPinNote: 'PIN выдаёт менеджер. После трёх ошибок код сбрасывает менеджер.',
    lAdminH: 'Оператор платформы',
    lAdminP: 'Только для сотрудников Smart Restaurant Cloud',
    lAdminWarn: 'Каждый вход записывается в журнал и виден владельцу.',
    lCode: 'Код подтверждения',
    lAdminNote: 'Код берётся из приложения. Сессия закрывается через 30 минут.',
    fTerms: 'Условия',
    fPrivacy: 'Конфиденциальность',
    fDownload: 'Скачать приложение',
    fTermsSoon: 'Документ готовится',
    fPrivacySoon: 'Политика готовится',
    fTelegram: 'Написать в Telegram',
    fCall: 'Позвонить',
    conRefBefore: 'Номер запроса: ',
    conSentBefore: 'Отправлено · ',
    conDoneBody:
      ', позвоним в течение рабочего дня. Демо занимает 40 минут и готовится на вашем меню.',
    conPhoneHintEmpty: 'Минимум 9 цифр',
    conPhoneHintOk: 'Корректно',
    conPhoneHintShort: ' цифр · нужно минимум 9',
    conNeedName: 'Введите имя',
    conNeedRest: 'Введите название ресторана',
    conNeedPhone: 'Номер телефона неполный',
  },
  mods: [
    {
      tab: 'Зал и заказы',
      tag: 'Экран официанта',
      head: 'Заказ в три касания',
      body: 'Выбрали стол, нажали блюдо, отправили на кухню. Закончившееся блюдо бледное — его нельзя предложить.',
      points: [
        'Разделение счёта по гостям, позициям или сумме',
        'Объединение и перенос столов вместе со счётом',
        'Модификаторы и комментарий повару',
        'Скидка подтверждается PIN менеджера',
      ],
      statLabel: 'касания — от стола до кухни',
      screen: 'Зал · Чиланзар',
      rows: [
        {
          title: 'Стол 12 · 4 гостя',
          meta: '284 000 so’m · 48 мин',
          state: 'Занят',
        },
        {
          title: 'Стол 14 · 6 гостей',
          meta: '612 000 so’m',
          state: 'Ждёт оплаты',
        },
        {
          title: 'Стол 19 · Алишер К.',
          meta: '19:30',
          state: 'Забронирован',
        },
        {
          title: 'Стол 3',
          meta: 'Свободен 18 мин',
          state: 'Свободен',
        },
        {
          title: 'Стол 7 · 2 гостя',
          meta: 'Убирается',
          state: 'Уборка',
        },
      ],
      note: 'Статус не опирается только на цвет — есть подпись и стиль рамки.',
    },
    {
      tab: 'Кухонный экран',
      tag: 'Экран на стене',
      head: 'Каждый цех видит свою очередь',
      body: 'Гриль, горячий, салаты и бар видят свои потоки. После 10 минут таймер краснеет.',
      points: [
        'Стоп-лист: отметили — и блюдо мгновенно гаснет в POS',
        'Пять статусов заказа',
        'Управление с клавиатуры: цифра выбирает, Enter переводит',
        'При готовности официант получает сигнал',
      ],
      statLabel: 'минут · среднее ожидание',
      screen: 'Кухня · Гриль',
      rows: [
        {
          title: 'Стол 12 · 2× Плов',
          meta: '1:20',
          state: 'Готовится',
        },
        {
          title: 'Стол 14 · 3× Шашлык',
          meta: '0:35',
          state: 'Новый',
        },
        {
          title: 'Терраса 1 · 1× Double beef',
          meta: '11:40',
          state: 'Опоздал',
        },
        {
          title: 'VIP 2 · 2× Манты',
          meta: '3:05',
          state: 'Готово',
        },
        {
          title: 'Манты · в стоп-листе',
          meta: 'Отключено в зале',
          state: 'Закончилось',
        },
      ],
      note: 'Стоп-лист уходит на все планшеты в реальном времени.',
    },
    {
      tab: 'Касса и фискал',
      tag: 'Экран кассира',
      head: 'Смена считается по номиналам',
      body: 'При открытии и закрытии кассы деньги считаются по номиналам. При расхождении запрашивается причина.',
      points: [
        'X-отчёт — без закрытия смены',
        'Z-отчёт — пересчёт, расхождение, закрытие',
        'Округление наличных до 1000, разница на отдельном счёте',
        'Click, Payme, Uzum и карта — учёт раздельный',
      ],
      statLabel: 'сум · расхождение видно до этого уровня',
      screen: 'Касса · вечерняя смена',
      rows: [
        {
          title: 'Наличные в кассе',
          meta: 'открытие 500 000',
          state: '3 840 000',
        },
        {
          title: 'Чеки за день',
          meta: 'в среднем 1.4 мин',
          state: 'Фискал OK',
        },
        {
          title: 'Карта',
          meta: '39 чеков',
          state: '46%',
        },
        {
          title: 'Наличные',
          meta: '28 чеков',
          state: '33%',
        },
        {
          title: 'Расхождение',
          meta: 'нужна причина',
          state: '−32 000',
        },
      ],
      note: 'При закрытии дня сверяются пять цифр.',
    },
    {
      tab: 'Склад и себестоимость',
      tag: 'Экран кладовщика',
      head: 'Сырьё списывается само',
      body: 'Техкарта знает, сколько сырья идёт на блюдо. При закрытии заказа склад уменьшается автоматически.',
      points: [
        'Приёмка: сканер штрих-кода, недостача фиксируется',
        'Инвентаризация: системное количество скрыто',
        'Списание с причиной, перемещение между филиалами',
        'Контроль сроков и предупреждение об остатках',
      ],
      statLabel: 'позиций считаются автоматически',
      screen: 'Склад · низкие остатки',
      rows: [
        {
          title: 'Говядина',
          meta: '12 kg · хватит на 1.3 дня',
          state: 'Критично',
        },
        {
          title: 'Моцарелла',
          meta: '7 kg · срок 2 дня',
          state: 'Срок',
        },
        {
          title: 'Рис лазер',
          meta: '48 kg · 6.1 дня',
          state: 'Достаточно',
        },
        {
          title: 'Farg’ona Meat · поставка',
          meta: '14:30 · 7 позиций',
          state: 'В пути',
        },
        {
          title: 'Фудкост',
          meta: 'норма 32%',
          state: '34.1%',
        },
      ],
      note: 'Без техкарты склад не списывается автоматически.',
    },
    {
      tab: 'Финансы и бухгалтерия',
      tag: 'Экран бухгалтера',
      head: 'Месяц закрывается за два часа',
      body: 'Ввод расходов, долги поставщикам, зарплата, закрытие периода и сверка — в одном месте.',
      points: [
        'НДС в цене, в чеке отдельной строкой',
        'Зарплата: начислена → согласована → выплачена',
        'Сверка: наличные, банк, карта и кошелёк рядом',
        'ЭСФ, отчёт по НДС и выгрузка в 1С',
      ],
      statLabel: 'НДС включён в цену',
      screen: 'Бухгалтерия · июль',
      rows: [
        {
          title: 'Выручка без НДС',
          meta: 'оборот кассы 214.7 млн',
          state: '191.7 млн',
        },
        {
          title: 'Расходы',
          meta: '7 категорий · бюджет 94%',
          state: '68.2 млн',
        },
        {
          title: 'Долг поставщикам',
          meta: '2 просроченных',
          state: '14.8 млн',
        },
        {
          title: 'Сверка',
          meta: 'наличные, банк, карта, Click',
          state: 'Сходится',
        },
        {
          title: 'Выгрузка в 1С',
          meta: 'июль закрыт',
          state: 'Готово',
        },
      ],
      note: 'Выручка без НДС, оборот с НДС — они никогда не смешиваются.',
    },
    {
      tab: 'Мультифилиальность',
      tag: 'Экран владельца',
      head: 'Филиалы сравниваются рядом',
      body: 'Выручка, средний чек, маржа, доля труда и выполнение плана — в одной таблице.',
      points: [
        'Рентабельность меню по четырём группам',
        'Панель контроля: отмены, скидки, расхождения, риск',
        'На телефоне: цифры дня и согласование удалённо',
        'Склад, персонал и отчёты по каждому филиалу',
      ],
      statLabel: 'филиалов в одном аккаунте',
      screen: 'Филиалы · сегодня',
      rows: [
        {
          title: 'Chilonzor',
          meta: '68 заказов · маржа 62.4%',
          state: '6.24 млн',
        },
        {
          title: 'Yunusobod',
          meta: '54 заказов · маржа 61.1%',
          state: '4.91 млн',
        },
        {
          title: 'Sergeli',
          meta: 'отстаёт от плана на 24%',
          state: '3.18 млн',
        },
        {
          title: 'Mirzo Ulug’bek',
          meta: '28 заказов · маржа 63.9%',
          state: '2.62 млн',
        },
        {
          title: 'Termiz',
          meta: 'быстрейший рост · +11.2%',
          state: '1.47 млн',
        },
      ],
      note: 'Бизнес-день с 06:00 до 06:00 — вечерняя выручка не делится на два дня.',
    },
  ],
  roles: [
    {
      title: 'Официант',
      device: 'Планшет',
      short: 'Свои столы и сигнал о готовности',
      can: [
        'Открыть заказ, добавить блюдо, отправить на кухню',
        'Разделить счёт, перенести стол',
        'Запросить скидку — подтверждает менеджер',
        'Смотреть отчёт по своей смене',
      ],
      cannot: ['Менять цены', 'Отменять закрытые чеки', 'Смотреть финансы и отчёты'],
    },
    {
      title: 'Кассир',
      device: 'Касса',
      short: 'Касса, оплата, X и Z отчёты',
      can: [
        'Открыть и закрыть кассу, пересчитать наличные',
        'Принимать оплату: наличные, карта, Click, Payme',
        'Инкассация и повторная печать чека',
      ],
      cannot: ['Редактировать меню', 'Возврат без согласования'],
    },
    {
      title: 'Повар',
      device: 'Экран на стене',
      short: 'Только очередь своего цеха',
      can: ['Менять статус заказа', 'Ставить блюдо в стоп-лист', 'Смотреть техкарту'],
      cannot: ['Видеть цены и чеки', 'Отменять заказ'],
    },
    {
      title: 'Кладовщик',
      device: 'Телефон',
      short: 'Приёмка, пересчёт, списание, перемещение',
      can: [
        'Принимать товар по штрих-коду',
        'Проводить инвентаризацию',
        'Списывать с указанием причины',
      ],
      cannot: ['Видеть себестоимость и прибыль', 'Самостоятельно утверждать расхождение более 5%'],
    },
    {
      title: 'Менеджер',
      device: 'Компьютер + телефон',
      short: 'Один филиал: смена, согласования, график',
      can: [
        'Утверждать скидки, отмены и возвраты',
        'Составлять и публиковать график',
        'Закрывать смену, смотреть панель контроля',
        'Согласовывать с телефона',
      ],
      cannot: ['Видеть другие филиалы', 'Закрывать период и выплачивать зарплату'],
    },
    {
      title: 'Бухгалтер',
      device: 'Компьютер',
      short: 'Все филиалы, только финансы',
      can: [
        'Вводить расходы и вести долги',
        'Считать зарплату, закрывать период, сверять',
        'ЭСФ, НДС и выгрузка в 1С',
      ],
      cannot: ['Трогать заказы и меню', 'Менять права сотрудников'],
    },
    {
      title: 'Оператор',
      device: 'Компьютер',
      short: 'Приём заказов из пяти каналов',
      can: [
        'Вводить заказ по телефону',
        'Вести заказы из Telegram, сайта, Yandex и Uzum',
        'Назначать курьера и звонить гостю',
      ],
      cannot: ['Менять цены и скидки', 'Управлять столами в зале'],
    },
    {
      title: 'Владелец',
      device: 'Всё',
      short: 'Все филиалы, прибыль, контроль',
      can: [
        'Сравнивать филиалы и ставить цели',
        'Смотреть рентабельность меню и долю труда',
        'Панель контроля: сотрудники по уровню риска',
        'Согласовывать крупные расходы с телефона',
      ],
      cannot: ['Менять данные закрытого периода', 'Удалять записи из журнала'],
    },
    {
      title: 'Оператор платформы',
      device: 'Отдельная панель',
      short: 'Наш сотрудник — подписка и поддержка',
      can: [
        'Добавлять рестораны, вести тарифы и подписки',
        'Следить за терминалами и состоянием системы',
      ],
      cannot: ['Видеть финансы ресторана', 'Войти без записи в журнал'],
    },
  ],
  plans: [
    {
      sub: 'Один филиал, до 15 пользователей',
      items: [
        'Зал, заказы и касса',
        'Кухонный экран и стоп-лист',
        'Фискальный модуль и soliq.uz',
        'Базовый склад и отчёты',
        'Поддержка по почте',
      ],
    },
    {
      sub: 'До 5 филиалов, до 60 пользователей',
      items: [
        'Всё из Start',
        'Техкарты и себестоимость',
        'Бухгалтерия, зарплата, ЭСФ',
        'Панель контроля и рентабельность меню',
        'Поддержка по телефону и в Telegram',
      ],
    },
    {
      sub: 'Без ограничений по филиалам',
      items: [
        'Всё из Growth',
        'Консолидация по сети',
        'Интеграция с 1С и внешними системами',
        'Персональный менеджер и SLA',
        'Внедрение и обучение на месте',
      ],
    },
  ],
  capabilities: [
    'Зал и приём заказов',
    'Кухонный экран и стоп-лист',
    'Фискальный модуль, soliq.uz',
    'Техкарты и себестоимость',
    'Бухгалтерия и зарплата',
    'Панель контроля',
    'Рентабельность меню',
    'ЭСФ (Didox) и отчёт НДС',
    'Выгрузка в 1С',
    'Консолидация по сети',
    'Персональный менеджер и SLA',
    'Внедрение на месте',
  ],
  faqCategories: ['Запуск', 'Ежедневная работа', 'Безопасность и закон', 'Цена и оплата'],
  faq: [
    {
      q: 'Сколько занимает запуск?',
      a: 'Один филиал — один день. Мы заводим меню, настраиваем оборудование и проводим двухчасовое обучение. Для сети рекомендуем по филиалу в неделю.',
    },
    {
      q: 'Перенесутся ли данные из старой системы?',
      a: 'Да. Меню, базу клиентов, остатки и список сотрудников переносим мы — из Excel или другой POS. Перенос делается в пробный период.',
    },
    {
      q: 'Что если пропадёт интернет?',
      a: 'Планшет и касса работают офлайн. Действия пишутся в очередь и уходят при восстановлении связи. У каждого действия одноразовый ключ.',
    },
    {
      q: 'Какое оборудование нужно?',
      a: 'Планшет каждому официанту, принтер и денежный ящик на кассу, телевизор на кухню. Фискальный модуль обязателен.',
    },
    {
      q: 'Смогут ли сотрудники освоить?',
      a: 'Экран официанта — три действия. Обычно осваивают за первую смену. Экран повара не требует обучения вовсе.',
    },
    {
      q: 'Как решаются фискальные и налоговые требования?',
      a: 'Каждый чек уходит в soliq.uz и получает фискальный номер. Если модуль не на связи, кассир видит это сразу. НДС 12% включён в цену.',
    },
    {
      q: 'Насколько защищены данные?',
      a: 'Данные шифруются и резервируются дважды в день. Каждый видит только то, что позволяет роль. Важные действия пишутся в журнал.',
    },
    {
      q: 'Если мы уйдём, что будет с данными?',
      a: 'Данные ваши. Перед уходом выгружаем всё в Excel и 1С — меню, историю заказов, клиентов, склад, финансы. Бесплатно, за два рабочих дня.',
    },
    {
      q: 'От чего зависит цена?',
      a: 'Только от числа филиалов. Нет доплат за число заказов, выручку или чеки.',
    },
    {
      q: 'Нужна ли карта в пробный период?',
      a: 'Нет. 14 дней с полным функционалом, без карты. По окончании система просто остановится.',
    },
  ],
  integrations: [
    {
      body: 'Фискальный модуль',
      state: 'Подключено',
    },
    {
      body: 'Электронные счёта-фактуры',
      state: 'Подключено',
    },
    {
      body: 'Приём платежей',
      state: 'Подключено',
    },
    {
      body: 'Приём платежей',
      state: 'Подключено',
    },
    {
      body: 'Платежи и рассрочка',
      state: 'Подключено',
    },
    {
      body: 'Выгрузка бухгалтерии',
      state: 'Файлом',
    },
    {
      body: 'Заказ сразу на кухню',
      state: 'Подключено',
    },
    {
      body: 'Бот, mini app, уведомления',
      state: 'Подключено',
    },
  ],
  cases: [
    {
      title: 'Сеть из нескольких филиалов',
      meta: '5 филиалов · Ташкент и Термез',
      before: 'В трёх филиалах вели учёт по-разному. Дневную прибыль никто не знал.',
      after: 'Техкарта показала себестоимость каждого блюда. Два блюда убрали из меню.',
      quote: 'Мы убрали два блюда. Они продавались, но не приносили прибыли.',
      who: 'Владелец · сеть из пяти филиалов',
      period: 'Модельный расчёт · окно в три месяца, в форме собственных отчётов системы',
      metrics: [
        {
          label: 'Валовая прибыль',
          note: 'за три месяца',
        },
        {
          label: 'Фудкост',
          note: '36.2% → 34.1%',
        },
        {
          label: 'Закрытие месяца',
          note: 'часов',
        },
      ],
    },
    {
      title: 'Круглосуточная кухня',
      meta: '2 филиала · Ташкент · 24 часа',
      before:
        'Касса не сходилась несколько раз в месяц. Кто, когда и почему — никогда не выяснялось.',
      after:
        'Панель контроля дала ответ в первую неделю. Теперь каждая отмена требует PIN менеджера.',
      quote: 'Проблема была не в воровстве, а в отсутствии контроля.',
      who: 'Менеджер · два филиала, 24 часа',
      period: 'Модельный расчёт · окно в два месяца, в форме собственных отчётов системы',
      metrics: [
        {
          label: 'Потери по кассе',
          note: 'сум / месяц',
        },
        {
          label: 'Удаления после отправки',
          note: 'за два месяца',
        },
        {
          label: 'Расхождения',
          note: 'случаев / месяц',
        },
      ],
    },
    {
      title: 'Fast-casual с одним залом',
      meta: '1 филиал · Самарканд · 180 мест',
      before:
        'На кухне чеки писали от руки и теряли. Блюда готовились дважды или не выходили вовсе.',
      after: 'Гриль, горячий и салаты видят свои очереди. Официант получает сигнал о готовности.',
      quote: 'Самое большое изменение — на кухне тише. Никто не кричит.',
      who: 'Владелец · fast-casual, один зал',
      period: 'Модельный расчёт · окно в три месяца, в форме собственных отчётов системы',
      metrics: [
        {
          label: 'Среднее ожидание',
          note: 'минут',
        },
        {
          label: 'Жалобы гостей',
          note: 'за месяц',
        },
        {
          label: 'Оборот вечерней смены',
          note: 'столы оборачиваются быстрее',
        },
      ],
    },
  ],
  changes: [
    {
      before: 'В кассе не сходится, но причину не найти',
      after:
        'Система показывает, кто и почему сделал отмену, скидку или возврат. Риск считается по сотрудникам.',
      metricLabel: 'сум / месяц, в среднем',
    },
    {
      before: 'Непонятно, какое блюдо не приносит прибыли',
      after:
        'Техкарта считает реальную себестоимость каждого блюда. Блюда делятся на четыре группы.',
      metricLabel: 'фудкост',
    },
    {
      before: 'Сбор отчётности занимает два дня в месяц',
      after: 'Закрытие дня, месячный P&L, НДС и выгрузка в 1С формируются внутри системы.',
      metricLabel: 'часов / месяц',
    },
  ],
  devices: [
    {
      title: 'Компьютер',
      body: 'Панель, финансы, аналитика, отчёты',
      who: 'Владелец, менеджер, бухгалтер',
    },
    {
      title: 'Планшет POS',
      body: 'Приём заказа, зона касания 44 px',
      who: 'Официант',
    },
    {
      title: 'Кухонный экран',
      body: 'Читается с 2–3 метров, разделён по цехам',
      who: 'Повар',
    },
    {
      title: 'Телефон',
      body: 'Вход по PIN, push, офлайн-очередь',
      who: 'Пять ролей',
    },
    {
      title: 'Касса',
      body: 'Пересчёт, X и Z отчёты, фискальный модуль',
      who: 'Кассир',
    },
  ],

  download: {
    badges: {
      appleOver: 'Скачать в',
      apple: 'App Store',
      appleNote: 'В App Store пока нет · на iPhone ставится как веб-приложение',
      googleOver: 'Доступно в',
      google: 'Google Play',
      googleNote: 'Напрямую с сайта · в Play Market пока нет',
      googleNone: 'Файл для Android ещё не опубликован',
    },
    eyebrow: 'Приложение',
    h: 'Установите приложение на телефон',
    lede: 'Одно приложение для Android, внутри четыре поверхности. Для iPhone файла нет — там приложением становится сам сайт. Оба пути описаны ниже.',

    andEyebrow: 'Android',
    andH: 'Приложение для Android',
    andP: 'Файл вы получаете прямо с этого сайта. Приложение пришло не из магазина, поэтому телефон один раз спросит разрешение — три шага ниже именно об этом.',
    andBtn: 'Скачать для Android',
    andNotPlay: 'Не через Play Market, а напрямую с сайта',

    verLbl: 'Версия',
    sizeLbl: 'Размер',
    sizeUnit: 'МБ',
    builtLbl: 'Дата сборки',
    minLbl: 'Минимальный Android',
    pkgLbl: 'Имя пакета',
    sumLbl: 'SHA-256',
    sumP: 'Если хотите убедиться, что скачали именно этот файл — посчитайте контрольную сумму файла сами и сравните со строкой ниже.',
    signerLbl: 'Сертификат подписи',
    signerP:
      'Приложение каждый раз подписывается этим ключом. Обновление, подписанное другим ключом, телефон не примет — это ограничивает нас и защищает вас.',
    copy: 'Копировать',
    copied: 'Скопировано',

    stepsH: 'Устанавливается в три шага',
    stepsP:
      'Второй шаг выглядит странно, но это не ошибка: так Android спрашивает про любой файл, пришедший не из магазина.',
    steps: [
      {
        t: 'Скачайте файл',
        b: 'Кнопка выше загрузит .apk на телефон. Когда загрузка закончится, нажмите на файл в уведомлении.',
      },
      {
        t: 'Разрешите установку из неизвестных источников',
        b: 'Android спросит один раз: откроются настройки, вы включите разрешение для браузера или файлового менеджера и вернётесь назад.',
      },
      {
        t: 'Нажмите «Установить»',
        b: 'Приложение установится и появится на домашнем экране. За следующей версией возвращайтесь на эту страницу.',
      },
    ],

    noneH: 'Приложение ещё не опубликовано',
    noneP:
      'Файла для Android здесь пока нет. Когда он будет готов, он появится на этой же странице вместе с версией, размером и контрольной суммой. Дату не называем, потому что не знаем её.',
    noneAlt:
      'Ждать не обязательно: сайт уже сейчас устанавливается на телефон как приложение, и этот путь работает и на iPhone, и на Android.',

    iosEyebrow: 'iPhone и iPad',
    iosH: 'Для iPhone файла нет — приложением становится сайт',
    iosP: 'Apple не разрешает устанавливать приложения с сайта, поэтому файла .ipa для iPhone нет и в ближайшее время не будет. Вместо этого Safari добавляет сайт на домашний экран как приложение: иконка стоит в ряду других, адресной строки не видно, а меню открывается и без сети.',
    iosSteps: [
      'Откройте нужную страницу в Safari',
      'Нажмите «Поделиться» внизу',
      'Выберите «На экран «Домой»»',
    ],
    iosNote:
      'Chrome и Firefox на iPhone тоже работают на движке Safari и установить не могут — поэтому шаги написаны именно для Safari.',

    surfEyebrow: 'Что внутри',
    surfH: 'Одно приложение, внутри четыре поверхности',
    surfP:
      'При запуске приложение спрашивает, какая из них нужна. Названия те же, что вы увидите на домашнем экране телефона.',
    surfaces: [
      { name: 'Заказ', body: 'Меню, доставка и самовывоз' },
      { name: 'MyPOS', body: 'Заказ из ближайших ресторанов' },
      { name: 'Стол QR', body: 'Отсканируйте QR-код на столе — камера внутри приложения' },
      { name: 'Сотрудники', body: 'Столы, заказы, подтверждения и смена' },
    ],
    surfNote:
      'Кассы, кухонного экрана и консоли в этом приложении нет: они рассчитаны на планшет и компьютер и открываются в браузере.',

    linkH: 'Открыть на телефоне',
    linkP:
      'Если вы читаете это на компьютере, введите адрес в браузере телефона — там будет та же страница.',
    linkCopy: 'Копировать ссылку',
    linkCopied: 'Ссылка скопирована',
  },
};

const en: SitePages = {
  roiInputs: [
    {
      label: 'Branches',
      hint: 'From 1 to 20',
    },
    {
      label: 'Monthly revenue per branch',
      hint: 'so’m inc. VAT · steps of 20M',
    },
    {
      label: 'Staff per branch',
      hint: 'Across all shifts',
    },
  ],
  roiRows: [
    {
      label: 'Till and void losses',
      basis: '1.2% of turnover, from the control panel and approval chain',
    },
    {
      label: 'Food-cost reduction',
      basis: '1.8% of turnover, from recipe cards and waste control',
    },
    {
      label: 'Time spent on reporting',
      basis: ' hours / month at 45 000 so’m an hour',
    },
    {
      label: 'Plan cost',
      basis: 'Start',
    },
  ],
  roiPaybackBefore: 'The plan pays for itself in ',
  roiPaybackAfter: ' days',
  roiNoPayback:
    'At this volume the system does not pay for itself yet — call us and we will suggest something else',
  planYearBefore: 'Per year ',
  planYearAfter: ' so’m · two months free',
  planCustom: 'Custom',
  planPer: 'so’m / month',
  cusCities:
    'The platform works in these cities — payment rails, fiscal rules and language are solved here:',
  cities: ['Tashkent', 'Samarkand', 'Bukhara', 'Termez', 'Fergana'],
  steps: [
    {
      title: 'A call or a message',
      body: 'We ask about your restaurant: how many branches, what kind of kitchen, what you use today. No sales pressure — if it is not a fit we will say so.',
      when: 'Same day',
    },
    {
      title: 'A live demo',
      body: 'We show the system loaded with your own menu, not demo data. You see the waiter, kitchen and owner screens in turn.',
      when: 'Within 2–3 days · 40 minutes',
    },
    {
      title: 'A trial in one branch',
      body: 'Fourteen days, every feature, no card. We migrate the data and train the staff. If you do not like it, you pay nothing.',
      when: 'Live in one day',
    },
  ],
  contactRows: [
    {
      label: 'Phone',
      copied: 'Number copied',
    },
    {
      label: 'Telegram',
      copied: 'Handle copied',
    },
    {
      label: 'Email',
      copied: 'Address copied',
    },
    {
      label: 'Office',
      copied: 'Address copied',
    },
  ],
  branchOptions: ['1 branch', '2–5', '6–15', 'more than 15'],
  whenOptions: ['This week', 'This month', 'Just looking'],
  roiMillions: 'M',
  roiPlanExtra: 'Growth plus extra branches',
  mock: {
    date: 'Tuesday, 11 August',
    branch: 'Chilonzor branch',
    day: 'Today',
    week: 'Week',
    revenue: 'Revenue',
    orders: 'Orders',
    closed: 'closed',
    chart: 'Last 12 months',
    alert: 'Beef running low — 2.4 kg left',
  },
  stats: [
    'sections in the console',
    'modules on the server',
    'languages: uz · ru · en',
    'till modes',
  ],
  compliance: [
    {
      title: 'Fiscal register',
      body: 'Every receipt is sent to soliq.uz in real time; the cashier sees the module status.',
    },
    {
      title: 'E-invoicing',
      body: 'Exchange invoices with suppliers through Didox; pending documents sit in one queue.',
    },
    {
      title: 'VAT and tax filing',
      body: 'The quarterly return is assembled inside the system, ready to file.',
    },
    {
      title: '1C export',
      body: 'If your books live in 1C, the month exports with a single click.',
    },
  ],
  quotes: [
    {
      quote:
        'Three branches, three ways of counting. Now I open my phone in the morning and see yesterday’s profit.',
      role: 'Owner · a three-venue group',
    },
    {
      quote:
        'The till came up short a few times a month and we never found out why. The control panel answered that in the first week.',
      role: 'Manager · a tea house, open 24 hours',
    },
    {
      quote:
        'The kitchen wrote tickets by hand and lost them. Now the grill sees its own queue and the salad station sees its own.',
      role: 'Owner · a banqueting hall',
    },
  ],
  page: {
    nProduct: 'Product',
    nRoles: 'Who it’s for',
    nPricing: 'Pricing',
    nCustomers: 'Scenarios',
    nFaq: 'FAQ',
    nContact: 'Contact',
    nLogin: 'Sign in',
    nDemo: 'Request a demo',
    heroPill: '24 sections · till, kitchen, stock and books in one system',
    heroH: 'Your restaurant on one screen',
    heroP:
      'From the first order to the monthly report. Waiters, kitchen, cashiers, storekeepers and owners in one system.',
    heroCta1: 'Get a free demo',
    heroCta2: 'See the product',
    heroNote: '14-day trial · No card required · Live in one day',
    mockDate: 'Tuesday, 11 August',
    mockTitle: 'Chilonzor branch',
    mockDay: 'Today',
    mockWeek: 'Week',
    mockRev: 'Revenue',
    mockOrd: 'Orders',
    mockDone: 'closed',
    mockChart: 'Last 12 months',
    mockAlert: 'Beef running low — 2.4 kg left',
    painEyebrow: 'What changes',
    painH: 'Three things eat a restaurant’s profit',
    painP:
      'You cannot see them because nobody measures them. Once the system starts measuring, they shrink on their own.',
    painBefore: 'Today',
    painAfter: 'With the system',
    surfEyebrow: 'Devices',
    surfH: 'A screen built for each workplace',
    surfP:
      'We do not squeeze the kitchen display onto a tablet. Each device is designed for its own job.',
    cEyebrow: 'Compliance',
    cH: 'Built for Uzbek regulation',
    cP: 'Tax and reporting are handled inside the system, so your accountant never falls back to spreadsheets.',
    cLink: 'See the integrations',
    tEyebrow: 'Worked scenarios',
    tH: 'The situations the system resolves',
    tNote: 'Modelled from the system’s own reports, not quotations from customers.',
    tAll: 'All scenarios',
    ctaH: 'Move your restaurant across in a week',
    ctaP: 'We migrate your data and train your staff. You just keep serving.',
    ctaBtn1: 'Request a demo',
    ctaBtn2: 'See pricing',
    ctaCall: 'Call us',
    ctaMail: 'Email',
    ctaHours: 'Hours',
    ctaHoursV: 'Daily, 9:00–21:00',
    fBlurb: 'A POS and management system built for restaurants in Uzbekistan.',
    fRights: 'All rights reserved',
    fMade: 'Made in Termez',
    fCompany: 'Company',
    fProduct: 'Product',
    fHelp: 'Help',
    prodH: 'Built for every part of the restaurant',
    prodP:
      'One system instead of scattered tools and spreadsheets. Below: each module, what it does and how it looks.',
    intEyebrow: 'Integrations',
    intH: 'Works with what you already have',
    intP: 'The fiscal register, e-invoicing, payment systems and aggregators all arrive connected.',
    rolH: 'Everyone sees only their own work',
    rolP: 'Nine roles, nine different screens, each with an explicit list of what is and is not allowed.',
    rolCan: 'What they can do',
    rolCant: 'What they cannot do',
    rolNote:
      'A hidden module is not the same as a forbidden one — permissions are enforced server-side too. One person can hold several roles: in a small restaurant the waiter and cashier are usually the same person.',
    priH: 'Open pricing, no hidden fees',
    priP: 'You pay by branch. Updates, support and backups are included.',
    billM: 'Monthly',
    billY: 'Yearly',
    billSave: 'Pay yearly and two months are free',
    prPop: 'Popular',
    prCta: 'Request a demo',
    prNote:
      'Prices include VAT. Hardware is bought or leased separately. The 14-day trial needs no card — it simply stops at the end, with no automatic charge.',
    roiEyebrow: 'The maths',
    roiH: 'Work out whether it pays for itself',
    roiP: 'Enter three numbers and see the estimate. The basis of every line is stated, so you can disagree and substitute your own.',
    roiResult: 'Estimated net gain',
    roiPerMonth: 'so’m / month',
    roiDisclaimer:
      'An estimate, not a guarantee: the percentages are modelled coefficients applied to the numbers you typed, not a measured result. Your case will differ.',
    roiCta: 'Get an exact figure',
    cmpEyebrow: 'Compare',
    cmpH: 'What separates the plans',
    cmpFeature: 'Capability',
    cusH: 'Three scenarios, told in numbers',
    cusP: 'Each scenario states what was wrong, what changed and how the result is measured. They are modelled from the system’s own reports rather than drawn from named customers.',
    cusBefore: 'The problem',
    cusAfter: 'What changed',
    cusResult: 'Result',
    faqH: 'Common questions',
    faqP: 'Not answered here? Call us or write on Telegram — we reply the same day.',
    faqLink: 'Ask a question',
    faqNone: 'No questions in this section.',
    conH: 'It starts with one call',
    conP: 'Fill in the form and we reply the same day. Or call directly — there is no phone tree.',
    conCopy: 'Copy',
    conFormH: 'Request a demo',
    conFormP: 'Four fields. We will ask the rest on the call.',
    conName: 'Your name',
    conNamePlaceholder: 'First and last name',
    conRest: 'Restaurant name',
    conPhone: 'Phone number',
    conBranches: 'How many branches',
    conWhen: 'When would you start',
    conMsg: 'Anything else (optional)',
    conMsgPh: 'What you use today and what is not working',
    conSend: 'Send',
    conNote: 'We use your number only for this request. No marketing messages.',
    conDoneH: 'Request received',
    conAgain: 'Send another request',
    lEyebrow: 'Sign in',
    lH: 'Three doors, three different paths',
    lP: 'Owners sign in from a desktop with a password, waiters from a tablet with a PIN, platform operators with two-factor confirmation.',
    lTab1: 'Email',
    lTab2: 'PIN',
    lTab3: 'Platform',
    lEmailH: 'Owner and manager',
    lEmailP: 'Accountants sign in here too',
    lMail: 'Email address',
    lPass: 'Password',
    lForgot: 'Reset password',
    lRemember: 'Keep me signed in',
    lEnter: 'Sign in',
    lEmailNote: 'If you work across branches, you pick the branch after signing in.',
    lPinH: 'Start of shift',
    lPinP: 'For waiters, cashiers and kitchen staff',
    lPinNote: 'The manager issues the PIN. After three wrong attempts the manager resets it.',
    lAdminH: 'Platform operator',
    lAdminP: 'Smart Restaurant Cloud staff only',
    lAdminWarn: 'Every sign-in is logged and visible to the restaurant owner.',
    lCode: 'Verification code',
    lAdminNote:
      'The code comes from the authenticator app. Sessions close automatically after 30 minutes.',
    fTerms: 'Terms',
    fPrivacy: 'Privacy',
    fDownload: 'Download the app',
    fTermsSoon: 'The terms document is being prepared',
    fPrivacySoon: 'The privacy policy is being prepared',
    fTelegram: 'Message us on Telegram',
    fCall: 'Call us',
    conRefBefore: 'Reference: ',
    conSentBefore: 'Sent · ',
    conDoneBody:
      ', we will call you within working hours today. The demo takes 40 minutes and is prepared with your own menu.',
    conPhoneHintEmpty: 'At least 9 digits',
    conPhoneHintOk: 'Looks right',
    conPhoneHintShort: ' digits · at least 9 needed',
    conNeedName: 'Enter your name',
    conNeedRest: 'Enter the restaurant name',
    conNeedPhone: 'The phone number is incomplete',
  },
  mods: [
    {
      tab: 'Floor and orders',
      tag: 'Waiter screen',
      head: 'An order in three taps',
      body: 'Pick a table, tap a dish, fire it to the kitchen. Anything that has run out is dimmed and cannot be offered.',
      points: [
        'Split the bill by guest, by line or by amount',
        'Merge and transfer tables, carrying the bill and covers',
        'Modifiers and a note to the kitchen',
        'Discounts need the manager’s PIN',
      ],
      statLabel: 'taps from table to kitchen',
      screen: 'Floor · Chilonzor',
      rows: [
        {
          title: 'Table 12 · 4 guests',
          meta: '284 000 so’m · 48 min',
          state: 'Occupied',
        },
        {
          title: 'Table 14 · 6 guests',
          meta: '612 000 so’m',
          state: 'Awaiting payment',
        },
        {
          title: 'Table 19 · Alisher K.',
          meta: '19:30',
          state: 'Reserved',
        },
        {
          title: 'Table 3',
          meta: 'Free for 18 min',
          state: 'Available',
        },
        {
          title: 'Table 7 · 2 guests',
          meta: 'Being cleaned',
          state: 'Cleaning',
        },
      ],
      note: 'Status never relies on colour alone — each one carries a label and a border style too.',
    },
    {
      tab: 'Kitchen display',
      tag: 'Wall screen',
      head: 'Every station sees its own queue',
      body: 'Grill, hot line, salads and bar each get their own flow. Past ten minutes the timer turns red and the border pulses once.',
      points: [
        'The 86 list: mark an item and it greys out on every POS instantly',
        'Five states: new, accepted, cooking, ready, served',
        'Fully keyboard-driven: a digit selects, Enter advances',
        'When a dish is ready the waiter’s phone gets the alert',
      ],
      statLabel: 'minutes · average wait',
      screen: 'Kitchen · Grill',
      rows: [
        {
          title: 'Table 12 · 2× plov',
          meta: '1:20',
          state: 'Cooking',
        },
        {
          title: 'Table 14 · 3× shashlik',
          meta: '0:35',
          state: 'New',
        },
        {
          title: 'Terrace 1 · 1× double beef',
          meta: '11:40',
          state: 'Late',
        },
        {
          title: 'VIP 2 · 2× manti',
          meta: '3:05',
          state: 'Ready',
        },
        {
          title: 'Manti · on the 86 list',
          meta: 'Disabled on the floor',
          state: 'Sold out',
        },
      ],
      note: 'The 86 list reaches every tablet in real time, not on a poll.',
    },
    {
      tab: 'Cash and fiscal',
      tag: 'Cashier screen',
      head: 'The shift is counted note by note',
      body: 'Opening and closing the drawer counts the cash denomination by denomination. Any variance asks for a reason and notifies the manager.',
      points: [
        'X report — read without closing',
        'Z report — count, variance, close',
        'Cash rounds to 1 000 so’m and the difference posts to its own account',
        'Click, Payme, Uzum and cards are tracked separately',
      ],
      statLabel: 'so’m · variance is caught at this level',
      screen: 'Till · evening shift',
      rows: [
        {
          title: 'Cash in drawer',
          meta: 'opened with 500 000',
          state: '3 840 000',
        },
        {
          title: 'Receipts today',
          meta: '1.4 min average',
          state: 'Fiscal OK',
        },
        {
          title: 'Card',
          meta: '39 receipts',
          state: '46%',
        },
        {
          title: 'Cash',
          meta: '28 receipts',
          state: '33%',
        },
        {
          title: 'Variance',
          meta: 'a reason is required',
          state: '−32 000',
        },
      ],
      note: 'Closing the day reconciles five numbers: POS, fiscal, payments, the Z report and the books.',
    },
    {
      tab: 'Stock and cost',
      tag: 'Storekeeper screen',
      head: 'Ingredients deduct themselves',
      body: 'Recipe cards know how much goes into every dish, so closing an order draws the stock down automatically.',
      points: [
        'Goods receipt with a barcode scanner; shortfalls are recorded',
        'Stock counts hide the system quantity so you count first',
        'Waste with a reason, transfers between branches',
        'Expiry tracking and low-stock alerts',
      ],
      statLabel: 'SKUs tracked automatically',
      screen: 'Stock · running low',
      rows: [
        {
          title: 'Beef',
          meta: '12 kg · 1.3 days of cover',
          state: 'Critical',
        },
        {
          title: 'Mozzarella',
          meta: '7 kg · expires in 2 days',
          state: 'Expiry',
        },
        {
          title: 'Rice, lazer',
          meta: '48 kg · 6.1 days',
          state: 'Fine',
        },
        {
          title: 'Farg’ona Meat · delivery',
          meta: '14:30 · 7 lines',
          state: 'En route',
        },
        {
          title: 'Food cost',
          meta: 'target 32%',
          state: '34.1%',
        },
      ],
      note: 'Without recipe cards nothing deducts automatically, which is why they are the foundation here.',
    },
    {
      tab: 'Finance and books',
      tag: 'Accountant screen',
      head: 'The month closes in two hours, not two days',
      body: 'Expenses, payables, payroll, period close and reconciliation in one place. Once a period closes, the data locks.',
      points: [
        'VAT is price-inclusive and shown as its own line on the receipt',
        'Payroll moves: calculated → approved → paid',
        'Reconciliation shows cash, bank, card and e-wallet side by side',
        'E-invoicing, the VAT return and the 1C export',
      ],
      statLabel: 'VAT is included in the price',
      screen: 'Books · July',
      rows: [
        {
          title: 'Revenue, ex-VAT',
          meta: 'till turnover 214.7M',
          state: '191.7 M',
        },
        {
          title: 'Expenses',
          meta: '7 categories · 94% of budget',
          state: '68.2 M',
        },
        {
          title: 'Supplier payables',
          meta: '2 overdue',
          state: '14.8 M',
        },
        {
          title: 'Reconciliation',
          meta: 'cash, bank, card, Click',
          state: 'Balanced',
        },
        {
          title: '1C export',
          meta: 'July is closed',
          state: 'Ready',
        },
      ],
      note: 'Revenue is ex-VAT, till turnover is inc-VAT, and the two are never mixed.',
    },
    {
      tab: 'Multi-branch',
      tag: 'Owner screen',
      head: 'Branches compared side by side',
      body: 'Revenue, average ticket, gross margin, labour cost and target attainment in one table, with a target per branch.',
      points: [
        'Menu profitability: stars, workhorses, puzzles and dogs',
        'Loss prevention: voids, discounts, cash variance, risk score',
        'On the phone: today’s numbers and remote approvals',
        'Stock, staff and reports scoped per branch',
      ],
      statLabel: 'branches under one account',
      screen: 'Branches · today',
      rows: [
        {
          title: 'Chilonzor',
          meta: '68 orders · 62.4% margin',
          state: '6.24 M',
        },
        {
          title: 'Yunusobod',
          meta: '54 orders · 61.1% margin',
          state: '4.91 M',
        },
        {
          title: 'Sergeli',
          meta: '24% behind target',
          state: '3.18 M',
        },
        {
          title: 'Mirzo Ulug’bek',
          meta: '28 orders · 63.9% margin',
          state: '2.62 M',
        },
        {
          title: 'Termiz',
          meta: 'fastest growth · +11.2%',
          state: '1.47 M',
        },
      ],
      note: 'The business day runs 06:00 to 06:00, so a late evening never splits across two days.',
    },
  ],
  roles: [
    {
      title: 'Waiter',
      device: 'Tablet',
      short: 'Own tables and ready-order alerts',
      can: [
        'Open an order, add dishes, fire to the kitchen',
        'Split the bill and transfer a table',
        'Request a discount — the manager approves',
        'See a personal shift report',
      ],
      cannot: ['Change prices', 'Void a closed ticket', 'See finance or reports'],
    },
    {
      title: 'Cashier',
      device: 'Till',
      short: 'Drawer, payment, X and Z reports',
      can: [
        'Open and close the drawer, count the cash',
        'Take payment: cash, card, Click, Payme',
        'Drop cash to the safe and reprint a receipt',
      ],
      cannot: ['Edit the menu', 'Refund without approval'],
    },
    {
      title: 'Kitchen',
      device: 'Wall screen',
      short: 'Only their station’s queue',
      can: [
        'Advance an order’s state',
        'Put a dish on the 86 list — it greys out on the floor at once',
        'See the recipe card',
      ],
      cannot: ['See prices or receipts', 'Cancel an order'],
    },
    {
      title: 'Storekeeper',
      device: 'Phone',
      short: 'Receiving, counts, waste, transfers',
      can: ['Receive goods with a barcode scan', 'Run a stock count', 'Record waste with a reason'],
      cannot: ['See cost or profit', 'Approve a variance above 5% alone'],
    },
    {
      title: 'Manager',
      device: 'Desktop + phone',
      short: 'One branch: shift, approvals, rota',
      can: [
        'Approve discounts, voids and refunds',
        'Build and publish the rota',
        'Close the shift and watch the control panel',
        'Approve remotely from the phone',
      ],
      cannot: ['See other branches', 'Close the period or pay salaries'],
    },
    {
      title: 'Accountant',
      device: 'Desktop',
      short: 'All branches, finance only',
      can: [
        'Enter expenses and track payables',
        'Run payroll, close the period, reconcile',
        'E-invoices, VAT and the 1C export',
      ],
      cannot: ['Touch orders or the menu', 'Change staff permissions'],
    },
    {
      title: 'Order intake',
      device: 'Desktop',
      short: 'Takes orders from five channels',
      can: [
        'Enter a phone order by hand',
        'Handle Telegram, website, Yandex and Uzum orders',
        'Assign a courier and call the guest',
      ],
      cannot: ['Change prices or discounts', 'Manage floor tables'],
    },
    {
      title: 'Owner',
      device: 'Everything',
      short: 'Every branch, profit, oversight',
      can: [
        'Compare branches and set targets',
        'See menu profitability and labour cost',
        'Loss prevention with a risk score per employee',
        'Approve large expenses from the phone',
      ],
      cannot: ['Change data in a closed period', 'Delete an audit-log entry'],
    },
    {
      title: 'Platform operator',
      device: 'Separate panel',
      short: 'Our staff — subscriptions and support',
      can: [
        'Add restaurants, manage plans and subscriptions',
        'Watch terminal status and system health',
      ],
      cannot: ['See a restaurant’s finances', 'Sign in without being logged'],
    },
  ],
  plans: [
    {
      sub: 'One branch, up to 15 users',
      items: [
        'Floor, orders and till',
        'Kitchen display and 86 list',
        'Fiscal register and soliq.uz',
        'Basic stock and reports',
        'Email support',
      ],
    },
    {
      sub: 'Up to 5 branches, 60 users',
      items: [
        'Everything in Start',
        'Recipe cards and costing',
        'Books, payroll, e-invoicing',
        'Loss prevention and menu profitability',
        'Phone and Telegram support',
      ],
    },
    {
      sub: 'Unlimited branches and users',
      items: [
        'Everything in Growth',
        'Group-level consolidation',
        '1C and third-party integrations',
        'Named manager and SLA',
        'On-site rollout and training',
      ],
    },
  ],
  capabilities: [
    'Floor and order entry',
    'Kitchen display and 86 list',
    'Fiscal register, soliq.uz',
    'Recipe cards and costing',
    'Books and payroll',
    'Loss prevention',
    'Menu profitability',
    'E-invoicing and VAT return',
    '1C export',
    'Group consolidation',
    'Named manager and SLA',
    'On-site rollout',
  ],
  faqCategories: ['Getting started', 'Day-to-day', 'Security and law', 'Price and billing'],
  faq: [
    {
      q: 'How long does setup take?',
      a: 'One branch takes a day. We load the menu, configure the hardware and run a two-hour training. For a chain we suggest one branch per week so each team has time to settle in.',
    },
    {
      q: 'Will my old data come across?',
      a: 'Yes. We migrate the menu, customer base, stock balances and staff list, whether they come from Excel or another POS. It happens during the trial, so you see the result before you pay.',
    },
    {
      q: 'What happens if the internet drops?',
      a: 'Tablets and tills keep working offline: orders are taken and receipts print. Actions queue locally and send in order once the link returns. Each one carries a one-time key, so nothing sends twice.',
    },
    {
      q: 'What hardware do I need?',
      a: 'A tablet per waiter, a receipt printer and cash drawer at the till, a TV or monitor in the kitchen. The fiscal module is mandatory. Buy the hardware from us, lease it, or bring your own.',
    },
    {
      q: 'Will my staff manage it?',
      a: 'The waiter screen is three actions: pick a table, add a dish, send. Most people have it by the end of their first shift. The kitchen screen needs no training at all — it shows and has one button.',
    },
    {
      q: 'How are fiscal and tax requirements handled?',
      a: 'Every receipt goes to soliq.uz in real time and gets a fiscal number. If the module is offline the cashier sees it immediately and no receipt is issued. VAT of 12% is price-inclusive and shown as its own line.',
    },
    {
      q: 'Is my data safe?',
      a: 'Data is encrypted at rest and backed up twice a day. Each user sees only what their role allows. Every sensitive action — a discount, a void, a price change — is written to an audit log that cannot be deleted.',
    },
    {
      q: 'If we leave, what happens to our data?',
      a: 'The data is yours. Before you go we export all of it to Excel and 1C format — menu, order history, customers, stock, finance. Free of charge, within two working days of the request.',
    },
    {
      q: 'What drives the price?',
      a: 'The branch count, and nothing else. User limits exist per plan but are rarely reached in practice. There is no surcharge on order volume, revenue or receipt count.',
    },
    {
      q: 'Does the trial need a card?',
      a: 'No. Fourteen days with every feature, no card. When it ends the system simply stops — no automatic charge and no chasing phone calls.',
    },
  ],
  integrations: [
    {
      body: 'Fiscal register',
      state: 'Connected',
    },
    {
      body: 'E-invoicing',
      state: 'Connected',
    },
    {
      body: 'Payments',
      state: 'Connected',
    },
    {
      body: 'Payments',
      state: 'Connected',
    },
    {
      body: 'Payments and instalments',
      state: 'Connected',
    },
    {
      body: 'Accounting export',
      state: 'Via file',
    },
    {
      body: 'Orders straight to the kitchen',
      state: 'Connected',
    },
    {
      body: 'Bot, mini app, notifications',
      state: 'Connected',
    },
  ],
  cases: [
    {
      title: 'A multi-venue group',
      meta: '5 branches · Tashkent and Termez · Uzbek and fast-casual',
      before:
        'Three branches kept the books three different ways. Nobody knew the daily profit; Excel was assembled at month end and even then the numbers did not agree.',
      after:
        'Recipe cards exposed the true cost of every dish. Two of them were losing money and came off the menu. The owner now sees yesterday’s profit on his phone each morning.',
      quote:
        'We took two dishes off the menu. They sold well but made no money — it took a system to see that.',
      who: 'Owner · a five-venue group',
      period: 'Modelled · a three-month window, in the shape of the system’s own reports',
      metrics: [
        {
          label: 'Gross profit',
          note: 'over three months',
        },
        {
          label: 'Food cost',
          note: '36.2% → 34.1%',
        },
        {
          label: 'Month close',
          note: 'hours',
        },
      ],
    },
    {
      title: 'A kitchen open around the clock',
      meta: '2 branches · Tashkent · Uzbek cuisine, open 24 hours',
      before:
        'The till came up short several times a month. Who, when and why was never established, so every time ended in blame and argument.',
      after:
        'The control panel answered it in the first week: post-fire deletions clustered around one employee. Every void now needs the manager’s PIN.',
      quote:
        'The problem was not theft, it was the absence of oversight. The system showed that in a week.',
      who: 'Manager · two venues, open 24 hours',
      period: 'Modelled · a two-month window, in the shape of the system’s own reports',
      metrics: [
        {
          label: 'Cash losses',
          note: 'so’m / month',
        },
        {
          label: 'Post-fire deletions',
          note: 'in two months',
        },
        {
          label: 'Till variance',
          note: 'cases / month',
        },
      ],
    },
    {
      title: 'Fast-casual, one room',
      meta: '1 branch · Samarkand · 180 seats, weddings and events',
      before:
        'Kitchen tickets were written by hand. On busy evenings they went missing, dishes were cooked twice or never came out at all. Three or four guest complaints a day was normal.',
      after:
        'Grill, hot line and salads each see their own queue. Late tickets turn red. When a dish is ready the waiter’s phone alerts him, so nobody walks to the kitchen to check.',
      quote: 'The biggest change is that the kitchen is quiet now. Nobody shouts for a ticket.',
      who: 'Owner · fast-casual, one room',
      period: 'Modelled · a three-month window, in the shape of the system’s own reports',
      metrics: [
        {
          label: 'Average wait',
          note: 'minutes',
        },
        {
          label: 'Guest complaints',
          note: 'within a month',
        },
        {
          label: 'Evening turnover',
          note: 'faster table turns',
        },
      ],
    },
  ],
  changes: [
    {
      before: 'The till comes up short and nobody finds out why',
      after:
        'Every void, discount and refund shows who did it and why. A risk score is calculated per employee.',
      metricLabel: 'so’m / month, average',
    },
    {
      before: 'You cannot tell which dishes lose money',
      after:
        'Recipe cards compute the true cost of every dish, then sort the menu into stars, workhorses, puzzles and dogs.',
      metricLabel: 'food cost',
    },
    {
      before: 'Closing the month takes two days',
      after:
        'Daily close, monthly P&L, the VAT return and the 1C export are assembled inside the system, and the period locks once closed.',
      metricLabel: 'hours / month',
    },
  ],
  devices: [
    {
      title: 'Desktop',
      body: 'Dashboards, finance, analytics, reports',
      who: 'Owner, manager, accountant',
    },
    {
      title: 'Tablet POS',
      body: 'Order entry, 44 px touch targets',
      who: 'Waiter',
    },
    {
      title: 'Kitchen display',
      body: 'Readable from 2–3 m, split by station',
      who: 'Kitchen',
    },
    {
      title: 'Phone',
      body: 'PIN sign-in, push alerts, offline queue',
      who: 'Five roles',
    },
    {
      title: 'Till',
      body: 'Cash count, X and Z reports, fiscal module',
      who: 'Cashier',
    },
  ],

  download: {
    badges: {
      appleOver: 'Download on the',
      apple: 'App Store',
      appleNote: 'Not on the App Store yet · installs as a web app on iPhone',
      googleOver: 'Get it on',
      google: 'Google Play',
      googleNote: 'Straight from this site · not on Play yet',
      googleNone: 'The Android file is not published yet',
    },
    eyebrow: 'The app',
    h: 'Install the app on your phone',
    lede: 'One Android app with four surfaces inside it. There is no file for iPhone — there, the site itself becomes the app. Both routes are below.',

    andEyebrow: 'Android',
    andH: 'The Android app',
    andP: 'You get the file straight from this site. It did not come from a store, so the phone asks for permission once — that is what the three steps below are about.',
    andBtn: 'Download for Android',
    andNotPlay: 'Not through the Play Store — straight from the site',

    verLbl: 'Version',
    sizeLbl: 'Size',
    sizeUnit: 'MB',
    builtLbl: 'Built',
    minLbl: 'Minimum Android',
    pkgLbl: 'Package name',
    sumLbl: 'SHA-256',
    sumP: 'To check that the file you downloaded is this exact one, compute the file’s checksum yourself and compare it with the line below.',
    signerLbl: 'Signing certificate',
    signerP:
      'The app is signed with this key every time. A phone refuses an update signed with a different one — which constrains us and protects you.',
    copy: 'Copy',
    copied: 'Copied',

    stepsH: 'Three steps to install it',
    stepsP:
      'The second step looks odd, but it is not a mistake: Android asks this about any file that did not come from a store.',
    steps: [
      {
        t: 'Download the file',
        b: 'The button above puts the .apk on your phone. When the download finishes, tap the file in the notification.',
      },
      {
        t: 'Allow installing from unknown sources',
        b: 'Android asks once: settings open, you turn the permission on for your browser or file manager, and go back.',
      },
      {
        t: 'Tap Install',
        b: 'The app installs and appears on your home screen. Come back to this page when the next version is out.',
      },
    ],

    noneH: 'The app is not published yet',
    noneP:
      'There is no Android file here yet. When there is, it appears on this same page with its version, size and checksum. We are not naming a date, because we do not have one.',
    noneAlt:
      'There is no need to wait: the site already installs on a phone as an app, and that route works on both iPhone and Android.',

    iosEyebrow: 'iPhone and iPad',
    iosH: 'No file for iPhone — the site becomes the app',
    iosP: 'Apple does not allow installing an app from a website, so there is no .ipa for iPhone and there will not be one soon. Instead Safari adds the site to the home screen as an app: the icon sits among the others, the address bar is gone, and the menu opens with no network.',
    iosSteps: [
      'Open the page you want in Safari',
      'Tap Share at the bottom',
      'Choose Add to Home Screen',
    ],
    iosNote:
      'Chrome and Firefox on iPhone run on Safari’s engine too and cannot install either — which is why these steps name Safari.',

    surfEyebrow: 'What is inside',
    surfH: 'One app, four surfaces inside it',
    surfP:
      'On launch the app asks which one you came for. The names are the ones you will see on your phone’s home screen.',
    surfaces: [
      { name: 'Order', body: 'Menu, delivery and pickup' },
      { name: 'MyPOS', body: 'Order from restaurants nearby' },
      { name: 'Table QR', body: 'Scan the QR code on your table — the camera is inside the app' },
      { name: 'Staff', body: 'Tables, orders, approvals and the shift' },
    ],
    surfNote:
      'The till, the kitchen display and the console are not in this app: they are built for a tablet and a desktop, and they open in a browser.',

    linkH: 'Open it on your phone',
    linkP:
      'If you are reading this on a computer, type this address into your phone’s browser — the same page is there.',
    linkCopy: 'Copy the link',
    linkCopied: 'Link copied',
  },
};

export const SITE_PAGES = { uz, ru, en } as const;

/** The copy for one reader, resolved once at the top of a page. */
export function pagesCopy(locale: 'uz' | 'ru' | 'en'): SitePages {
  return SITE_PAGES[locale] ?? uz;
}
