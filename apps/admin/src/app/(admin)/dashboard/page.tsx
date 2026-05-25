export const metadata = { title: 'Dashboard · Super Admin' };

const stats = [
  { label: 'Jami foydalanuvchilar', value: '—', trend: '+0%' },
  { label: 'Talabalar (aktiv)', value: '—', trend: '+0%' },
  { label: "O'qituvchilar", value: '—', trend: '+0%' },
  { label: 'Modullar (yoqilgan)', value: '10', trend: '+0' },
  { label: 'API calls (24h)', value: '—', trend: '+0%' },
  { label: 'Disk band', value: '—', trend: '—' },
];

export default function AdminDashboardPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Super Admin Dashboard</h1>
        <p className="mt-2 text-muted-foreground">Tizimning real-time holati</p>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg border bg-white p-5 shadow-sm">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              {s.label}
            </p>
            <p className="mt-1 text-3xl font-bold">{s.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{s.trend}</p>
          </div>
        ))}
      </div>

      {/* TODO: real-time charts (Recharts) + AI Big Data insights */}
    </div>
  );
}
