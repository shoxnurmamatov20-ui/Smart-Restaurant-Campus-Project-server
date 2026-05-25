export const metadata = { title: 'Xabarnomalar · Super Admin' };

export default function NotificationsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Broadcast xabarnomalar</h1>
        <p className="mt-2 text-muted-foreground">
          Foydalanuvchilarga umumiy xabar yuborish (Push + SMS + Email + Telegram)
        </p>
      </header>

      {/* TODO: Yangi e'lon formasi (sarlavha, matn, target audience, kanal), tarix */}
      <div className="rounded-md border bg-white p-12 text-center text-muted-foreground">
        Xabarnomalar konstruktori
      </div>
    </div>
  );
}
