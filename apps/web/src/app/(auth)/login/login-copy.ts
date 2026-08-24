/**
 * The three doors, said out loud.
 *
 * `Smart Restaurant Cloud - Sayt v2.dc.html:797-860` draws the sign-in screen as
 * one of the marketing site's eight pages, and it is not just the card: above it
 * sits an eyebrow, a heading — *"Uchta eshik, uchta boshqa yo'l"* — and three
 * numbered doors saying who uses which. Only the card was built, so a manager
 * arriving here met three unexplained tabs and had to guess.
 *
 * That guess is the actual problem. A waiter who picks "Pochta" has no email to
 * type; a manager who picks "PIN kod" has no PIN. The design answers the
 * question before it is asked, which is why the doors are content rather than
 * decoration.
 *
 * Local to this route rather than in `src/i18n`. The shared catalogue is for
 * what more than one surface says, and nothing else says this. Transcribed
 * verbatim, including the Russian, which the designer wrote shorter than the
 * other two on purpose — `FOUNDATIONS §8`: "Russian is neutral-professional,
 * English is the most concise. Never machine-translate."
 */

export type Lang = 'uz' | 'ru' | 'en';

type Trilingual = Readonly<Record<Lang, string>>;

export type Door = {
  /** `01`, `02`, `03` — the design numbers them, and the order is the audience's size. */
  readonly number: string;
  readonly who: Trilingual;
  readonly how: Trilingual;
};

export const SIGN_IN_INTRO: Readonly<Record<'eyebrow' | 'heading' | 'lede', Trilingual>> = {
  eyebrow: { uz: 'Tizimga kirish', ru: 'Вход в систему', en: 'Sign in' },
  heading: {
    uz: "Uchta eshik, uchta boshqa yo'l",
    ru: 'Три двери, три разных пути',
    en: 'Three doors, three different paths',
  },
  lede: {
    uz: 'Egasi kompyuterdan parol bilan kiradi, ofitsiant planshetdan PIN bilan, platforma operatori esa ikki bosqichli tasdiq bilan.',
    ru: 'Владелец входит с компьютера по паролю, официант — с планшета по PIN.',
    en: 'Owners sign in from a desktop with a password, waiters from a tablet with a PIN, platform operators with two-factor confirmation.',
  },
};

export const DOORS: readonly Door[] = [
  {
    number: '01',
    who: {
      uz: 'Egasi, menejer, buxgalter',
      ru: 'Владелец, менеджер, бухгалтер',
      en: 'Owner, manager, accountant',
    },
    how: {
      uz: 'Pochta va parol, kompyuterdan. Kirgandan keyin filial tanlanadi.',
      ru: 'Почта и пароль с компьютера.',
      en: 'Email and password from a desktop; the branch is chosen after signing in.',
    },
  },
  {
    number: '02',
    who: {
      uz: 'Ofitsiant, kassir, oshpaz',
      ru: 'Официант, кассир, повар',
      en: 'Waiter, cashier, kitchen',
    },
    how: {
      uz: 'Planshetdan 4 xonali PIN. Ikki soniyada kiradi, smena shu yerdan boshlanadi.',
      ru: 'С планшета — четырёхзначный PIN.',
      en: 'A four-digit PIN on the tablet. Two seconds in, and the shift starts here.',
    },
  },
  {
    number: '03',
    who: {
      uz: 'Platforma operatori',
      ru: 'Оператор платформы',
      en: 'Platform operator',
    },
    how: {
      uz: 'Alohida manzil va ikki bosqichli tasdiq. Har bir kirish jurnalga tushadi.',
      ru: 'Отдельный адрес и двухфакторное подтверждение.',
      en: 'A separate address and two-factor confirmation. Every sign-in is logged.',
    },
  },
];
