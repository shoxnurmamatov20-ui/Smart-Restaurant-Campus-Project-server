import Link from 'next/link';

const NAV = [
  { group: 'Asosiy', items: [
    { href: '/dashboard', icon: '📊', label: 'Dashboard' },
  ]},
  { group: 'Foydalanuvchilar', items: [
    { href: '/users', icon: '👥', label: 'Foydalanuvchilar' },
    { href: '/roles', icon: '🎭', label: 'Rollar va permissionlar' },
    { href: '/tenants', icon: '🏛️', label: 'Universitetlar' },
  ]},
  { group: 'Tizim', items: [
    { href: '/modules', icon: '🔧', label: 'Modullar' },
    { href: '/settings', icon: '⚙️', label: 'Sozlamalar' },
    { href: '/integrations', icon: '🔌', label: 'Integratsiyalar' },
    { href: '/api-keys', icon: '🔑', label: 'API kalitlar' },
  ]},
  { group: 'Analitika', items: [
    { href: '/statistics', icon: '📈', label: 'Statistika' },
    { href: '/reports', icon: '📋', label: 'Hisobotlar' },
    { href: '/audit', icon: '📜', label: 'Audit log' },
  ]},
  { group: 'Aloqa', items: [
    { href: '/notifications', icon: '📢', label: 'Xabarnomalar' },
    { href: '/telegram', icon: '✈️', label: 'Telegram botlar' },
  ]},
  { group: 'Texnik', items: [
    { href: '/system-health', icon: '🩺', label: 'Tizim salomatligi' },
    { href: '/backups', icon: '💾', label: 'Backups' },
    { href: '/security', icon: '🛡️', label: 'Xavfsizlik' },
  ]},
] as const;

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-zinc-50">
      <aside className="w-72 border-r bg-white p-4">
        <div className="mb-6 flex items-center gap-2 px-2">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-primary text-primary-foreground">
            👑
          </div>
          <div>
            <Link href="/dashboard" className="text-sm font-semibold leading-tight">
              CAMPUS Admin
            </Link>
            <p className="text-[10px] text-muted-foreground">Super Admin Panel</p>
          </div>
        </div>

        <nav className="space-y-4">
          {NAV.map((group) => (
            <div key={group.group}>
              <h3 className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {group.group}
              </h3>
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-100"
                  >
                    <span>{item.icon}</span>
                    <span>{item.label}</span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      <main className="flex-1">
        <header className="flex items-center justify-between border-b bg-white px-6 py-3">
          <div className="text-sm text-muted-foreground">
            🔒 Audit mode · barcha amallar yoziladi
          </div>
          <div className="flex items-center gap-3 text-sm">
            {/* TODO: user menu, 2FA status, logout */}
          </div>
        </header>
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
