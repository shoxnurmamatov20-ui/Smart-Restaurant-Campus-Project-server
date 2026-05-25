import Link from 'next/link';

const MODULES = [
  { key: 'hr', label: 'Kadrlar', icon: '👥' },
  { key: 'students', label: 'Talabalar', icon: '🎓' },
  { key: 'online', label: 'Online', icon: '🎥' },
  { key: 'edms', label: 'Hujjat', icon: '📄' },
  { key: 'rttm', label: 'RTTM', icon: '🖥️' },
  { key: 'psychology', label: 'Psixologik', icon: '🧠' },
  { key: 'exams', label: 'Imtihon', icon: '📝' },
  { key: 'library', label: 'Kutubxona', icon: '📚' },
  { key: 'media', label: 'Media', icon: '🖼️' },
  { key: 'kpi', label: 'KPI', icon: '📊' },
] as const;

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="w-64 border-r bg-sidebar p-4">
        <div className="mb-6 px-2">
          <Link href="/" className="text-xl font-semibold">
            CAMPUS
          </Link>
        </div>

        <nav className="space-y-1">
          <Link
            href="/"
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-accent"
          >
            <span>🏠</span>
            <span>Asosiy</span>
          </Link>
          {MODULES.map((m) => (
            <Link
              key={m.key}
              href={`/${m.key}`}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-accent"
            >
              <span>{m.icon}</span>
              <span>{m.label}</span>
            </Link>
          ))}
        </nav>
      </aside>

      {/* Main */}
      <main className="flex-1">
        <header className="border-b px-6 py-4">
          {/* TODO: header with user menu, language switcher, notifications */}
        </header>
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
