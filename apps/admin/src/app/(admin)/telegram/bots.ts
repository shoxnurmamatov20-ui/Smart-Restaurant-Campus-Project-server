/**
 * The bot registry, mirrored.
 *
 * `apps/telegram-bots/src/bots/registry.py` is the source of truth and reaches
 * this console through the Laravel TelegramBots module. The keys must stay
 * identical: a key that exists here and not there shows an operator a bot that
 * cannot be started.
 *
 * The design rules emoji out of the interface, so a bot is identified by its
 * key — set in a mono face, the way every other identifier on this console is —
 * rather than by a picture that renders differently on every machine.
 */
export type Bot = { key: string; name: string; audience: string };

export const BOT_GROUPS: readonly { title: string; bots: readonly Bot[] }[] = [
  {
    title: 'Asosiy 10 ta',
    bots: [
      { key: 'guest', name: 'Mehmon boti', audience: 'Mehmon' },
      { key: 'waiter', name: 'Ofitsiant boti', audience: 'Ofitsiant' },
      { key: 'kitchen', name: 'Oshxona boti', audience: 'Oshpaz' },
      { key: 'courier', name: 'Kuryer boti', audience: 'Kuryer' },
      { key: 'manager', name: 'Filial menejeri', audience: 'Menejer' },
      { key: 'owner', name: 'Egasi boti', audience: 'Egasi' },
      { key: 'loyalty', name: 'Sodiqlik boti', audience: 'Mehmon' },
      { key: 'reservation', name: 'Bron boti', audience: 'Mehmon' },
      { key: 'feedback', name: 'Fikr-mulohaza', audience: 'Mehmon' },
      { key: 'supplier', name: 'Yetkazib beruvchi', audience: 'Yetkazuvchi' },
    ],
  },
  {
    title: 'Operatsion 10 ta',
    bots: [
      { key: 'stock_alert', name: 'Ombor ogohlantirish', audience: 'Omborchi' },
      { key: 'waste', name: 'Chiqim nazorati', audience: 'Menejer' },
      { key: 'haccp', name: 'HACCP va sanitariya', audience: 'Oshpaz' },
      { key: 'shift_swap', name: 'Smena almashinuvi', audience: 'Xodim' },
      { key: 'payroll', name: 'Ish haqi', audience: 'Xodim' },
      { key: 'training', name: 'Xodim o‘qitish', audience: 'Xodim' },
      { key: 'recruiting', name: 'Ishga qabul', audience: 'Menejer' },
      { key: 'equipment', name: 'Jihoz texnik xizmati', audience: 'Menejer' },
      { key: 'energy', name: 'Energiya monitoringi', audience: 'Menejer' },
      { key: 'security', name: 'Xavfsizlik va CCTV', audience: 'Xavfsizlik' },
    ],
  },
  {
    title: 'Marketing va mehmon 10 ta',
    bots: [
      { key: 'birthday', name: 'Tug‘ilgan kun', audience: 'Mehmon' },
      { key: 'winback', name: 'Qaytarish kampaniyasi', audience: 'Mehmon' },
      { key: 'catering', name: 'Banket va keytering', audience: 'Mehmon' },
      { key: 'corporate', name: 'Korporativ mijozlar', audience: 'Mehmon' },
      { key: 'gift_card', name: 'Sovg‘a sertifikati', audience: 'Mehmon' },
      { key: 'review_watch', name: 'Tashqi sharhlar', audience: 'Menejer' },
      { key: 'menu_ai', name: 'AI menyu maslahatchi', audience: 'Mehmon' },
      { key: 'nutrition', name: 'Kaloriya va parhez', audience: 'Mehmon' },
      { key: 'allergen', name: 'Allergen ogohlantirish', audience: 'Mehmon' },
      { key: 'queue', name: 'Navbat boshqaruvi', audience: 'Mehmon' },
    ],
  },
  {
    title: 'Yetkazib berish 4 ta',
    bots: [
      { key: 'aggregator', name: 'Agregatorlar', audience: 'Menejer' },
      { key: 'delivery_zone', name: 'Yetkazish zonalari', audience: 'Menejer' },
      { key: 'driver_dispatch', name: 'Kuryer taqsimoti', audience: 'Kuryer' },
      { key: 'tracking', name: 'Buyurtma kuzatuvi', audience: 'Mehmon' },
    ],
  },
  {
    title: 'Moliya 4 ta',
    bots: [
      { key: 'cash_alert', name: 'Kassa anomaliyasi', audience: 'Egasi' },
      { key: 'fiscal', name: 'Fiskal xatolar', audience: 'Buxgalter' },
      { key: 'debt', name: 'Qarzdorlik', audience: 'Buxgalter' },
      { key: 'budget', name: 'Byudjet nazorati', audience: 'Egasi' },
    ],
  },
  {
    title: 'Filial botlari 8 ta',
    bots: [
      { key: 'br_chilonzor', name: 'Chilonzor filiali', audience: 'Xodim' },
      { key: 'br_yunusobod', name: 'Yunusobod filiali', audience: 'Xodim' },
      { key: 'br_mirzo_ulugbek', name: 'Mirzo Ulug‘bek filiali', audience: 'Xodim' },
      { key: 'br_sergeli', name: 'Sergeli filiali', audience: 'Xodim' },
      { key: 'br_yakkasaroy', name: 'Yakkasaroy filiali', audience: 'Xodim' },
      { key: 'br_shayxontohur', name: 'Shayxontohur filiali', audience: 'Xodim' },
      { key: 'br_olmazor', name: 'Olmazor filiali', audience: 'Xodim' },
      { key: 'br_bektemir', name: 'Bektemir filiali', audience: 'Xodim' },
    ],
  },
  {
    title: 'Konsept va tarmoq 4 ta',
    bots: [
      { key: 'concept_pizza', name: 'Pizza konsepti', audience: 'Mehmon' },
      { key: 'concept_coffee', name: 'Kofexona konsepti', audience: 'Mehmon' },
      { key: 'franchise', name: 'Franchayzing', audience: 'Egasi' },
      { key: 'audit', name: 'Ichki audit', audience: 'Egasi' },
    ],
  },
];

export const ALL_BOTS: readonly Bot[] = BOT_GROUPS.flatMap((group) => group.bots);

export const BOT_BY_KEY: Record<string, Bot> = Object.fromEntries(
  ALL_BOTS.map((bot) => [bot.key, bot]),
);

/** The sub-views a single bot has, in the order its tab strip lists them. */
export const BOT_SECTIONS = (key: string) => [
  { href: `/telegram/${key}`, label: 'Umumiy' },
  { href: `/telegram/${key}/commands`, label: 'Buyruqlar' },
  { href: `/telegram/${key}/messages`, label: 'Xabarlar' },
  { href: `/telegram/${key}/users`, label: 'Foydalanuvchilar' },
  { href: `/telegram/${key}/broadcast`, label: 'Broadcast' },
  { href: `/telegram/${key}/settings`, label: 'Sozlamalar' },
];
