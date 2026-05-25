import Link from 'next/link';

export const metadata = { title: 'Telegram botlar · Super Admin' };

const BOT_GROUPS = [
  {
    title: 'Phase 1 — Asosiy 10 ta',
    bots: [
      { key: 'student', name: 'Talaba boti', icon: '🎓', audience: 'Talaba' },
      { key: 'parent', name: 'Ota-ona boti', icon: '👨‍👩‍👧', audience: 'Ota-ona' },
      { key: 'teacher', name: "O'qituvchi boti", icon: '👨‍🏫', audience: "O'qituvchi" },
      { key: 'hr', name: 'Kadrlar boti', icon: '👔', audience: 'Xodim' },
      { key: 'library', name: 'Kutubxona boti', icon: '📚', audience: 'Hammasi' },
      { key: 'cafeteria', name: 'Kantin boti', icon: '🍽', audience: 'Hammasi' },
      { key: 'transport', name: 'Transport boti', icon: '🚌', audience: 'Hammasi' },
      { key: 'helpdesk', name: 'Help Desk', icon: '🎫', audience: 'Hammasi' },
      { key: 'edms', name: 'EDMS boti', icon: '📄', audience: 'Xodim' },
      { key: 'rector', name: 'Rektor boti', icon: '👑', audience: 'Admin' },
    ],
  },
  {
    title: 'Phase 2 — Maxsus 20 ta',
    bots: [
      { key: 'smart_classroom', name: 'Smart Classroom', icon: '🎓', audience: "O'qituvchi" },
      { key: 'exam_proctor', name: 'Imtihon proktorlik', icon: '👁', audience: "O'qituvchi" },
      { key: 'alumni', name: 'Bitiruvchilar', icon: '🎓', audience: 'Hammasi' },
      { key: 'anonymous_tip', name: 'Anonim shikoyat', icon: '🤐', audience: 'Hammasi' },
      { key: 'dormitory', name: 'Yotoqxona', icon: '🛏', audience: 'Talaba' },
      { key: 'parking', name: 'Parking', icon: '🅿️', audience: 'Xodim' },
      { key: 'security', name: 'Xavfsizlik', icon: '🛡', audience: 'Security' },
      { key: 'sports', name: 'Sport klublari', icon: '⚽', audience: 'Talaba' },
      { key: 'new_books', name: 'Yangi kitoblar', icon: '🆕', audience: 'Hammasi' },
      { key: 'scholarships', name: 'Stipendiya', icon: '💰', audience: 'Talaba' },
      { key: 'research', name: 'Ilmiy ishlar', icon: '🔬', audience: "O'qituvchi" },
      { key: 'conferences', name: 'Konferensiyalar', icon: '🎤', audience: "O'qituvchi" },
      { key: 'diplomas', name: 'BMI', icon: '🎓', audience: 'Talaba' },
      { key: 'internship', name: 'Amaliyot', icon: '💼', audience: 'Talaba' },
      { key: 'career', name: 'Karyera', icon: '💼', audience: 'Talaba' },
      { key: 'masterclass', name: 'Masterclass', icon: '🎨', audience: 'Hammasi' },
      { key: 'mental_health', name: 'Ruhiy salomatlik', icon: '🧠', audience: 'Hammasi' },
      { key: 'emergency', name: 'Favqulodda', icon: '🚨', audience: 'Hammasi' },
      { key: 'weather', name: 'Ob-havo', icon: '⛅', audience: 'Hammasi' },
      { key: 'language_pair', name: 'Til amaliyot', icon: '🗣', audience: 'Talaba' },
    ],
  },
  {
    title: 'Phase 2 — AI 2 ta',
    bots: [
      { key: 'ai_assistant', name: 'AI Yordamchi', icon: '🤖', audience: 'Hammasi' },
      { key: 'dropout_alert', name: 'Dropout bashorat', icon: '⚠️', audience: 'Dekan' },
    ],
  },
  {
    title: 'Phase 2 — Fakultet botlari (8 ta)',
    bots: [
      { key: 'fac_it', name: 'IT fakulteti', icon: '💻', audience: 'Talaba' },
      { key: 'fac_economics', name: 'Iqtisodiyot', icon: '📊', audience: 'Talaba' },
      { key: 'fac_law', name: 'Yuridik', icon: '⚖️', audience: 'Talaba' },
      { key: 'fac_medicine', name: 'Tibbiyot', icon: '⚕️', audience: 'Talaba' },
      { key: 'fac_engineering', name: 'Muhandislik', icon: '⚙️', audience: 'Talaba' },
      { key: 'fac_philology', name: 'Filologiya', icon: '📖', audience: 'Talaba' },
      { key: 'fac_pedagogy', name: 'Pedagogika', icon: '🎓', audience: 'Talaba' },
      { key: 'fac_arts', name: "San'at", icon: '🎨', audience: 'Talaba' },
    ],
  },
  {
    title: 'Phase 2 — Kafedra botlari (10 ta)',
    bots: [
      { key: 'dep_programming', name: 'Dasturlash', icon: '⌨️', audience: 'Hammasi' },
      { key: 'dep_networks', name: 'Tarmoqlar', icon: '🌐', audience: 'Hammasi' },
      { key: 'dep_ai', name: "Sun'iy intellekt", icon: '🤖', audience: 'Hammasi' },
      { key: 'dep_database', name: "Ma'lumotlar bazasi", icon: '💾', audience: 'Hammasi' },
      { key: 'dep_marketing', name: 'Marketing', icon: '📣', audience: 'Hammasi' },
      { key: 'dep_finance', name: 'Moliya', icon: '💵', audience: 'Hammasi' },
      { key: 'dep_management', name: 'Menejment', icon: '📊', audience: 'Hammasi' },
      { key: 'dep_civil_law', name: 'Fuqaroviy huquq', icon: '⚖️', audience: 'Hammasi' },
      { key: 'dep_pediatrics', name: 'Pediatriya', icon: '👶', audience: 'Hammasi' },
      { key: 'dep_surgery', name: 'Xirurgiya', icon: '🔬', audience: 'Hammasi' },
    ],
  },
];

export default function TelegramBotsPage() {
  const totalBots = BOT_GROUPS.reduce((sum, g) => sum + g.bots.length, 0);
  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Telegram botlar tizimi</h1>
          <p className="mt-2 text-muted-foreground">
            {totalBots} ta bot — bitta multi-bot dispatcher (Python aiogram 3) orqali boshqariladi
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/telegram/broadcast"
            className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-zinc-50"
          >
            📢 Broadcast
          </Link>
          <Link
            href="/telegram/analytics"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            📊 Analytics
          </Link>
        </div>
      </header>

      <div className="grid gap-3 md:grid-cols-4">
        <Stat label="Jami botlar" value={String(totalBots)} icon="🤖" />
        <Stat label="Yoqilgan" value="0" icon="✅" />
        <Stat label="Bog'langan foydalanuvchilar" value="—" icon="👥" />
        <Stat label="So'nggi 24h xabarlar" value="—" icon="💬" />
      </div>

      {BOT_GROUPS.map((group) => (
        <section key={group.title} className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {group.title}
          </h2>
          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {group.bots.map((bot) => (
              <Link
                key={bot.key}
                href={`/telegram/${bot.key}`}
                className="group flex items-center gap-3 rounded-md border bg-white p-3 transition hover:border-primary hover:shadow-sm"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-zinc-100 text-xl">
                  {bot.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium">{bot.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {bot.key} · {bot.audience}
                  </p>
                </div>
                <span
                  className="h-2 w-2 shrink-0 rounded-full bg-zinc-300"
                  title="Token o'rnatilmagan"
                />
              </Link>
            ))}
          </div>
        </section>
      ))}

      <div className="rounded-md border border-dashed bg-zinc-50 p-6 text-sm">
        <p className="font-medium">⚙️ Bot yoqish</p>
        <p className="mt-1 text-muted-foreground">
          Bot ishlashi uchun <code className="rounded bg-zinc-200 px-1 py-0.5">apps/telegram-bots/.env</code> da{' '}
          <code className="rounded bg-zinc-200 px-1 py-0.5">BOT_TOKEN_&lt;KEY&gt;</code> o'rnating va Python servisni
          qayta ishga tushiring:
          <br />
          <code className="mt-2 inline-block rounded bg-zinc-900 px-2 py-1 text-zinc-100">
            php artisan telegram:sync
          </code>
        </p>
      </div>
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
        <span className="text-lg">{icon}</span>
      </div>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}
