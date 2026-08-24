import { SUPPORTED_LOCALES, type Locale } from '@/i18n';

/**
 * The two legal documents the public site has to publish, in three languages.
 *
 * **Why not `pages-copy.ts`.** That file is the design's own prose, generated
 * out of `Smart Restaurant Cloud - Sayt v2.dc.html` by evaluating its script
 * block once per language — it is a transcription, and re-generating it must
 * stay a mechanical act. These two documents have no design file behind them:
 * they are written, not transcribed, and they are long enough (twenty-five
 * sections across the two) that dropping them into a 3000-line generated file
 * would make the next regeneration a merge.
 *
 * **Structure, not markup.** A section is `{ id, h, body }` with an optional
 * table and an optional row of links, so the renderer decides how a clause
 * looks and this file only decides what it says. It also means the checks in
 * `legal.test.ts` can count things — sections per language, blank paragraphs,
 * placeholders — which is the only way a document nobody reads end to end
 * stays honest.
 *
 * ---------------------------------------------------------------------------
 * This is a draft, and it says so on the page
 *
 * Both documents open with a banner in the reader's own language saying they
 * are version 0.1 and must be reviewed by a lawyer before they take effect.
 * That is not modesty. An offer under Civil Code art. 367–369 binds whoever
 * accepts it, and a privacy policy is a declaration to a regulator; publishing
 * either one as if it were settled, drafted by someone who is not a lawyer,
 * would be worse than publishing nothing.
 *
 * Everything we genuinely do not know yet — the legal entity, its TIN, its bank
 * details, the personal-data registry number — is marked with `FILL` rather
 * than invented. `LEGAL_TODO` below is the list of them, and the test counts
 * the markers against it so a forgotten one cannot ship quietly.
 */

/** One clause: a heading, its paragraphs, and optionally a table or links. */
export type LegalSection = {
  /** The anchor, and the key the table of contents links to. Stable across languages. */
  id: string;
  h: string;
  body: readonly string[];
  /** Column headings. Present exactly when `rows` is. */
  head?: readonly string[];
  rows?: readonly (readonly string[])[];
  /** Paragraphs printed after the table, when the table needs a note. */
  after?: readonly string[];
  /** Real links, because "see /pricing" in running text is not a link. */
  links?: readonly { href: string; label: string }[];
};

export type LegalDoc = {
  eyebrow: string;
  title: string;
  lede: string;
  /** The yellow banner at the top: this is a draft. */
  draftH: string;
  draftP: string;
  /** "Last revised … · version …", already formatted for the reader. */
  updated: string;
  tocH: string;
  sections: readonly LegalSection[];
};

export type LegalCopy = { terms: LegalDoc; privacy: LegalDoc };

/** Version and date, in one place — both documents and both banners quote them. */
export const LEGAL_VERSION = '0.1';
export const LEGAL_UPDATED = '2026-08-22';

/**
 * What a reader sees where we do not know the answer yet.
 *
 * Per language, because a Russian reader shown `[to’ldirilsin]` learns nothing
 * from it — and a placeholder that does not read as a placeholder is how a
 * blank ends up published as if it were a value.
 */
export const FILL: Readonly<Record<Locale, string>> = {
  uz: '[to’ldirilsin]',
  ru: '[заполнить]',
  en: '[to be filled in]',
};

/**
 * Every fact these drafts are missing, by id — the list a lawyer works down.
 *
 * `legal.test.ts` counts `FILL` markers in each document against the length of
 * these lists, in all three languages. Fill one in and the test fails until the
 * id is removed here too, which is the point: the count is the reminder.
 *
 * terms
 *   company   — the legal entity's full registered name
 *   tin       — STIR / ИНН
 *   address   — registered address
 *   bank      — settlement account and bank (MFO)
 *   director  — who signs
 *   email     — the address that receives legal notices
 *   effective — the date this offer takes effect
 *
 * privacy
 *   operator   — the same legal entity, named as the data operator
 *   address    — where a written request is sent
 *   registry   — number in the state register of personal data bases
 *   email      — the address for privacy requests
 *   officer    — the person responsible for personal data
 *   datacenter — the Uzbek facility the data physically sits in
 */
export const LEGAL_TODO = {
  terms: ['company', 'tin', 'address', 'bank', 'director', 'email', 'effective'],
  privacy: ['operator', 'address', 'registry', 'email', 'officer', 'datacenter'],
} as const;

/**
 * The cookies the privacy policy has to name, because these are the ones set.
 *
 * The six are `CLAUDE.md`'s own table — three for the till and three for the
 * staff app — and the seventh is the public site's language choice, which is
 * set on this very page and would be a strange thing for a privacy policy to
 * leave out. `legal.test.ts` checks every one of them appears in the cookie
 * section of all three languages.
 */
export const LEGAL_COOKIES = [
  'restaurant-campus-session',
  'restaurant-campus-terminal',
  'restaurant-campus-shift',
  'restaurant-campus-crew-device',
  'restaurant-campus-crew-tenant',
  'restaurant-campus-crew-session',
  'srcp.site.lang',
] as const;

const uz: LegalCopy = {
  terms: {
    eyebrow: 'Huquqiy hujjatlar',
    title: 'Ommaviy oferta',
    lede: 'Smart Restaurant Cloud platformasidan foydalanish shartlari. Bu hujjat O’zbekiston Respublikasi Fuqarolik kodeksining 367–369-moddalari ma’nosida ommaviy oferta hisoblanadi: uni qabul qilgan har bir restoran biz bilan aynan bir xil shartlarda shartnoma tuzadi.',
    draftH: 'Bu qoralama',
    draftP: `Kuchga kirishidan oldin yurist ko’rib chiqishi shart. Versiya ${LEGAL_VERSION}, ${LEGAL_UPDATED}.`,
    updated: `Oxirgi tahrir: ${LEGAL_UPDATED} · Versiya ${LEGAL_VERSION}`,
    tocH: 'Mundarija',
    sections: [
      {
        id: 'definitions',
        h: '1. Atamalar',
        body: [
          'Platforma — Smart Restaurant Cloud dasturiy majmuasi: veb-konsol, kassa terminali, oshxona displeyi, xodimlar va mehmonlar ilovalari, Telegram botlari, ochiq API va ularning barcha yangilanishlari.',
          'Restoran (Ijarachi) — Platformada o’z hisobini ochgan yuridik shaxs yoki yakka tartibdagi tadbirkor. Bitta Ijarachi — bitta biznes; uning barcha filiallari shu hisob ichida joylashadi va boshqa Ijarachining ma’lumotini hech qachon ko’rmaydi.',
          'Foydalanuvchi — Restoran Platformaga kiritgan xodim: egasi, menejer, ofitsiant, kassir, oshpaz, omborchi, buxgalter yoki qabul operatori.',
          'Mehmon — Restoranning mijozi: QR-menyuni ochgan, sayt yoki ilova orqali buyurtma bergan, sodiqlik dasturidan foydalangan jismoniy shaxs. Mehmon Platforma bilan emas, Restoran bilan munosabatga kiradi.',
          'Tarif — Platformadan foydalanish uchun oylik yoki yillik to’lov rejasi. Amaldagi tariflar Narxlar sahifasida e’lon qilinadi va shu ofertaning ajralmas qismi hisoblanadi.',
          'Operator — Platformani ishlab chiqaruvchi va xizmat ko’rsatuvchi tashkilot; rekvizitlari 13-bo’limda.',
        ],
      },
      {
        id: 'subject',
        h: '2. Oferta predmeti',
        body: [
          'Operator Restoranga Platformadan foydalanish huquqini beradi — dasturiy ta’minot xizmat sifatida (SaaS), ya’ni dastur Operatorning serverlarida ishlaydi va Restoranga internet orqali ochiladi. Restoran esa tanlangan Tarif bo’yicha to’lov qiladi.',
          'Predmet — faqat dasturiy xizmat. Operator ovqat tayyorlamaydi, sotmaydi, yetkazib bermaydi va Restoranning Mehmon oldidagi majburiyatlari bo’yicha tomon bo’lmaydi. Taomning sifati, narxi, tarkibi va yetkazib berish muddati uchun Restoran javob beradi.',
          'Xizmat e’lon qilingan funksiyalar hajmida ko’rsatiladi. Funksiyalar ro’yxati Imkoniyatlar va Narxlar sahifalarida keltirilgan; Tarifga kirmagan modul yoqilmaydi.',
          'Operator Platformani doimiy ravishda rivojlantiradi. Yangi funksiyalar qo’shilishi mavjud funksiyani olib tashlashni anglatmaydi: mavjud funksiya olib tashlanadigan bo’lsa, kamida 90 kun oldin xabar beriladi.',
        ],
        links: [{ href: '/product', label: 'Imkoniyatlar' }],
      },
      {
        id: 'accept',
        h: '3. Aksept — ofertani qabul qilish',
        body: [
          'Fuqarolik kodeksining 369-moddasiga muvofiq, aksept quyidagi harakatlardan istalgan biri bilan amalga oshiriladi: Platformada ro’yxatdan o’tish, Operator ochgan hisobga birinchi marta kirish, boshlang’ich sozlashni (onboarding) yakunlash yoki Tarif bo’yicha to’lovni amalga oshirish.',
          'Aksept lahzasidan boshlab shartnoma yozma shaklda tuzilgan hisoblanadi va tomonlar uchun majburiy bo’ladi. Alohida qog’oz shartnoma talab qilinmaydi; Restoran so’rasa, u shu ofertaning matni bilan imzolanadi.',
          'Aksept qilgan shaxs Restoran nomidan harakat qilish vakolatiga ega ekanini tasdiqlaydi. Vakolatsiz aksept aniqlansa, Operator hisobni to’xtatib, tomonlarni asl holatga qaytaradi.',
          'Oferta shartlari o’zgarganda yangi tahrir shu sahifada e’lon qilinadi. Restoran uchun ahamiyatli o’zgarishlar — narx, javobgarlik chegarasi, ma’lumot bilan ishlash tartibi — kamida 30 kun oldin elektron pochta va konsoldagi bildirishnoma orqali ma’lum qilinadi. Restoran rozi bo’lmasa, shu muddat ichida 11-bo’lim bo’yicha shartnomani bekor qilishi mumkin.',
        ],
      },
      {
        id: 'tariff',
        h: '4. Tariflar va to’lov',
        body: [
          'Amaldagi tariflar va har biri nimani o’z ichiga olishi Narxlar sahifasida e’lon qilingan. Narx filiallar soniga bog’liq: Platformadagi har bir faol filial hisobga olinadi.',
          'Hisob-kitob davri — oy yoki yil; Restoran tanlaydi. Yillik to’lovda chegirma qo’llaniladi va u to’lov kunidagi tarifni bir yilga qulflaydi.',
          'Narxlar O’zbekiston Respublikasi so’mida ko’rsatiladi. Qo’shilgan qiymat solig’i qonunchilikda belgilangan tartibda hisoblanadi va hisob-fakturada alohida qator bo’lib ko’rsatiladi.',
          'To’lov muddati — hisob-faktura sanasidan 10 (o’n) kalendar kun. Hisob-faktura elektron shaklda beriladi.',
          'To’lov kechikkanda ikki qadam qo’llaniladi. To’lov kunidan 14 kun o’tgach hisob faqat o’qish rejimiga o’tadi: ma’lumot to’liq ko’rinadi va eksport qilinadi, lekin yangi buyurtma, to’lov va smena kiritib bo’lmaydi. 30 kun o’tgach xizmat to’xtatiladi. Ikkala qadam ham kamida 3 kun oldin ogohlantirish bilan bajariladi.',
          'Tarifni ko’tarish istalgan vaqtda amal qiladi; farq qolgan davrga proporsional hisoblanadi. Tarifni pasaytirish keyingi hisob-kitob davridan kuchga kiradi.',
          'Sinov davri — 14 kun, to’liq funksiyalar bilan, bepul va bank kartasini talab qilmasdan. Sinov tugagach hisob avtomatik ravishda pullik tarifga o’tmaydi: to’lovni Restoranning o’zi tasdiqlaydi.',
        ],
        links: [{ href: '/pricing', label: 'Amaldagi tariflar' }],
      },
      {
        id: 'duties',
        h: '5. Tomonlar majburiyatlari',
        body: [
          'Operator zimmasiga oladi: Platformani 7-bo’limda ko’rsatilgan mavjudlik darajasida ishlatish; ma’lumotni kuniga kamida bir marta zaxiralash; xizmat ishlamayotgani haqidagi murojaatga ish kunlari 4 soat ichida javob berish; rejalashtirilgan texnik ishlar va ahamiyatli o’zgarishlar haqida oldindan xabar berish; ma’lumotni 6-bo’lim va Maxfiylik siyosati doirasida qayta ishlash.',
          'Restoran zimmasiga oladi: kirish ma’lumotlarini — parol, PIN, qurilma tokeni — sir saqlash; har bir xodimga faqat ishi uchun zarur ruxsatni berish va ishdan bo’shagan xodimning hisobini o’chirish; Platformaga kiritilgan ma’lumotning to’g’riligi va qonuniyligi uchun javob berish; Mehmonlar ma’lumotini qayta ishlash uchun zarur rozilikni o’zi olish; Tarif bo’yicha o’z vaqtida to’lash.',
          'Restoranga taqiqlanadi: Platformani dekompilyatsiya va teskari injiniring qilish; uni uchinchi shaxsga qayta sotish, ijaraga berish yoki o’z nomi ostida taqdim etish; avtomatlashtirilgan vositalar bilan ommaviy so’rov yuborish yoki yuklama sinovlarini kelishmasdan o’tkazish; boshqa Ijarachining ma’lumotiga kirishga urinish; Platforma orqali qonunga zid tovar va xizmat sotish.',
          'Qonunga zid harakat yoki Platformaning barqarorligiga tahdid aniqlanganda Operator hisobni oldindan xabar bermasdan to’xtatishi mumkin. Bunday holatda to’xtatish sababi 24 soat ichida yozma ravishda bildiriladi.',
        ],
      },
      {
        id: 'data',
        h: '6. Ma’lumotlar egaligi va eksport',
        body: [
          'Restoran Platformaga kiritgan barcha ma’lumot — menyu, buyurtmalar, mijozlar bazasi, xodimlar yozuvlari, moliyaviy hisoblar, hujjatlar — Restoranning mulki bo’lib qoladi. Operator bu ma’lumotga nisbatan egalik da’vo qilmaydi.',
          'Operator Mehmon va xodim ma’lumotini Restoran topshirig’i bo’yicha qayta ishlaydi. Ma’lumot sotilmaydi, reklama uchun ishlatilmaydi va uchinchi shaxsga berilmaydi — qonun talab qilgan hollar hamda Maxfiylik siyosatida nomma-nom ko’rsatilgan xizmat provayderlari bundan mustasno.',
          'Restoran istalgan vaqtda o’z ma’lumotini mashinada o’qiladigan formatda (CSV va JSON) eksport qilishi mumkin. Eksport konsolda mavjud va qo’shimcha to’lov talab qilmaydi.',
          'Shartnoma tugagandan yoki bekor qilingandan keyin ma’lumot 30 (o’ttiz) kun davomida eksport uchun ochiq qoladi. Shu muddat o’tgach ma’lumot barcha zaxira nusxalari bilan birga o’chiriladi va tiklanmaydi. Restoran so’rasa, o’chirish to’g’risida dalolatnoma beriladi.',
          'Operator xizmatni yaxshilash uchun yig’ma va shaxssizlantirilgan ko’rsatkichlardan foydalanishi mumkin — ulardan aniq restoranni yoki aniq shaxsni aniqlab bo’lmaydigan darajada.',
        ],
        links: [{ href: '/privacy', label: 'Maxfiylik siyosati' }],
      },
      {
        id: 'uptime',
        h: '7. Xizmat mavjudligi',
        body: [
          'Maqsadli mavjudlik — kalendar oyiga 99,5%. Hisob-kitobda rejalashtirilgan texnik ishlar hamda Operatorga bog’liq bo’lmagan uzilishlar (internet provayderi, elektr ta’minoti, fors-major) hisobga olinmaydi.',
          'Rejalashtirilgan texnik ishlar Toshkent vaqti bilan 03:00–05:00 oralig’ida o’tkaziladi va kamida 48 soat oldin elektron pochta hamda konsoldagi bildirishnoma orqali e’lon qilinadi. Shoshilinch xavfsizlik yangilanishlari bundan mustasno; ular haqida imkon qadar tez xabar beriladi.',
          'Kassa aloqa uzilganda ishlashda davom etadi: buyurtma, to’lov va smena planshetda saqlanadi va aloqa tiklangach serverga yuboriladi. Bu Platformaning ajralmas qismi bo’lib, alohida xizmat sifatida sotilmaydi va mavjudlik hisobiga kirmaydi.',
          'Oylik mavjudlik 99,5% dan past bo’lgan holatda Restoranning yozma so’rovi bo’yicha keyingi oy to’loviga kompensatsiya beriladi: to’liq bo’lmagan har 1% uchun oylik to’lovning 10% i, jami oylik to’lovning 50% idan oshmagan holda. So’rov muddati — hisobot oyi tugaganidan keyin 30 kun.',
        ],
      },
      {
        id: 'liability',
        h: '8. Javobgarlik chegarasi',
        body: [
          'Operatorning shu shartnoma bo’yicha har qanday talab yuzasidan umumiy javobgarligi talab yuzaga kelgan sanadan oldingi 1 (bir) oy uchun Restoran to’lagan Tarif summasidan oshmaydi.',
          'Operator bilvosita zarar uchun javob bermaydi: boy berilgan foyda, mijozlar oqimining kamayishi, obro’ga yetgan zarar, Restoranning uchinchi shaxslar oldidagi majburiyatlari.',
          'Operator Restoranning o’z harakati natijasidagi zarar uchun javob bermaydi: noto’g’ri kiritilgan narx yoki texnologik karta, xodimga ortiqcha berilgan ruxsat, oshkor qilingan parol yoki PIN, Restoran tanlagan uchinchi tomon uskunasining nosozligi.',
          'Bu chegaralar Operatorning qasddan yoki qo’pol ehtiyotsizlik bilan yetkazgan zarariga, shuningdek qonun bo’yicha chegaralab bo’lmaydigan javobgarlikka nisbatan qo’llanilmaydi.',
        ],
      },
      {
        id: 'fiscal',
        h: '9. Fiskallashtirish',
        body: [
          'Chekni fiskallashtirish Restoranning fiskal ma’lumotlar operatori (OFD) bilan tuzgan shartnomasi doirasida amalga oshiriladi. Shu shartnomaning tomoni — Restoran, Operator emas.',
          'Platforma bu jarayonda texnik vosita bo’lib xizmat qiladi: chek ma’lumotini shakllantiradi, OFD ga uzatadi va javobni saqlaydi. Fiskal belgi hamda tekshirish QR kodi OFD dan keladi va o’zgartirilmasdan chekka chiqariladi.',
          'Aloqa uzilganda chek navbatga qo’yiladi va qonunda belgilangan 24 soatlik oyna ichida yuboriladi. Chekning qayta chop etilgan nusxasi "NUSXA" belgisi bilan chiqadi va fiskal hujjat o’rnini bosmaydi.',
          'Soliq organi oldidagi javobgarlik — savdo operatsiyasini to’g’ri rasmiylashtirish, chekni berish, kassa intizomiga rioya qilish, OFD shartnomasini amalda saqlash — Restoran zimmasida qoladi.',
        ],
      },
      {
        id: 'ip',
        h: '10. Intellektual mulk',
        body: [
          'Platforma, uning dasturiy kodi, dizayni, tovar belgisi va hujjatlari Operatorga tegishli. Oferta bo’yicha Restoran faqat foydalanish huquqini oladi — mutlaq huquqlar o’tmaydi va litsenziya boshqa shaxsga berilmaydi.',
          'Restoran o’z kontenti — logotipi, taom nomlari va rasmlari, matnlari, mijozlar bazasi — bo’yicha huquqlarini to’liq saqlab qoladi va Operatorga uni faqat xizmat ko’rsatish doirasida ko’rsatish uchun ruxsat beradi. Shartnoma tugagach bu ruxsat ham tugaydi.',
          'Operator Restoranning nomi va logotipidan mijozlar ro’yxatida yoki namunaviy loyiha sifatida faqat yozma rozilik bilan foydalanadi. Rozilik istalgan vaqtda, sababini ko’rsatmasdan qaytarilishi mumkin.',
          'Restoran taklif qilgan yaxshilanishlar Platformaga kiritilishi mumkin; bunday yaxshilanishlarga bo’lgan huquqlar Operatorda qoladi va bu Restoranning o’z kontentiga daxl qilmaydi.',
        ],
      },
      {
        id: 'termination',
        h: '11. Shartnomani bekor qilish',
        body: [
          'Restoran istalgan vaqtda, sababini ko’rsatmasdan, konsol orqali yoki yozma murojaat bilan shartnomani bekor qilishi mumkin. Bekor qilish joriy hisob-kitob davri oxirida kuchga kiradi.',
          'To’langan, lekin foydalanilmagan davr uchun qaytarish: oylik tarifda joriy oy qaytarilmaydi; yillik tarifda qolgan to’liq oylar uchun to’lov proporsional qaytariladi, chegirma esa hisob-kitobda qayta ko’rib chiqiladi.',
          'Operator shartnomani kamida 60 kun oldin yozma xabar berib bekor qilishi mumkin. Bunday holatda foydalanilmagan davr uchun to’lov to’liq qaytariladi va eksport oynasi 30 kundan kam bo’lmaydi.',
          'To’lov 30 kundan ortiq kechikkanda yoki 5-bo’limdagi taqiqlar buzilganda Operator shartnomani darhol bekor qilishi mumkin.',
          'Shartnoma qanday tugashidan qat’i nazar, 6-bo’limdagi 30 kunlik eksport oynasi ochiq qoladi va 8-bo’limdagi javobgarlik chegarasi kuchda qoladi.',
        ],
      },
      {
        id: 'disputes',
        h: '12. Nizolar va qo’llaniladigan huquq',
        body: [
          'Shartnomaga O’zbekiston Respublikasi qonunchiligi qo’llaniladi.',
          'Nizo avval muzokara yo’li bilan hal qilinadi. Yozma da’voga javob berish muddati — 15 (o’n besh) kalendar kun.',
          'Kelishuvga erishilmasa, nizo Termiz shahridagi vakolatli sudlarda qonunchilikda belgilangan tartibda ko’rib chiqiladi.',
          'Hujjatning o’zbek tilidagi tahriri asosiy hisoblanadi. Rus va ingliz tilidagi tahrirlar qulaylik uchun beriladi; matnlar orasida farq bo’lsa, o’zbekchasi qo’llaniladi.',
        ],
      },
      {
        id: 'requisites',
        h: '13. Operator rekvizitlari',
        body: [
          'Ishchi nom — "Smart Restaurant Campus" MChJ. Yuridik shaxsning rasmiy nomi va rekvizitlari hali tasdiqlanmagan, shuning uchun quyidagi maydonlar bo’sh qoldirilgan: qoralamada taxminiy rekvizit yozish — real rekvizit yozishdan yomonroq.',
        ],
        head: ['Maydon', 'Qiymat'],
        rows: [
          ['To’liq yuridik nom', FILL.uz],
          ['STIR', FILL.uz],
          ['Yuridik manzil', FILL.uz],
          ['Hisob raqami va bank (MFO)', FILL.uz],
          ['Rahbar', FILL.uz],
          ['Rasmiy elektron pochta', FILL.uz],
          ['Oferta kuchga kirgan sana', FILL.uz],
        ],
        after: [
          'Kundalik savollar va texnik yordam uchun Aloqa sahifasidagi telefon, Telegram va elektron pochta ishlaydi.',
        ],
        links: [{ href: '/contact', label: 'Aloqa' }],
      },
    ],
  },
  privacy: {
    eyebrow: 'Huquqiy hujjatlar',
    title: 'Maxfiylik siyosati',
    lede: 'Platforma qanday shaxsiy ma’lumotni yig’adi, nima uchun ishlatadi, kimga beradi va qancha vaqt saqlaydi. Hujjat O’zbekiston Respublikasining "Shaxsga doir ma’lumotlar to’g’risida"gi qonuni (O’RQ-547, 02.07.2019) talablariga muvofiq tuzilgan.',
    draftH: 'Bu qoralama',
    draftP: `Kuchga kirishidan oldin yurist ko’rib chiqishi shart. Versiya ${LEGAL_VERSION}, ${LEGAL_UPDATED}.`,
    updated: `Oxirgi tahrir: ${LEGAL_UPDATED} · Versiya ${LEGAL_VERSION}`,
    tocH: 'Mundarija',
    sections: [
      {
        id: 'operator',
        h: '1. Kim operator, kim ijrochi',
        body: [
          'Bu hujjatda ikki qatlam bor va ularni aralashtirmaslik muhim — javobgarlik ham, murojaat manzili ham shunga bog’liq.',
          'Mehmon va xodim ma’lumoti. Restoran — operator: qanday ma’lumot yig’ilishini va nima uchun ishlatilishini u hal qiladi. Platforma — ijrochi: ma’lumotni faqat Restoran topshirig’i bo’yicha va shu hujjatda ko’rsatilgan doirada qayta ishlaydi, o’z maqsadida ishlatmaydi.',
          'Restoranning o’z hisobi. Restoran egasi va xodimlarining Platformadagi hisoblari — elektron pochta, telefon, rol, kirish jurnali — bo’yicha operator Platformaning o’zi hisoblanadi: bu ma’lumot Platforma kim bilan shartnoma tuzganini va kim tizimga kirganini bildiradi.',
          'Mehmon o’z ma’lumoti bo’yicha avval Restoranga murojaat qiladi. Restoran javob bera olmasa yoki murojaat texnik bo’lsa — masalan, ma’lumot qaysi tizimda saqlanayotgani haqida — Platforma to’g’ridan-to’g’ri javob beradi.',
          'Ma’lumot O’zbekiston Respublikasi hududidagi serverlarda yig’iladi va saqlanadi. Bu qonunning 27¹-moddasi talabi: O’zbekiston Respublikasi fuqarolarining shaxsga doir ma’lumotlari O’zbekiston hududida joylashgan texnik vositalar yordamida qayta ishlanadi.',
        ],
      },
      {
        id: 'collected',
        h: '2. Qanday ma’lumot yig’iladi',
        body: [
          'Ro’yxat to’rt toifaga bo’lingan, chunki ularning egasi ham, huquqiy asosi ham har xil.',
        ],
        head: ['Kim', 'Qanday ma’lumot'],
        rows: [
          [
            'Mehmon',
            'Telefon raqami, ism, yetkazib berish manzili, buyurtma tarixi va tarkibi, sodiqlik balansi, qoldirgan fikri va bahosi',
          ],
          [
            'Xodim',
            'Ism, telefon, lavozimi va roli, PIN kodning qaytarib bo’lmaydigan heshi, smena va davomat yozuvlari, ish haqi hisob-kitobi',
          ],
          [
            'Restoran egasi',
            'Elektron pochta, telefon, yuridik shaxs rekvizitlari, to’lov tarixi va hisob-fakturalar',
          ],
          [
            'Texnik ma’lumot',
            'IP manzil, qurilma va brauzer turi, push bildirishnoma tokeni, cookie identifikatorlari, kirish va o’zgartirishlar jurnali',
          ],
        ],
        after: [
          'Platforma bank kartasining raqamini saqlamaydi. To’lov to’lov provayderining o’z sahifasida amalga oshiriladi va Platformaga faqat operatsiya natijasi hamda oxirgi to’rt raqam qaytadi.',
          'Biometrik ma’lumot — yuz tasviri, barmoq izi — hozircha yig’ilmaydi. Davomat uchun bunday usul yoqiladigan bo’lsa, shu hujjat oldindan yangilanadi va xodimdan alohida yozma rozilik so’raladi.',
        ],
      },
      {
        id: 'purpose',
        h: '3. Nima uchun ishlatiladi',
        body: [
          'Har bir maydon aniq bir maqsad uchun yig’iladi. Maqsaddan tashqarida ishlatish uchun alohida rozilik kerak.',
        ],
        head: ['Ma’lumot', 'Maqsad'],
        rows: [
          [
            'Telefon va ism',
            'Buyurtmani qabul qilish, holatini xabar qilish, kuryer bilan bog’lash',
          ],
          ['Yetkazib berish manzili', 'Buyurtmani yetkazib berish va yetkazish narxini hisoblash'],
          [
            'Buyurtma tarixi',
            'Hisob-kitob, qaytarish va nizolarni hal qilish, sodiqlik dasturi, soliq hisoboti',
          ],
          ['PIN heshi', 'Kassada va xodimlar ilovasida xodimning shaxsini tasdiqlash'],
          ['Davomat va ish haqi', 'Mehnat munosabatlarini rasmiylashtirish va hisob-kitob qilish'],
          [
            'Texnik ma’lumot',
            'Xavfsizlik, firibgarlikni aniqlash, xatolarni tuzatish, yuklamani o’lchash',
          ],
          [
            'Elektron pochta',
            'Xizmat xabarlari, hisob-faktura, hujjat o’zgarishi haqida ogohlantirish',
          ],
        ],
      },
      {
        id: 'basis',
        h: '4. Huquqiy asos',
        body: [
          'Shartnomani bajarish — buyurtma, to’lov, yetkazib berish va Tarif bo’yicha hisob-kitob uchun zarur ma’lumot. Busiz xizmat ko’rsatib bo’lmaydi, shuning uchun uni qayta ishlashdan voz kechish buyurtmani ham bekor qiladi.',
          'Rozilik — sodiqlik dasturi, marketing xabarlari va push bildirishnomalar uchun. SMS orqali yuborilgan bir martalik kodni kiritish rozilikning tasdig’i hisoblanadi va shu fakt sana bilan qayd etiladi. Rozilik istalgan vaqtda qaytarilishi mumkin; bu buyurtma berish imkonini yo’qotmaydi.',
          'Qonun talabi — fiskal chek, soliq va buxgalteriya hisoboti, mehnat hujjatlari. Bu yozuvlarni rozilik qaytarilganda ham o’chira olmaymiz: ularni saqlash majburiyati qonundan kelib chiqadi va muddati 5-bo’limda ko’rsatilgan.',
          'Qonuniy manfaat — xavfsizlik jurnallari, firibgarlikka qarshi tekshiruvlar va Platformaning barqarorligini ta’minlash. Bu asosda faqat texnik ma’lumot qayta ishlanadi.',
        ],
      },
      {
        id: 'retention',
        h: '5. Qancha vaqt saqlanadi',
        body: [
          'Muddat tugagach ma’lumot o’chiriladi yoki shaxssizlantiriladi. Shaxssizlantirilgan yozuv statistikada qoladi, lekin undan shaxsni aniqlab bo’lmaydi.',
        ],
        head: ['Ma’lumot', 'Muddat'],
        rows: [
          ['Buyurtma va to’lov yozuvlari', '5 yil — soliq va buxgalteriya qonunchiligi talabi'],
          ['Fiskal chek ma’lumoti', '5 yil'],
          ['Xodim davomati va smenalari', '3 yil'],
          ['Mehnat va ish haqi hujjatlari', 'Mehnat qonunchiligida belgilangan muddat'],
          ['SMS bir martalik kod (OTP)', '5 daqiqa'],
          [
            'Push bildirishnoma tokeni',
            'Ilova o’chirilgunga yoki bildirishnoma o’chirilgunga qadar',
          ],
          ['Kirish va o’zgartirishlar jurnali', '12 oy'],
          ['Zaxira nusxalar', '30 kun'],
          ['Sodiqlik hisobi va bonus balansi', 'Mehmon o’chirishni so’ragunga qadar'],
          ['Restoran hisobi', 'Shartnoma tugagandan keyin 30 kun — 6-bo’limdagi eksport oynasi'],
        ],
      },
      {
        id: 'sharing',
        h: '6. Kimga beriladi',
        body: [
          'Quyidagi ro’yxat to’liq. Bu yerda nomlanmagan uchinchi shaxsga ma’lumot berilmaydi, sotilmaydi va reklama tarmoqlariga uzatilmaydi.',
        ],
        head: ['Kim', 'Nima uzatiladi', 'Qayerda'],
        rows: [
          [
            'To’lov provayderlari — Payme, Click, Uzum',
            'To’lov summasi va buyurtma raqami. Karta ma’lumoti Platformaga umuman kelmaydi',
            'O’zbekiston',
          ],
          ['SMS provayderi — Eskiz', 'Telefon raqami va xabar matni', 'O’zbekiston'],
          [
            'Push bildirishnoma — Expo, Apple, Google',
            'Qurilma tokeni va ko’rsatiladigan xabar matni. Ism, telefon, manzil va buyurtma tarkibi uzatilmaydi',
            'AQSh',
          ],
          [
            'Fiskal ma’lumotlar operatori (OFD)',
            'Chek tarkibi — qonun talab qilgan hajmda',
            'O’zbekiston',
          ],
          [
            'Telegram',
            'Mini ilova yoki bot ishlatilganda — Telegram hisobining identifikatori va yuborilgan xabar',
            'Telegram serverlari',
          ],
          [
            'Davlat organlari',
            'Faqat qonuniy asosda rasmiylashtirilgan yozma so’rov bo’yicha va so’ralgan hajmda',
            'O’zbekiston',
          ],
        ],
        after: [
          'Push haqida alohida. Expo hamda qurilma ishlab chiqaruvchisining bildirishnoma serverlari Amerika Qo’shma Shtatlarida joylashgan. U yerga faqat qurilma tokeni va ekranda ko’rinadigan xabar matni boradi — bu ma’lumotdan shaxsni aniqlab bo’lmaydi. Buyurtma tarkibi, telefon raqami va manzil hech qachon uzatilmaydi. Bildirishnomani o’chirsangiz, token ham o’chiriladi.',
          'Har bir provayder bilan ma’lumotni faqat topshiriq doirasida ishlatish va uni himoya qilish majburiyati yozma shaklda kelishiladi.',
        ],
      },
      {
        id: 'security',
        h: '7. Xavfsizlik',
        body: [
          'Brauzer va server orasidagi aloqa TLS bilan shifrlanadi; ma’lumotlar bazasi diskda shifrlangan holda saqlanadi.',
          'Har bir restoran faqat o’z ma’lumotini ko’radi. Bu dastur darajasidagi tekshiruv emas: ajratish ma’lumotlar bazasining o’zida, qator darajasidagi xavfsizlik (RLS) siyosatlari bilan bajarilgan — noto’g’ri yozilgan so’rov ham boshqa restoranning birorta qatorini qaytara olmaydi.',
          'Parol va PIN ochiq ko’rinishda saqlanmaydi — faqat qaytarib bo’lmaydigan hesh. Yo’qolgan PIN tiklanmaydi, uning o’rniga yangisi beriladi. PIN uchun urinishlar soni cheklangan va qulflanish qo’llaniladi.',
          'Ruxsatlar rol bo’yicha beriladi va eng kam zarur hajm tamoyiliga bo’ysunadi. Har bir ahamiyatli harakat audit jurnaliga yoziladi: kim, nimani, qachon o’zgartirgani ko’rinadi.',
          'Zaxira nusxa kuniga kamida bir marta olinadi va 30 kun saqlanadi. Tiklash tartibi muntazam ravishda sinovdan o’tkaziladi — sinovdan o’tmagan zaxira zaxira emas.',
          'Ma’lumot sizib chiqqani aniqlansa, Restoran 72 soat ichida xabardor qilinadi; qonunda nazarda tutilgan hollarda vakolatli davlat organiga ham xabar beriladi.',
        ],
      },
      {
        id: 'rights',
        h: '8. Sizning huquqlaringiz',
        body: [
          'Ko’rish — sizga oid qanday ma’lumot saqlanayotganini va u kimga berilganini so’rash.',
          'Tuzatish — noto’g’ri yoki eskirgan ma’lumotni o’zgartirishni talab qilish.',
          'O’chirish — ma’lumotni o’chirishni so’rash. Qonun saqlashni talab qilgan yozuvlar — fiskal chek, buxgalteriya va mehnat hujjatlari — bundan mustasno; javobda qaysi yozuv nima uchun qolgani aytiladi.',
          'Rozilikni qaytarish — marketing xabarlari, push bildirishnomalar va sodiqlik dasturidan voz kechish. Buyurtma berish imkoni saqlanadi.',
          'Eksport — o’z ma’lumotingizni mashinada o’qiladigan formatda olish.',
          'Cheklash va e’tiroz — ayrim maqsadlar uchun qayta ishlashni to’xtatishni yoki cheklashni so’rash.',
          'Murojaat Aloqa sahifasi orqali yoki 12-bo’limdagi manzilga yuboriladi. Javob muddati — 30 kalendar kun. Shaxsingizni tasdiqlashni so’rashimiz mumkin: aks holda birovning ma’lumotini uchinchi shaxsga bergan bo’lardik.',
          'Javobdan qoniqmasangiz, vakolatli davlat organiga shikoyat qilish huquqingiz saqlanadi.',
        ],
        links: [{ href: '/contact', label: 'Murojaat yuborish' }],
      },
      {
        id: 'cookies',
        h: '9. Cookie fayllar',
        body: [
          'Platforma reklama va kuzatuv cookie’laridan foydalanmaydi va uchinchi tomon analitika skriptlarini yuklamaydi. Quyidagilar — ishlash uchun zarur bo’lgan fayllar; ularsiz tizimga kirish va kassa smenasi ishlamaydi.',
        ],
        head: ['Nomi', 'Nima uchun', 'Muddati'],
        rows: [
          ['restaurant-campus-session', 'Konsolga kirgan odamning sessiyasi', '8 soat'],
          ['restaurant-campus-terminal', 'Qaysi kassa terminali — qurilma tokeni', '1 yil'],
          ['restaurant-campus-shift', 'Kassada kim turibdi — ochiq smena', '12 soat'],
          [
            'restaurant-campus-crew-device',
            'Qaysi telefon — xodimlar ilovasining qurilma tokeni',
            '1 yil',
          ],
          [
            'restaurant-campus-crew-tenant',
            'O’sha telefon qaysi restoranga biriktirilgan',
            '1 yil',
          ],
          ['restaurant-campus-crew-session', 'Telefonni hozir kim ushlab turibdi', '12 soat'],
          ['srcp.site.lang', 'Ochiq saytda tanlangan til', '1 yil'],
        ],
        after: [
          'Kassa va xodimlar ilovasi uchun cookie’lar ataylab alohida: bitta odam bir vaqtda ham kassada, ham o’z telefonida bo’lishi mumkin, va telefondan chiqish kassadagi smenani yopmasligi kerak.',
          'Sessiya cookie’lari httpOnly — ularni sahifadagi skript o’qiy olmaydi. Cookie’larni brauzer sozlamalarida o’chirish mumkin, lekin bunda tizimga kirib bo’lmaydi.',
        ],
      },
      {
        id: 'children',
        h: '10. Bolalar',
        body: [
          'Platforma 16 yoshga to’lmagan shaxslar uchun mo’ljallanmagan va ulardan bila turib shaxsga doir ma’lumot yig’maydi.',
          'Bolaning ma’lumoti qonuniy vakilining roziligisiz kiritilgani aniqlansa, u o’chiriladi. Bunday holatni sezsangiz, 12-bo’limdagi manzilga yozing — tekshiramiz va natijasini aytamiz.',
        ],
      },
      {
        id: 'changes',
        h: '11. Hujjatning o’zgarishi',
        body: [
          'Har bir tahrirning sanasi va versiyasi shu sahifaning yuqorisida ko’rsatiladi.',
          'Ahamiyatli o’zgarishlar — yangi maqsad, yangi qabul qiluvchi, saqlash muddatining uzayishi yoki ma’lumotning boshqa mamlakatga uzatilishi — kamida 30 kun oldin elektron pochta va konsoldagi bildirishnoma orqali e’lon qilinadi.',
          'Eski tahrirlar arxivda saqlanadi va so’rov bo’yicha beriladi: qaysi shartlar qachon amal qilganini tekshirish mumkin bo’lishi kerak.',
        ],
      },
      {
        id: 'contact',
        h: '12. Aloqa',
        body: [
          'Shaxsga doir ma’lumot bo’yicha rasmiy murojaatlar quyidagi manzilga yuboriladi. Bu maydonlar qoralama tahririda to’ldirilmagan.',
        ],
        head: ['Maydon', 'Qiymat'],
        rows: [
          ['Operator — to’liq yuridik nom', FILL.uz],
          ['Pochta manzili', FILL.uz],
          ['Shaxsga doir ma’lumotlar bazalari reyestridagi raqam', FILL.uz],
          ['Maxfiylik masalalari uchun elektron pochta', FILL.uz],
          ['Ma’lumot xavfsizligi uchun mas’ul shaxs', FILL.uz],
          ['Ma’lumot saqlanadigan data-markaz (O’zbekiston)', FILL.uz],
        ],
        after: [
          'Kundalik savollar uchun Aloqa sahifasidagi telefon, Telegram va elektron pochta ishlaydi — javob o’sha kuni keladi.',
        ],
        links: [{ href: '/contact', label: 'Aloqa' }],
      },
    ],
  },
};

const ru: LegalCopy = {
  terms: {
    eyebrow: 'Правовые документы',
    title: 'Публичная оферта',
    lede: 'Условия использования платформы Smart Restaurant Cloud. Этот документ является публичной офертой в смысле статей 367–369 Гражданского кодекса Республики Узбекистан: каждый ресторан, принявший её, заключает договор с нами на одних и тех же условиях.',
    draftH: 'Это черновик',
    draftP: `До вступления в силу документ должен быть проверен юристом. Версия ${LEGAL_VERSION}, ${LEGAL_UPDATED}.`,
    updated: `Последняя редакция: ${LEGAL_UPDATED} · Версия ${LEGAL_VERSION}`,
    tocH: 'Содержание',
    sections: [
      {
        id: 'definitions',
        h: '1. Термины',
        body: [
          'Платформа — программный комплекс Smart Restaurant Cloud: веб-консоль, кассовый терминал, кухонный дисплей, приложения для сотрудников и гостей, Telegram-боты, открытый API и все их обновления.',
          'Ресторан (Арендатор) — юридическое лицо или индивидуальный предприниматель, открывший учётную запись на Платформе. Один Арендатор — один бизнес; все его филиалы находятся внутри этой записи и никогда не видят данные другого Арендатора.',
          'Пользователь — сотрудник, которого Ресторан завёл на Платформе: владелец, управляющий, официант, кассир, повар, кладовщик, бухгалтер или оператор приёма заказов.',
          'Гость — клиент Ресторана: человек, открывший QR-меню, оформивший заказ через сайт или приложение, участвующий в программе лояльности. Гость вступает в отношения с Рестораном, а не с Платформой.',
          'Тариф — план оплаты за использование Платформы, помесячный или годовой. Действующие тарифы публикуются на странице «Цены» и являются неотъемлемой частью этой оферты.',
          'Оператор — организация, разрабатывающая Платформу и оказывающая услугу; реквизиты — в разделе 13.',
        ],
      },
      {
        id: 'subject',
        h: '2. Предмет оферты',
        body: [
          'Оператор предоставляет Ресторану право пользования Платформой — программное обеспечение как услуга (SaaS): программа работает на серверах Оператора и доступна Ресторану через интернет. Ресторан оплачивает выбранный Тариф.',
          'Предмет — только программная услуга. Оператор не готовит, не продаёт и не доставляет еду и не является стороной обязательств Ресторана перед Гостем. За качество, состав, цену блюда и срок доставки отвечает Ресторан.',
          'Услуга оказывается в объёме заявленных функций. Перечень функций приведён на страницах «Возможности» и «Цены»; модуль, не входящий в Тариф, не включается.',
          'Оператор постоянно развивает Платформу. Появление новых функций не означает удаления существующих: если существующая функция будет удалена, об этом сообщается не менее чем за 90 дней.',
        ],
        links: [{ href: '/product', label: 'Возможности' }],
      },
      {
        id: 'accept',
        h: '3. Акцепт — принятие оферты',
        body: [
          'В соответствии со статьёй 369 Гражданского кодекса акцепт совершается любым из следующих действий: регистрация на Платформе, первый вход в учётную запись, открытую Оператором, завершение первоначальной настройки (онбординга) или оплата по Тарифу.',
          'С момента акцепта договор считается заключённым в письменной форме и обязателен для сторон. Отдельный бумажный договор не требуется; по запросу Ресторана он подписывается с текстом этой оферты.',
          'Лицо, совершившее акцепт, подтверждает, что имеет полномочия действовать от имени Ресторана. При выявлении акцепта без полномочий Оператор приостанавливает учётную запись и возвращает стороны в исходное положение.',
          'При изменении условий новая редакция публикуется на этой странице. О существенных для Ресторана изменениях — цена, предел ответственности, порядок работы с данными — сообщается не менее чем за 30 дней по электронной почте и уведомлением в консоли. Если Ресторан не согласен, он может расторгнуть договор в этот срок по разделу 11.',
        ],
      },
      {
        id: 'tariff',
        h: '4. Тарифы и оплата',
        body: [
          'Действующие тарифы и состав каждого из них опубликованы на странице «Цены». Цена зависит от числа филиалов: учитывается каждый активный филиал на Платформе.',
          'Расчётный период — месяц или год, выбирает Ресторан. При годовой оплате применяется скидка, и она фиксирует тариф на год со дня оплаты.',
          'Цены указываются в сумах Республики Узбекистан. Налог на добавленную стоимость начисляется в порядке, установленном законодательством, и показывается в счёте-фактуре отдельной строкой.',
          'Срок оплаты — 10 (десять) календарных дней с даты счёта. Счёт-фактура выставляется в электронной форме.',
          'При просрочке применяются два шага. Через 14 дней после срока оплаты учётная запись переводится в режим только для чтения: данные видны и выгружаются полностью, но новый заказ, платёж и смену внести нельзя. Через 30 дней услуга приостанавливается. Оба шага выполняются с предупреждением не менее чем за 3 дня.',
          'Повышение тарифа действует с момента перехода; разница рассчитывается пропорционально оставшемуся периоду. Понижение тарифа вступает в силу со следующего расчётного периода.',
          'Пробный период — 14 дней, с полным набором функций, бесплатно и без банковской карты. По окончании пробного периода учётная запись не переводится на платный тариф автоматически: оплату подтверждает сам Ресторан.',
        ],
        links: [{ href: '/pricing', label: 'Действующие тарифы' }],
      },
      {
        id: 'duties',
        h: '5. Обязанности сторон',
        body: [
          'Оператор обязуется: обеспечивать работу Платформы на уровне доступности из раздела 7; создавать резервную копию данных не реже одного раза в сутки; отвечать на обращение о неработоспособности в течение 4 часов в рабочие дни; заранее сообщать о плановых работах и существенных изменениях; обрабатывать данные в рамках раздела 6 и Политики конфиденциальности.',
          'Ресторан обязуется: хранить в тайне данные доступа — пароль, PIN, токен устройства; выдавать каждому сотруднику только необходимые для работы права и отключать учётную запись уволившегося; отвечать за достоверность и законность внесённых данных; самостоятельно получать согласия, необходимые для обработки данных Гостей; своевременно оплачивать Тариф.',
          'Ресторану запрещается: декомпилировать Платформу и проводить обратную разработку; перепродавать её, сдавать в аренду или предоставлять под своим именем; отправлять массовые автоматизированные запросы и проводить нагрузочные испытания без согласования; пытаться получить доступ к данным другого Арендатора; продавать через Платформу товары и услуги, запрещённые законом.',
          'При выявлении противоправных действий или угрозы устойчивости Платформы Оператор вправе приостановить учётную запись без предварительного уведомления. В этом случае причина сообщается письменно в течение 24 часов.',
        ],
      },
      {
        id: 'data',
        h: '6. Принадлежность данных и выгрузка',
        body: [
          'Все данные, внесённые Рестораном на Платформу — меню, заказы, база клиентов, записи о сотрудниках, финансовые отчёты, документы, — остаются собственностью Ресторана. Оператор не заявляет на них прав.',
          'Данные Гостей и сотрудников Оператор обрабатывает по поручению Ресторана. Данные не продаются, не используются для рекламы и не передаются третьим лицам — кроме случаев, предусмотренных законом, и поимённо названных в Политике конфиденциальности поставщиков услуг.',
          'Ресторан вправе в любой момент выгрузить свои данные в машиночитаемом формате (CSV и JSON). Выгрузка доступна в консоли и не требует дополнительной оплаты.',
          'После окончания или расторжения договора данные остаются доступными для выгрузки в течение 30 (тридцати) дней. По истечении этого срока данные удаляются вместе со всеми резервными копиями и не подлежат восстановлению. По запросу Ресторана выдаётся акт об удалении.',
          'Оператор вправе использовать агрегированные и обезличенные показатели для улучшения услуги — в объёме, не позволяющем определить конкретный ресторан или конкретное лицо.',
        ],
        links: [{ href: '/privacy', label: 'Политика конфиденциальности' }],
      },
      {
        id: 'uptime',
        h: '7. Доступность услуги',
        body: [
          'Целевая доступность — 99,5% за календарный месяц. В расчёт не включаются плановые технические работы и перерывы, не зависящие от Оператора (интернет-провайдер, электроснабжение, форс-мажор).',
          'Плановые технические работы проводятся с 03:00 до 05:00 по ташкентскому времени и объявляются не менее чем за 48 часов по электронной почте и уведомлением в консоли. Исключение — срочные обновления безопасности; о них сообщается настолько заранее, насколько это возможно.',
          'Касса продолжает работать при потере связи: заказы, платежи и смена сохраняются на планшете и отправляются на сервер после восстановления связи. Это неотъемлемая часть Платформы, она не продаётся отдельно и не входит в расчёт доступности.',
          'Если доступность за месяц оказалась ниже 99,5%, по письменному запросу Ресторана предоставляется компенсация в счёт следующего месяца: 10% месячного платежа за каждый неполный 1%, но не более 50% месячного платежа. Срок запроса — 30 дней после окончания отчётного месяца.',
        ],
      },
      {
        id: 'liability',
        h: '8. Предел ответственности',
        body: [
          'Совокупная ответственность Оператора по любому требованию из этого договора не превышает суммы Тарифа, уплаченной Рестораном за 1 (один) месяц, предшествующий дате возникновения требования.',
          'Оператор не отвечает за косвенные убытки: упущенную выгоду, снижение потока клиентов, репутационный вред, обязательства Ресторана перед третьими лицами.',
          'Оператор не отвечает за ущерб, вызванный действиями самого Ресторана: неверно внесённой ценой или технологической картой, избыточными правами сотрудника, раскрытым паролем или PIN, неисправностью стороннего оборудования, выбранного Рестораном.',
          'Эти пределы не применяются к ущербу, причинённому Оператором умышленно или по грубой неосторожности, а также к ответственности, которую нельзя ограничить по закону.',
        ],
      },
      {
        id: 'fiscal',
        h: '9. Фискализация',
        body: [
          'Фискализация чека происходит в рамках договора Ресторана с оператором фискальных данных (ОФД). Стороной этого договора является Ресторан, а не Оператор.',
          'Платформа выступает техническим средством: формирует данные чека, передаёт их ОФД и сохраняет ответ. Фискальный признак и проверочный QR-код приходят от ОФД и печатаются на чеке без изменений.',
          'При потере связи чек ставится в очередь и отправляется в установленное законом 24-часовое окно. Повторно напечатанный экземпляр чека выходит с отметкой «НУСХА» и не заменяет фискальный документ.',
          'Ответственность перед налоговым органом — правильное оформление торговой операции, выдача чека, соблюдение кассовой дисциплины, поддержание действующего договора с ОФД — остаётся на Ресторане.',
        ],
      },
      {
        id: 'ip',
        h: '10. Интеллектуальная собственность',
        body: [
          'Платформа, её программный код, дизайн, товарный знак и документация принадлежат Оператору. По оферте Ресторан получает только право пользования — исключительные права не переходят, лицензия не передаётся другому лицу.',
          'Ресторан полностью сохраняет права на свой контент — логотип, названия и фотографии блюд, тексты, базу клиентов — и разрешает Оператору показывать его только в рамках оказания услуги. С окончанием договора это разрешение прекращается.',
          'Оператор использует название и логотип Ресторана в списке клиентов или в качестве примера проекта только с письменного согласия. Согласие может быть отозвано в любой момент без объяснения причин.',
          'Предложенные Рестораном улучшения могут быть внесены в Платформу; права на такие улучшения остаются у Оператора и это не затрагивает собственный контент Ресторана.',
        ],
      },
      {
        id: 'termination',
        h: '11. Расторжение договора',
        body: [
          'Ресторан вправе в любой момент, без объяснения причин, расторгнуть договор через консоль или письменным обращением. Расторжение вступает в силу в конце текущего расчётного периода.',
          'Возврат за оплаченный, но неиспользованный период: при помесячном тарифе текущий месяц не возвращается; при годовом тарифе оплата за оставшиеся полные месяцы возвращается пропорционально, а скидка пересчитывается.',
          'Оператор вправе расторгнуть договор, письменно уведомив не менее чем за 60 дней. В этом случае оплата за неиспользованный период возвращается полностью, а окно выгрузки составляет не менее 30 дней.',
          'При просрочке оплаты более 30 дней или нарушении запретов раздела 5 Оператор вправе расторгнуть договор немедленно.',
          'Независимо от основания прекращения договора 30-дневное окно выгрузки из раздела 6 остаётся открытым, а предел ответственности из раздела 8 продолжает действовать.',
        ],
      },
      {
        id: 'disputes',
        h: '12. Споры и применимое право',
        body: [
          'К договору применяется законодательство Республики Узбекистан.',
          'Спор сначала разрешается путём переговоров. Срок ответа на письменную претензию — 15 (пятнадцать) календарных дней.',
          'Если соглашение не достигнуто, спор рассматривается уполномоченными судами города Термеза в порядке, установленном законодательством.',
          'Основной является редакция документа на узбекском языке. Редакции на русском и английском предоставляются для удобства; при расхождении текстов применяется узбекская.',
        ],
      },
      {
        id: 'requisites',
        h: '13. Реквизиты Оператора',
        body: [
          'Рабочее название — ООО «Smart Restaurant Campus». Официальное наименование юридического лица и его реквизиты пока не подтверждены, поэтому поля ниже оставлены пустыми: написать в черновике приблизительные реквизиты хуже, чем не написать никаких.',
        ],
        head: ['Поле', 'Значение'],
        rows: [
          ['Полное наименование юридического лица', FILL.ru],
          ['ИНН', FILL.ru],
          ['Юридический адрес', FILL.ru],
          ['Расчётный счёт и банк (МФО)', FILL.ru],
          ['Руководитель', FILL.ru],
          ['Официальная электронная почта', FILL.ru],
          ['Дата вступления оферты в силу', FILL.ru],
        ],
        after: [
          'Для повседневных вопросов и технической поддержки работают телефон, Telegram и электронная почта со страницы «Контакты».',
        ],
        links: [{ href: '/contact', label: 'Контакты' }],
      },
    ],
  },
  privacy: {
    eyebrow: 'Правовые документы',
    title: 'Политика конфиденциальности',
    lede: 'Какие персональные данные собирает Платформа, зачем их использует, кому передаёт и сколько хранит. Документ составлен в соответствии с Законом Республики Узбекистан «О персональных данных» (ЗРУ-547 от 02.07.2019).',
    draftH: 'Это черновик',
    draftP: `До вступления в силу документ должен быть проверен юристом. Версия ${LEGAL_VERSION}, ${LEGAL_UPDATED}.`,
    updated: `Последняя редакция: ${LEGAL_UPDATED} · Версия ${LEGAL_VERSION}`,
    tocH: 'Содержание',
    sections: [
      {
        id: 'operator',
        h: '1. Кто оператор, кто обработчик',
        body: [
          'В этом документе два слоя, и их важно не смешивать — от этого зависят и ответственность, и адрес обращения.',
          'Данные Гостей и сотрудников. Ресторан — оператор: он решает, какие данные собираются и для чего используются. Платформа — обработчик: она обрабатывает данные только по поручению Ресторана и в пределах, описанных в этом документе, и не использует их в своих целях.',
          'Собственная учётная запись Ресторана. По учётным записям владельца и сотрудников на Платформе — электронная почта, телефон, роль, журнал входов — оператором является сама Платформа: эти данные говорят о том, с кем Платформа заключила договор и кто вошёл в систему.',
          'По своим данным Гость сначала обращается в Ресторан. Если Ресторан не может ответить или обращение носит технический характер — например, о том, в какой системе хранятся данные, — отвечает непосредственно Платформа.',
          'Данные собираются и хранятся на серверах, расположенных на территории Республики Узбекистан. Это требование статьи 27¹ Закона: персональные данные граждан Республики Узбекистан обрабатываются с использованием технических средств, находящихся на территории Узбекистана.',
        ],
      },
      {
        id: 'collected',
        h: '2. Какие данные собираются',
        body: [
          'Перечень разделён на четыре категории, потому что у них разные владельцы и разные правовые основания.',
        ],
        head: ['Кто', 'Какие данные'],
        rows: [
          [
            'Гость',
            'Номер телефона, имя, адрес доставки, история и состав заказов, баланс лояльности, оставленный отзыв и оценка',
          ],
          [
            'Сотрудник',
            'Имя, телефон, должность и роль, необратимый хеш PIN-кода, записи о сменах и посещаемости, расчёт заработной платы',
          ],
          [
            'Владелец Ресторана',
            'Электронная почта, телефон, реквизиты юридического лица, история платежей и счета-фактуры',
          ],
          [
            'Технические данные',
            'IP-адрес, тип устройства и браузера, токен push-уведомлений, идентификаторы cookie, журнал входов и изменений',
          ],
        ],
        after: [
          'Платформа не хранит номер банковской карты. Оплата совершается на странице платёжного провайдера, а на Платформу возвращаются только результат операции и последние четыре цифры.',
          'Биометрические данные — изображение лица, отпечаток пальца — пока не собираются. Если такой способ учёта посещаемости будет включён, документ будет обновлён заранее, а у сотрудника будет запрошено отдельное письменное согласие.',
        ],
      },
      {
        id: 'purpose',
        h: '3. Для чего используются',
        body: [
          'Каждое поле собирается для конкретной цели. Для использования за пределами цели нужно отдельное согласие.',
        ],
        head: ['Данные', 'Цель'],
        rows: [
          ['Телефон и имя', 'Приём заказа, сообщение о его статусе, связь с курьером'],
          ['Адрес доставки', 'Доставка заказа и расчёт её стоимости'],
          [
            'История заказов',
            'Расчёты, возвраты и разбор спорных ситуаций, программа лояльности, налоговая отчётность',
          ],
          [
            'Хеш PIN-кода',
            'Подтверждение личности сотрудника на кассе и в приложении для персонала',
          ],
          ['Посещаемость и заработная плата', 'Оформление трудовых отношений и расчёты'],
          [
            'Технические данные',
            'Безопасность, выявление мошенничества, исправление ошибок, измерение нагрузки',
          ],
          [
            'Электронная почта',
            'Служебные сообщения, счета-фактуры, предупреждение об изменении документов',
          ],
        ],
      },
      {
        id: 'basis',
        h: '4. Правовое основание',
        body: [
          'Исполнение договора — данные, необходимые для заказа, оплаты, доставки и расчётов по Тарифу. Без них услуга невозможна, поэтому отказ от их обработки отменяет и заказ.',
          'Согласие — программа лояльности, маркетинговые сообщения и push-уведомления. Ввод одноразового кода, отправленного по SMS, считается подтверждением согласия, и этот факт фиксируется с датой. Согласие можно отозвать в любой момент; возможность оформлять заказы при этом сохраняется.',
          'Требование закона — фискальный чек, налоговая и бухгалтерская отчётность, трудовые документы. Эти записи нельзя удалить даже при отзыве согласия: обязанность их хранить вытекает из закона, а сроки указаны в разделе 5.',
          'Законный интерес — журналы безопасности, проверки на мошенничество и обеспечение устойчивости Платформы. На этом основании обрабатываются только технические данные.',
        ],
      },
      {
        id: 'retention',
        h: '5. Сколько хранятся',
        body: [
          'По истечении срока данные удаляются или обезличиваются. Обезличенная запись остаётся в статистике, но по ней нельзя определить человека.',
        ],
        head: ['Данные', 'Срок'],
        rows: [
          [
            'Записи о заказах и платежах',
            '5 лет — требование налогового и бухгалтерского законодательства',
          ],
          ['Данные фискальных чеков', '5 лет'],
          ['Посещаемость и смены сотрудников', '3 года'],
          [
            'Трудовые документы и расчёт заработной платы',
            'Срок, установленный трудовым законодательством',
          ],
          ['Одноразовый код SMS (OTP)', '5 минут'],
          ['Токен push-уведомлений', 'До удаления приложения или отключения уведомлений'],
          ['Журнал входов и изменений', '12 месяцев'],
          ['Резервные копии', '30 дней'],
          ['Счёт лояльности и бонусный баланс', 'До запроса Гостя об удалении'],
          [
            'Учётная запись Ресторана',
            '30 дней после окончания договора — окно выгрузки из раздела 6',
          ],
        ],
      },
      {
        id: 'sharing',
        h: '6. Кому передаются',
        body: [
          'Перечень ниже исчерпывающий. Третьим лицам, здесь не названным, данные не передаются, не продаются и не отправляются в рекламные сети.',
        ],
        head: ['Кому', 'Что передаётся', 'Где'],
        rows: [
          [
            'Платёжные провайдеры — Payme, Click, Uzum',
            'Сумма платежа и номер заказа. Данные карты на Платформу вообще не поступают',
            'Узбекистан',
          ],
          ['SMS-провайдер — Eskiz', 'Номер телефона и текст сообщения', 'Узбекистан'],
          [
            'Push-уведомления — Expo, Apple, Google',
            'Токен устройства и текст показываемого сообщения. Имя, телефон, адрес и состав заказа не передаются',
            'США',
          ],
          [
            'Оператор фискальных данных (ОФД)',
            'Состав чека — в объёме, требуемом законом',
            'Узбекистан',
          ],
          [
            'Telegram',
            'При использовании мини-приложения или бота — идентификатор аккаунта Telegram и отправленное сообщение',
            'Серверы Telegram',
          ],
          [
            'Государственные органы',
            'Только по оформленному на законном основании письменному запросу и в запрошенном объёме',
            'Узбекистан',
          ],
        ],
        after: [
          'Отдельно о push-уведомлениях. Серверы уведомлений Expo и производителя устройства находятся в Соединённых Штатах Америки. Туда уходят только токен устройства и текст сообщения, видимый на экране, — по этим данным нельзя определить человека. Состав заказа, номер телефона и адрес не передаются никогда. Если отключить уведомления, токен также удаляется.',
          'С каждым поставщиком письменно согласована обязанность использовать данные только в рамках поручения и защищать их.',
        ],
      },
      {
        id: 'security',
        h: '7. Безопасность',
        body: [
          'Обмен между браузером и сервером шифруется по TLS; база данных хранится на диске в зашифрованном виде.',
          'Каждый ресторан видит только свои данные. Это не проверка на уровне приложения: разделение выполнено в самой базе данных политиками безопасности на уровне строк (RLS) — даже неверно написанный запрос не вернёт ни одной строки другого ресторана.',
          'Пароли и PIN не хранятся в открытом виде — только необратимый хеш. Утраченный PIN не восстанавливается, вместо него выдаётся новый. Число попыток ввода PIN ограничено, применяется блокировка.',
          'Права выдаются по ролям и подчиняются принципу минимально необходимого объёма. Каждое значимое действие записывается в журнал аудита: видно, кто, что и когда изменил.',
          'Резервная копия создаётся не реже одного раза в сутки и хранится 30 дней. Процедура восстановления регулярно проверяется — непроверенная резервная копия не является резервной копией.',
          'При выявлении утечки данных Ресторан уведомляется в течение 72 часов; в случаях, предусмотренных законом, уведомляется и уполномоченный государственный орган.',
        ],
      },
      {
        id: 'rights',
        h: '8. Ваши права',
        body: [
          'Доступ — запросить, какие данные о вас хранятся и кому они передавались.',
          'Исправление — потребовать изменения неверных или устаревших данных.',
          'Удаление — запросить удаление данных. Исключение составляют записи, которые закон требует хранить, — фискальные чеки, бухгалтерские и трудовые документы; в ответе указывается, какая запись и почему осталась.',
          'Отзыв согласия — отказ от маркетинговых сообщений, push-уведомлений и программы лояльности. Возможность оформлять заказы сохраняется.',
          'Выгрузка — получить свои данные в машиночитаемом формате.',
          'Ограничение и возражение — запросить прекращение или ограничение обработки для отдельных целей.',
          'Обращение направляется через страницу «Контакты» или по адресу из раздела 12. Срок ответа — 30 календарных дней. Мы можем попросить подтвердить личность: иначе мы передали бы чужие данные постороннему.',
          'Если ответ вас не устроил, за вами сохраняется право обратиться с жалобой в уполномоченный государственный орган.',
        ],
        links: [{ href: '/contact', label: 'Отправить обращение' }],
      },
      {
        id: 'cookies',
        h: '9. Файлы cookie',
        body: [
          'Платформа не использует рекламные и трекинговые cookie и не загружает сторонние аналитические скрипты. Ниже — файлы, необходимые для работы; без них не работают вход в систему и кассовая смена.',
        ],
        head: ['Имя', 'Зачем', 'Срок'],
        rows: [
          ['restaurant-campus-session', 'Сессия человека, вошедшего в консоль', '8 часов'],
          ['restaurant-campus-terminal', 'Какой кассовый терминал — токен устройства', '1 год'],
          ['restaurant-campus-shift', 'Кто стоит на кассе — открытая смена', '12 часов'],
          [
            'restaurant-campus-crew-device',
            'Какой телефон — токен устройства приложения для персонала',
            '1 год',
          ],
          ['restaurant-campus-crew-tenant', 'К какому ресторану привязан этот телефон', '1 год'],
          ['restaurant-campus-crew-session', 'Кто сейчас держит телефон', '12 часов'],
          ['srcp.site.lang', 'Язык, выбранный на публичном сайте', '1 год'],
        ],
        after: [
          'Cookie кассы и приложения для персонала намеренно разделены: один человек может одновременно быть и на кассе, и на своём телефоне, и выход с телефона не должен закрывать смену на кассе.',
          'Сессионные cookie помечены httpOnly — скрипт на странице не может их прочитать. Cookie можно отключить в настройках браузера, но тогда вход в систему станет невозможен.',
        ],
      },
      {
        id: 'children',
        h: '10. Дети',
        body: [
          'Платформа не предназначена для лиц младше 16 лет и не собирает у них персональные данные осознанно.',
          'Если выяснится, что данные ребёнка были внесены без согласия законного представителя, они удаляются. Если вы заметили такой случай, напишите по адресу из раздела 12 — мы проверим и сообщим о результате.',
        ],
      },
      {
        id: 'changes',
        h: '11. Изменения документа',
        body: [
          'Дата и версия каждой редакции указываются в верхней части этой страницы.',
          'О существенных изменениях — новая цель, новый получатель, продление срока хранения или передача данных в другую страну — сообщается не менее чем за 30 дней по электронной почте и уведомлением в консоли.',
          'Прежние редакции хранятся в архиве и предоставляются по запросу: должна быть возможность проверить, какие условия действовали в какой период.',
        ],
      },
      {
        id: 'contact',
        h: '12. Контакты',
        body: [
          'Официальные обращения по персональным данным направляются по адресу ниже. В черновой редакции эти поля не заполнены.',
        ],
        head: ['Поле', 'Значение'],
        rows: [
          ['Оператор — полное наименование юридического лица', FILL.ru],
          ['Почтовый адрес', FILL.ru],
          ['Номер в реестре баз персональных данных', FILL.ru],
          ['Электронная почта по вопросам конфиденциальности', FILL.ru],
          ['Ответственный за безопасность данных', FILL.ru],
          ['Центр обработки данных, где хранятся данные (Узбекистан)', FILL.ru],
        ],
        after: [
          'Для повседневных вопросов работают телефон, Telegram и электронная почта со страницы «Контакты» — ответ приходит в тот же день.',
        ],
        links: [{ href: '/contact', label: 'Контакты' }],
      },
    ],
  },
};

const en: LegalCopy = {
  terms: {
    eyebrow: 'Legal documents',
    title: 'Public offer',
    lede: 'The terms on which Smart Restaurant Cloud is used. This document is a public offer within the meaning of articles 367–369 of the Civil Code of the Republic of Uzbekistan: every restaurant that accepts it enters into a contract with us on exactly the same terms.',
    draftH: 'This is a draft',
    draftP: `It must be reviewed by a lawyer before it takes effect. Version ${LEGAL_VERSION}, ${LEGAL_UPDATED}.`,
    updated: `Last revised: ${LEGAL_UPDATED} · Version ${LEGAL_VERSION}`,
    tocH: 'Contents',
    sections: [
      {
        id: 'definitions',
        h: '1. Definitions',
        body: [
          'Platform — the Smart Restaurant Cloud software suite: the web console, the till, the kitchen display, the staff and guest apps, the Telegram bots, the public API, and every update to them.',
          'Restaurant (Tenant) — the legal entity or sole trader that holds an account on the Platform. One Tenant is one business; all of its branches live inside that account and never see another Tenant’s data.',
          'User — an employee the Restaurant has added to the Platform: owner, manager, waiter, cashier, chef, storekeeper, accountant or order operator.',
          'Guest — a customer of the Restaurant: someone who opens the QR menu, orders through the website or the app, or takes part in the loyalty programme. A Guest deals with the Restaurant, not with the Platform.',
          'Plan — the monthly or annual charge for using the Platform. Current plans are published on the Pricing page and form an integral part of this offer.',
          'Operator — the company that builds the Platform and provides the service; its details are in section 13.',
        ],
      },
      {
        id: 'subject',
        h: '2. What is offered',
        body: [
          'The Operator grants the Restaurant the right to use the Platform — software as a service (SaaS): the software runs on the Operator’s servers and is reached by the Restaurant over the internet. The Restaurant pays for the Plan it has chosen.',
          'The subject is software only. The Operator does not cook, sell or deliver food, and is not a party to the Restaurant’s obligations towards a Guest. The quality, composition, price and delivery time of a dish are the Restaurant’s responsibility.',
          'The service is provided to the extent of the functionality published. That functionality is listed on the Product and Pricing pages; a module outside the chosen Plan is not enabled.',
          'The Operator develops the Platform continuously. Adding new functionality does not imply removing existing functionality: if an existing function is to be withdrawn, at least 90 days’ notice is given.',
        ],
        links: [{ href: '/product', label: 'What the Platform does' }],
      },
      {
        id: 'accept',
        h: '3. Acceptance of the offer',
        body: [
          'Under article 369 of the Civil Code, acceptance is made by any of the following: registering on the Platform, signing in for the first time to an account opened by the Operator, completing onboarding, or paying for a Plan.',
          'From the moment of acceptance the contract is treated as concluded in writing and binds both parties. A separate paper contract is not required; at the Restaurant’s request it is signed carrying the text of this offer.',
          'Whoever accepts confirms that they are authorised to act for the Restaurant. If acceptance is found to have been made without authority, the Operator suspends the account and restores both parties to their original position.',
          'When the terms change, the new revision is published on this page. Changes that matter to the Restaurant — price, limitation of liability, how data is handled — are announced at least 30 days in advance by email and by a notice in the console. A Restaurant that does not agree may terminate within that period under section 11.',
        ],
      },
      {
        id: 'tariff',
        h: '4. Plans and payment',
        body: [
          'Current plans and what each includes are published on the Pricing page. The price depends on the number of branches: every active branch on the Platform counts.',
          'The billing period is a month or a year, at the Restaurant’s choice. Annual payment carries a discount and fixes the price for a year from the date of payment.',
          'Prices are stated in Uzbek soum. Value added tax is charged as required by law and shown as a separate line on the invoice.',
          'Payment is due within 10 (ten) calendar days of the invoice date. Invoices are issued electronically.',
          'Late payment has two steps. Fourteen days after the due date the account becomes read-only: data stays fully visible and exportable, but no new order, payment or shift can be entered. Thirty days after the due date the service is suspended. Both steps are taken with at least 3 days’ warning.',
          'Moving to a larger plan takes effect immediately, with the difference charged pro rata for the remainder of the period. Moving to a smaller plan takes effect from the next billing period.',
          'The trial is 14 days, with full functionality, free and without a bank card. When it ends the account is not moved onto a paid plan automatically: the Restaurant confirms the payment itself.',
        ],
        links: [{ href: '/pricing', label: 'Current plans' }],
      },
      {
        id: 'duties',
        h: '5. Obligations of the parties',
        body: [
          'The Operator undertakes to: run the Platform at the availability level set out in section 7; back up data at least once a day; respond to a report that the service is down within 4 hours on working days; give advance notice of planned maintenance and material changes; and process data within section 6 and the Privacy policy.',
          'The Restaurant undertakes to: keep its credentials — passwords, PINs, device tokens — confidential; grant each employee only the permissions their work requires and disable the account of anyone who leaves; be responsible for the accuracy and lawfulness of the data it enters; obtain for itself any consent needed to process Guest data; and pay for its Plan on time.',
          'The Restaurant must not: decompile or reverse-engineer the Platform; resell, sublicense or present it under its own name; send bulk automated requests or run load tests without agreement; attempt to reach another Tenant’s data; or sell goods or services prohibited by law through the Platform.',
          'Where unlawful activity or a threat to the stability of the Platform is found, the Operator may suspend the account without prior notice. In that case the reason is given in writing within 24 hours.',
        ],
      },
      {
        id: 'data',
        h: '6. Ownership of data and export',
        body: [
          'All data the Restaurant enters on the Platform — menu, orders, customer base, employee records, financial reports, documents — remains the property of the Restaurant. The Operator claims no ownership of it.',
          'Guest and employee data is processed by the Operator on the Restaurant’s instruction. It is not sold, not used for advertising and not passed to third parties — other than as required by law and to the service providers named individually in the Privacy policy.',
          'The Restaurant may export its data at any time in machine-readable form (CSV and JSON). Export is available in the console and costs nothing extra.',
          'After the contract ends or is terminated, the data stays available for export for 30 (thirty) days. After that period the data is deleted together with every backup and cannot be restored. A certificate of deletion is issued on request.',
          'The Operator may use aggregated, de-identified figures to improve the service — only to a degree that identifies neither a particular restaurant nor a particular person.',
        ],
        links: [{ href: '/privacy', label: 'Privacy policy' }],
      },
      {
        id: 'uptime',
        h: '7. Availability',
        body: [
          'The target availability is 99.5% per calendar month. Planned maintenance and outages outside the Operator’s control (internet provider, power supply, force majeure) are excluded from the calculation.',
          'Planned maintenance runs between 03:00 and 05:00 Tashkent time and is announced at least 48 hours in advance by email and by a notice in the console. Urgent security updates are the exception; notice is given as far in advance as possible.',
          'The till keeps working when the connection drops: orders, payments and the shift are stored on the tablet and sent to the server once the connection returns. This is part of the Platform, not a separate product, and it does not count towards availability.',
          'Where monthly availability falls below 99.5%, a credit against the following month is granted on the Restaurant’s written request: 10% of the monthly charge for each incomplete 1%, capped at 50% of the monthly charge. Requests are made within 30 days of the end of the month in question.',
        ],
      },
      {
        id: 'liability',
        h: '8. Limitation of liability',
        body: [
          'The Operator’s total liability on any claim under this contract does not exceed the Plan charge paid by the Restaurant for the 1 (one) month preceding the date the claim arose.',
          'The Operator is not liable for indirect loss: lost profit, a fall in customer numbers, damage to reputation, or the Restaurant’s obligations to third parties.',
          'The Operator is not liable for loss caused by the Restaurant’s own acts: a price or recipe card entered incorrectly, excessive permissions granted to an employee, a disclosed password or PIN, or a fault in third-party hardware the Restaurant has chosen.',
          'These limits do not apply to loss caused by the Operator intentionally or through gross negligence, nor to liability that cannot be limited by law.',
        ],
      },
      {
        id: 'fiscal',
        h: '9. Fiscalisation',
        body: [
          'A receipt is fiscalised under the Restaurant’s own contract with a fiscal data operator (OFD). The party to that contract is the Restaurant, not the Operator.',
          'In this process the Platform is a technical instrument: it assembles the receipt data, submits it to the OFD and stores the response. The fiscal mark and the verification QR code come from the OFD and are printed on the receipt unchanged.',
          'If the connection drops the receipt is queued and submitted within the 24-hour window the law allows. A reprinted copy carries the "NUSXA" mark and does not replace the fiscal document.',
          'Responsibility towards the tax authority — recording the sale correctly, issuing the receipt, observing cash discipline, keeping the OFD contract in force — remains with the Restaurant.',
        ],
      },
      {
        id: 'ip',
        h: '10. Intellectual property',
        body: [
          'The Platform, its source code, design, trade mark and documentation belong to the Operator. Under this offer the Restaurant receives a right of use only — exclusive rights do not transfer and the licence may not be passed on.',
          'The Restaurant retains all rights in its own content — logo, dish names and photographs, texts, customer base — and allows the Operator to display it solely in the course of providing the service. That permission ends with the contract.',
          'The Operator uses the Restaurant’s name and logo in a customer list or as a case study only with written consent. Consent may be withdrawn at any time without giving a reason.',
          'Improvements suggested by the Restaurant may be built into the Platform; rights in such improvements remain with the Operator, and this does not affect the Restaurant’s own content.',
        ],
      },
      {
        id: 'termination',
        h: '11. Termination',
        body: [
          'The Restaurant may terminate at any time, without giving a reason, through the console or by written notice. Termination takes effect at the end of the current billing period.',
          'Refunds for a paid but unused period: on a monthly plan the current month is not refunded; on an annual plan the remaining whole months are refunded pro rata and the discount is recalculated.',
          'The Operator may terminate on at least 60 days’ written notice. In that case the unused period is refunded in full and the export window is not shorter than 30 days.',
          'Where payment is more than 30 days late, or the prohibitions in section 5 are breached, the Operator may terminate immediately.',
          'However the contract ends, the 30-day export window in section 6 stays open and the limitation of liability in section 8 continues to apply.',
        ],
      },
      {
        id: 'disputes',
        h: '12. Disputes and governing law',
        body: [
          'This contract is governed by the law of the Republic of Uzbekistan.',
          'A dispute is first addressed through negotiation. A written claim is answered within 15 (fifteen) calendar days.',
          'If no agreement is reached, the dispute is heard by the competent courts of the city of Termez in the manner established by law.',
          'The Uzbek version of this document is the governing one. The Russian and English versions are provided for convenience; where the texts differ, the Uzbek text applies.',
        ],
      },
      {
        id: 'requisites',
        h: '13. Operator details',
        body: [
          'The working name is "Smart Restaurant Campus" LLC. The registered name of the legal entity and its details are not confirmed yet, so the fields below are left empty: approximate details in a draft are worse than none at all.',
        ],
        head: ['Field', 'Value'],
        rows: [
          ['Registered name of the legal entity', FILL.en],
          ['Taxpayer identification number (TIN)', FILL.en],
          ['Registered address', FILL.en],
          ['Settlement account and bank (MFO)', FILL.en],
          ['Director', FILL.en],
          ['Official email address', FILL.en],
          ['Date this offer takes effect', FILL.en],
        ],
        after: [
          'For day-to-day questions and technical support, the phone, Telegram and email on the Contact page are live.',
        ],
        links: [{ href: '/contact', label: 'Contact' }],
      },
    ],
  },
  privacy: {
    eyebrow: 'Legal documents',
    title: 'Privacy policy',
    lede: 'What personal data the Platform collects, why it is used, who it is shared with and how long it is kept. This document is written to the requirements of the Law of the Republic of Uzbekistan "On personal data" (ZRU-547 of 02.07.2019).',
    draftH: 'This is a draft',
    draftP: `It must be reviewed by a lawyer before it takes effect. Version ${LEGAL_VERSION}, ${LEGAL_UPDATED}.`,
    updated: `Last revised: ${LEGAL_UPDATED} · Version ${LEGAL_VERSION}`,
    tocH: 'Contents',
    sections: [
      {
        id: 'operator',
        h: '1. Who is the operator, who is the processor',
        body: [
          'There are two layers in this document, and keeping them apart matters — both responsibility and the address to write to depend on it.',
          'Guest and employee data. The Restaurant is the operator: it decides what data is collected and what it is used for. The Platform is the processor: it handles that data only on the Restaurant’s instruction and within the limits described here, and never for its own purposes.',
          'The Restaurant’s own account. For the console accounts of the owner and the staff — email address, phone number, role, sign-in log — the operator is the Platform itself: that data records who the Platform contracted with and who signed in.',
          'A Guest asks the Restaurant first about their own data. Where the Restaurant cannot answer, or the question is technical — which system holds the data, for instance — the Platform answers directly.',
          'Data is collected and stored on servers located in the territory of the Republic of Uzbekistan. This is the requirement of article 27¹ of the Law: the personal data of citizens of the Republic of Uzbekistan is processed using technical means located in Uzbekistan.',
        ],
      },
      {
        id: 'collected',
        h: '2. What is collected',
        body: [
          'The list is split into four categories, because they have different owners and different legal bases.',
        ],
        head: ['Whose', 'What is collected'],
        rows: [
          [
            'Guest',
            'Phone number, name, delivery address, order history and contents, loyalty balance, reviews and ratings left',
          ],
          [
            'Employee',
            'Name, phone number, position and role, an irreversible hash of the PIN, shift and attendance records, payroll figures',
          ],
          [
            'Restaurant owner',
            'Email address, phone number, company registration details, payment history and invoices',
          ],
          [
            'Technical data',
            'IP address, device and browser type, push notification token, cookie identifiers, sign-in and change log',
          ],
        ],
        after: [
          'The Platform does not store bank card numbers. Payment happens on the payment provider’s own page, and only the result of the transaction and the last four digits come back to the Platform.',
          'Biometric data — face images, fingerprints — is not collected at present. If such a method of recording attendance is switched on, this document is updated in advance and separate written consent is obtained from the employee.',
        ],
      },
      {
        id: 'purpose',
        h: '3. What it is used for',
        body: [
          'Each field is collected for a specific purpose. Using it beyond that purpose requires separate consent.',
        ],
        head: ['Data', 'Purpose'],
        rows: [
          [
            'Phone number and name',
            'Taking the order, reporting its status, putting the courier in touch',
          ],
          ['Delivery address', 'Delivering the order and calculating the delivery charge'],
          [
            'Order history',
            'Settlement, refunds and dispute resolution, the loyalty programme, tax reporting',
          ],
          ['PIN hash', 'Confirming an employee’s identity at the till and in the staff app'],
          ['Attendance and payroll', 'Recording the employment relationship and calculating pay'],
          ['Technical data', 'Security, fraud detection, fixing errors, measuring load'],
          ['Email address', 'Service messages, invoices, notice that a document has changed'],
        ],
      },
      {
        id: 'basis',
        h: '4. Legal basis',
        body: [
          'Performance of the contract — the data needed for an order, a payment, delivery and Plan billing. The service cannot be provided without it, so refusing that processing also cancels the order.',
          'Consent — the loyalty programme, marketing messages and push notifications. Entering the one-time code sent by SMS counts as confirmation of consent, and the fact is recorded with its date. Consent may be withdrawn at any time; the ability to place orders is unaffected.',
          'Legal requirement — fiscal receipts, tax and accounting records, employment documents. These records cannot be deleted even when consent is withdrawn: the obligation to keep them comes from the law, and the periods are in section 5.',
          'Legitimate interest — security logs, fraud checks and keeping the Platform stable. Only technical data is processed on this basis.',
        ],
      },
      {
        id: 'retention',
        h: '5. How long it is kept',
        body: [
          'When the period ends the data is deleted or de-identified. A de-identified record stays in the statistics, but no person can be identified from it.',
        ],
        head: ['Data', 'Period'],
        rows: [
          ['Order and payment records', '5 years — required by tax and accounting law'],
          ['Fiscal receipt data', '5 years'],
          ['Employee attendance and shifts', '3 years'],
          ['Employment and payroll documents', 'The period set by employment law'],
          ['One-time SMS code (OTP)', '5 minutes'],
          ['Push notification token', 'Until the app is removed or notifications are turned off'],
          ['Sign-in and change log', '12 months'],
          ['Backups', '30 days'],
          ['Loyalty account and bonus balance', 'Until the Guest asks for deletion'],
          [
            'Restaurant account',
            '30 days after the contract ends — the export window in section 6',
          ],
        ],
      },
      {
        id: 'sharing',
        h: '6. Who it is shared with',
        body: [
          'The list below is exhaustive. Data is not passed to any third party not named here, is not sold and is not sent to advertising networks.',
        ],
        head: ['Who', 'What is sent', 'Where'],
        rows: [
          [
            'Payment providers — Payme, Click, Uzum',
            'The amount and the order number. Card details never reach the Platform at all',
            'Uzbekistan',
          ],
          ['SMS provider — Eskiz', 'Phone number and message text', 'Uzbekistan'],
          [
            'Push notifications — Expo, Apple, Google',
            'The device token and the text shown on screen. Name, phone number, address and order contents are not sent',
            'United States',
          ],
          [
            'Fiscal data operator (OFD)',
            'Receipt contents — to the extent the law requires',
            'Uzbekistan',
          ],
          [
            'Telegram',
            'When the mini app or a bot is used — the Telegram account identifier and the message sent',
            'Telegram servers',
          ],
          [
            'State authorities',
            'Only on a written request properly made on a lawful basis, and only to the extent requested',
            'Uzbekistan',
          ],
        ],
        after: [
          'A note on push. The notification servers of Expo and of the device manufacturer are located in the United States. All that goes there is the device token and the message text shown on screen — no person can be identified from that. Order contents, phone numbers and addresses are never sent. Turning notifications off deletes the token as well.',
          'Each provider is bound in writing to use the data only within our instruction and to protect it.',
        ],
      },
      {
        id: 'security',
        h: '7. Security',
        body: [
          'Traffic between the browser and the server is encrypted with TLS; the database is encrypted at rest.',
          'Each restaurant sees only its own data. This is not a check in the application: the separation is in the database itself, through row-level security policies — even a badly written query cannot return a single row belonging to another restaurant.',
          'Passwords and PINs are never stored in the clear — only an irreversible hash. A lost PIN is not recovered; a new one is issued. The number of PIN attempts is limited and lockout applies.',
          'Permissions are granted by role and follow the principle of least privilege. Every significant action is written to the audit log: who changed what, and when.',
          'Backups are taken at least once a day and kept for 30 days. The restore procedure is tested regularly — an untested backup is not a backup.',
          'If a data breach is identified, the Restaurant is notified within 72 hours; where the law requires it, the competent state authority is notified as well.',
        ],
      },
      {
        id: 'rights',
        h: '8. Your rights',
        body: [
          'Access — ask what data about you is held and who it has been shared with.',
          'Correction — require inaccurate or outdated data to be changed.',
          'Deletion — ask for data to be deleted. Records the law requires us to keep — fiscal receipts, accounting and employment documents — are the exception; the reply says which record stayed and why.',
          'Withdrawal of consent — opt out of marketing messages, push notifications and the loyalty programme. The ability to place orders remains.',
          'Export — receive your data in machine-readable form.',
          'Restriction and objection — ask for processing to stop or be limited for particular purposes.',
          'Requests are sent through the Contact page or to the address in section 12. Replies are given within 30 calendar days. We may ask you to confirm your identity: otherwise we would be handing someone else’s data to a stranger.',
          'If the reply does not satisfy you, you keep the right to complain to the competent state authority.',
        ],
        links: [{ href: '/contact', label: 'Send a request' }],
      },
      {
        id: 'cookies',
        h: '9. Cookies',
        body: [
          'The Platform uses no advertising or tracking cookies and loads no third-party analytics scripts. The cookies below are the ones it needs to work; without them signing in and the cash shift do not function.',
        ],
        head: ['Name', 'What for', 'Lifetime'],
        rows: [
          [
            'restaurant-campus-session',
            'The session of the person signed in to the console',
            '8 hours',
          ],
          ['restaurant-campus-terminal', 'Which till this is — the device token', '1 year'],
          ['restaurant-campus-shift', 'Who is standing at the till — the open shift', '12 hours'],
          [
            'restaurant-campus-crew-device',
            'Which phone this is — the staff app’s device token',
            '1 year',
          ],
          ['restaurant-campus-crew-tenant', 'Which restaurant that phone belongs to', '1 year'],
          ['restaurant-campus-crew-session', 'Who is holding the phone right now', '12 hours'],
          ['srcp.site.lang', 'The language chosen on the public site', '1 year'],
        ],
        after: [
          'The till cookies and the staff app cookies are deliberately separate: one person can be at the till and on their own phone at the same time, and signing out of the phone must not close the shift at the till.',
          'Session cookies are httpOnly — a script on the page cannot read them. Cookies can be turned off in the browser, but then signing in becomes impossible.',
        ],
      },
      {
        id: 'children',
        h: '10. Children',
        body: [
          'The Platform is not intended for anyone under 16 and does not knowingly collect personal data from them.',
          'If it turns out that a child’s data was entered without the consent of their legal guardian, it is deleted. If you notice such a case, write to the address in section 12 — we will look into it and tell you the outcome.',
        ],
      },
      {
        id: 'changes',
        h: '11. Changes to this document',
        body: [
          'The date and version of each revision are shown at the top of this page.',
          'Material changes — a new purpose, a new recipient, a longer retention period, or a transfer of data to another country — are announced at least 30 days in advance by email and by a notice in the console.',
          'Earlier revisions are archived and provided on request: it must be possible to check which terms applied in which period.',
        ],
      },
      {
        id: 'contact',
        h: '12. Contact',
        body: [
          'Formal requests about personal data are sent to the address below. In this draft revision these fields are not filled in.',
        ],
        head: ['Field', 'Value'],
        rows: [
          ['Operator — registered name of the legal entity', FILL.en],
          ['Postal address', FILL.en],
          ['Number in the state register of personal data bases', FILL.en],
          ['Email address for privacy requests', FILL.en],
          ['Person responsible for data security', FILL.en],
          ['Data centre where the data is held (Uzbekistan)', FILL.en],
        ],
        after: [
          'For day-to-day questions the phone, Telegram and email on the Contact page are live — an answer comes the same day.',
        ],
        links: [{ href: '/contact', label: 'Contact' }],
      },
    ],
  },
};

/** All three languages, for the tests that compare them against each other. */
export const LEGAL: Readonly<Record<Locale, LegalCopy>> = { uz, ru, en };

/**
 * The two documents for one reader.
 *
 * Takes a plain string rather than a `Locale`, because the caller is a page
 * reading a cookie: `srcp.site.lang` is whatever the browser sends, and a page
 * that trusts it would render `undefined` for anyone who has never touched the
 * language switch.
 *
 * Checked against the list rather than indexed with `?? LEGAL.uz`, which is
 * what this was and what `legal.test.ts` caught on its first run: `LEGAL`
 * inherits from `Object.prototype`, so a cookie of `__proto__` — or
 * `constructor`, or `toString` — indexes to something truthy, the fallback
 * never fires, and the page renders a document with no clauses in it. A
 * missing key is not the same question as a key nobody defined.
 */
export function legalCopy(locale: string | undefined): LegalCopy {
  return SUPPORTED_LOCALES.includes(locale as Locale) ? LEGAL[locale as Locale] : LEGAL.uz;
}
