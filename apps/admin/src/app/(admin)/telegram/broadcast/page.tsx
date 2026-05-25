export const metadata = { title: 'Telegram broadcast · Super Admin' };

export default function TelegramBroadcastPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Telegram broadcast</h1>
        <p className="mt-2 text-muted-foreground">
          Tanlangan bot orqali ko'p foydalanuvchiga bir vaqtning o'zida xabar yuborish
        </p>
      </header>

      <div className="rounded-md border bg-white p-6">
        {/* TODO: implement form — bot selector, audience filter (role/group/faculty), HTML preview, schedule, throttle */}
        <p className="text-sm text-muted-foreground">
          Forma: bot tanlash → auditoriya filtr (rol/guruh/fakultet) → xabar matni (HTML) →
          eslatma vaqti → throttle (xabarlar/sekund) → testdan o'tkazish → yuborish.
        </p>
      </div>
    </div>
  );
}
