import Link from 'next/link';

export const metadata = { title: 'Sozlamalar · Super Admin' };

const SECTIONS = [
  { href: '/settings', label: 'Umumiy', icon: '⚙️' },
  { href: '/settings/email', label: 'Email (SMTP)', icon: '📧' },
  { href: '/settings/sms', label: 'SMS (Eskiz)', icon: '📱' },
  { href: '/settings/localization', label: 'Tillar / Lokalizatsiya', icon: '🌐' },
];

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Tizim sozlamalari</h1>
      </header>

      <nav className="flex gap-1 border-b">
        {SECTIONS.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="border-b-2 border-transparent px-4 py-2 text-sm hover:border-zinc-300"
          >
            {s.icon} {s.label}
          </Link>
        ))}
      </nav>

      {/* TODO: Umumiy sozlamalar — app name, logo, theme, default locale */}
      <div className="rounded-md border bg-white p-12 text-center text-muted-foreground">
        Umumiy sozlamalar
      </div>
    </div>
  );
}
