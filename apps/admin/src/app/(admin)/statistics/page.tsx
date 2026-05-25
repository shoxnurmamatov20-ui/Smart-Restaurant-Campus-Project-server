import Link from 'next/link';

export const metadata = { title: 'Statistika · Super Admin' };

const TABS = [
  { href: '/statistics', label: 'Umumiy' },
  { href: '/statistics/users', label: 'Foydalanuvchilar' },
  { href: '/statistics/activity', label: 'Faollik' },
  { href: '/statistics/system', label: 'Tizim resurslar' },
];

export default function StatisticsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Statistika</h1>
        <p className="mt-2 text-muted-foreground">Tizim bo'yicha chuqur analitika (ClickHouse)</p>
      </header>

      <nav className="flex gap-1 border-b">
        {TABS.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="border-b-2 border-transparent px-4 py-2 text-sm font-medium hover:border-zinc-300"
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {/* TODO: charts via Recharts, server data via TanStack Query → /api/v1/admin/statistics */}
      <div className="rounded-md border bg-white p-12 text-center text-muted-foreground">
        Umumiy statistika dashboard
      </div>
    </div>
  );
}
