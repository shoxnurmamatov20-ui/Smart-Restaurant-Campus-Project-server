export const metadata = { title: 'Telegram analytics · Super Admin' };

export default function TelegramAnalyticsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Telegram analytics</h1>
        <p className="mt-2 text-muted-foreground">
          Botlar bo'yicha umumiy statistika: xabarlar, komandalar, faollik
        </p>
      </header>

      <div className="grid gap-3 md:grid-cols-4">
        <Stat label="Faol foydalanuvchilar (24h)" value="—" />
        <Stat label="Xabar (24h)" value="—" />
        <Stat label="Eng faol bot" value="—" />
        <Stat label="Xato darajasi" value="—" />
      </div>

      <div className="rounded-md border bg-white p-12 text-center text-muted-foreground">
        Real-time charts (Recharts) + bot bo'yicha drilldown
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-white p-4">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}
