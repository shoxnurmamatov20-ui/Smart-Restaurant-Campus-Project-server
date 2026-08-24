import { DEFAULT_URL_LOCALE, type UrlLocale } from '@/lib/locale-path';

/**
 * The `<title>` and `<description>` of every public page, in three languages.
 *
 * These used to be one language. That was correct while the site had one URL
 * per page: the canonical document was the Uzbek one, a crawler indexed it
 * once, and a Russian reader who switched languages was reading a page that
 * had never claimed to be Russian.
 *
 * Moving the language into the path changed what those strings mean.
 * `/ru/pricing` is now its own indexable document with its own self-referencing
 * canonical, and it was being served with an Uzbek title — which is the exact
 * failure the move was meant to end, arrived at from the other side. A Russian
 * search result showed Uzbek words above a Russian page.
 *
 * The Uzbek here is untouched, character for character, from what each page
 * carried before. The other two are written rather than composed: the titles
 * are not the headings — `/roles` is headed "Har kim faqat o'z ishini ko'radi"
 * and titled "to'qqiz rol, to'qqiz ekran" — so building them from the copy
 * tree would have quietly replaced somebody's wording with a heading that
 * happens to be nearby.
 */
export type PageKey =
  | 'home'
  | 'product'
  | 'roles'
  | 'pricing'
  | 'customers'
  | 'faq'
  | 'contact'
  | 'download'
  | 'terms'
  | 'privacy';

type PageMeta = { title: string; description: string };

const uz: Record<PageKey, PageMeta> = {
  home: {
    title: 'Smart Restaurant Cloud — restoraningiz bitta ekranda',
    description:
      "Buyurtmadan hisobotgacha. Ofitsiant, oshpaz, kassir, omborchi va egasi — hammasi bitta tizimda, o'zbek tilida. 14 kun bepul sinov.",
  },
  product: {
    title: 'Mahsulot — restoranning har bir bo’limi uchun',
    description:
      'Zal, oshxona, kassa, ombor, moliya va ko’p filial — oltita modul, har biri o’z ekrani bilan. Fiskal modul, Didox, Click, Payme va 1C ulangan holda keladi.',
  },
  roles: {
    title: 'Kim uchun — to’qqiz rol, to’qqiz ekran',
    description:
      'To’qqizta rol, to’qqizta boshqa ekran. Har birida nima mumkin va nima mumkin emasligi aniq belgilangan.',
  },
  pricing: {
    title: 'Narxlar — ochiq narx, yashirin to’lovsiz',
    description:
      'Filial soniga qarab to’laysiz. Yangilanishlar, yordam va ma’lumot zaxirasi narxga kiritilgan. Tizim o’zini oqlashini kalkulyatorda o’zingiz hisoblang.',
  },
  customers: {
    title: 'Stsenariylar — raqamlar bilan aytilgan uchta holat',
    description:
      'Har bir stsenariyda nima muammo bo’lgani, nima o’zgargani va natija qanday o’lchanishi yozilgan. Tizimning o’z hisobotlari asosidagi namunaviy holatlar.',
  },
  faq: {
    title: 'Savollar — ko’p so’raladigan savollar',
    description:
      'Ishga tushirish, kundalik ish, xavfsizlik va narx bo’yicha o’nta savol va javob. Javobini topmadingizmi? Qo’ng’iroq qiling — o’sha kuni javob beramiz.',
  },
  contact: {
    title: 'Aloqa — bir qo’ng’iroqdan boshlanadi',
    description:
      'Formani to’ldirsangiz shu kuni javob beramiz. Yoki to’g’ridan-to’g’ri qo’ng’iroq qiling — bizda avtojavob yo’q.',
  },
  download: {
    title: 'Ilovani yuklab olish — Android va iPhone',
    description:
      'Smart Restaurant ilovasini to’g’ridan-to’g’ri saytdan yuklab oling — Play Market orqali emas. Bitta Android faylida to’rtta yuza, versiya, hajm va SHA-256 bilan. iPhone uchun sayt bosh ekranga ilova bo’lib o’rnatiladi.',
  },
  terms: {
    title: 'Ommaviy oferta — foydalanish shartlari',
    description:
      'Smart Restaurant Cloud platformasidan foydalanish shartlari: tarif va to’lov, ma’lumotlar egaligi va eksport, xizmat mavjudligi, javobgarlik chegarasi, fiskallashtirish va nizolarni hal qilish tartibi.',
  },
  privacy: {
    title: 'Maxfiylik siyosati — shaxsiy ma’lumotlar',
    description:
      'Platforma qanday shaxsiy ma’lumotni yig’adi, nima uchun ishlatadi, kimga beradi va qancha vaqt saqlaydi. Ma’lumot O’zbekiston hududidagi serverlarda saqlanadi.',
  },
};

const ru: Record<PageKey, PageMeta> = {
  home: {
    title: 'Smart Restaurant Cloud — ваш ресторан на одном экране',
    description:
      'От заказа до отчёта. Официант, повар, кассир, кладовщик и владелец — все в одной системе. 14 дней бесплатно.',
  },
  product: {
    title: 'Продукт — для каждого участка ресторана',
    description:
      'Зал, кухня, касса, склад, финансы и сеть филиалов — шесть модулей, у каждого свой экран. Фискальный модуль, Didox, Click, Payme и 1С подключены сразу.',
  },
  roles: {
    title: 'Для кого — девять ролей, девять экранов',
    description:
      'Девять ролей — девять разных экранов. Для каждой чётко определено, что можно, а что нельзя.',
  },
  pricing: {
    title: 'Цены — открытые цены, без скрытых платежей',
    description:
      'Платите по числу филиалов. Обновления, поддержка и резервные копии входят в цену. Окупаемость посчитайте сами в калькуляторе.',
  },
  customers: {
    title: 'Сценарии — три случая, рассказанные цифрами',
    description:
      'В каждом сценарии описано, в чём была проблема, что изменилось и как измерен результат. Модельные случаи на основе собственных отчётов системы.',
  },
  faq: {
    title: 'Вопросы — о запуске, работе и цене',
    description:
      'Десять вопросов и ответов о запуске, ежедневной работе, безопасности и цене. Не нашли ответ? Позвоните — ответим в тот же день.',
  },
  contact: {
    title: 'Контакты — всё начинается с одного звонка',
    description:
      'Заполните форму — ответим в тот же день. Или позвоните напрямую: автоответчика у нас нет.',
  },
  download: {
    title: 'Скачать приложение — Android и iPhone',
    description:
      'Скачайте приложение Smart Restaurant прямо с сайта, а не из Play Market. Один файл Android — четыре раздела, с версией, размером и SHA-256. На iPhone сайт ставится на домашний экран как приложение.',
  },
  terms: {
    title: 'Публичная оферта — условия использования',
    description:
      'Условия использования платформы Smart Restaurant Cloud: тариф и оплата, владение данными и экспорт, доступность сервиса, пределы ответственности, фискализация и порядок разрешения споров.',
  },
  privacy: {
    title: 'Политика конфиденциальности — персональные данные',
    description:
      'Какие персональные данные собирает платформа, зачем использует, кому передаёт и сколько хранит. Данные хранятся на серверах на территории Узбекистана.',
  },
};

const en: Record<PageKey, PageMeta> = {
  home: {
    title: 'Smart Restaurant Cloud — your restaurant on one screen',
    description:
      'From the order to the report. Waiter, chef, cashier, storekeeper and owner — all in one system. 14 days free.',
  },
  product: {
    title: 'Product — built for every part of the restaurant',
    description:
      'Floor, kitchen, till, stock, finance and multi-branch — six modules, each with its own screen. The fiscal module, Didox, Click, Payme and 1C come connected.',
  },
  roles: {
    title: "Who it's for — nine roles, nine screens",
    description:
      'Nine roles, nine different screens. For each one, what is allowed and what is not is set out exactly.',
  },
  pricing: {
    title: 'Pricing — open pricing, no hidden fees',
    description:
      'You pay by the number of branches. Updates, support and backups are included. Work out the payback yourself in the calculator.',
  },
  customers: {
    title: 'Scenarios — three cases, told in numbers',
    description:
      "Each scenario sets out what the problem was, what changed and how the result is measured. Modelled cases, built from the system's own reports.",
  },
  faq: {
    title: 'Questions — setup, daily use and price',
    description:
      "Ten questions and answers on setup, daily use, security and price. Didn't find your answer? Call us — we answer the same day.",
  },
  contact: {
    title: 'Contact — it starts with one call',
    description:
      'Fill in the form and we answer the same day. Or call directly — there is no answering machine.',
  },
  download: {
    title: 'Download the app — Android and iPhone',
    description:
      'Download the Smart Restaurant app straight from the site, not from the Play Store. One Android file with four surfaces, its version, size and SHA-256. On iPhone the site installs to the home screen as an app.',
  },
  terms: {
    title: 'Public offer — terms of use',
    description:
      'Terms of use for the Smart Restaurant Cloud platform: tariff and payment, data ownership and export, service availability, limits of liability, fiscalisation and how disputes are settled.',
  },
  privacy: {
    title: 'Privacy policy — personal data',
    description:
      'What personal data the platform collects, why it uses it, who it is shared with and how long it is kept. Data is stored on servers inside Uzbekistan.',
  },
};

const CATALOGUES: Record<UrlLocale, Record<PageKey, PageMeta>> = { uz, ru, en };

export function pageMeta(locale: UrlLocale, page: PageKey): PageMeta {
  return (CATALOGUES[locale] ?? CATALOGUES[DEFAULT_URL_LOCALE])[page];
}
