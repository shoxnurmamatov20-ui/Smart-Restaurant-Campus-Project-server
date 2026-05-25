export const metadata = { title: 'Lokalizatsiya · Super Admin' };

export default function LocalizationSettingsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Tillar va lokalizatsiya</h1>
      {/* TODO: yoqilgan tillar (uz/ru/en/qoraqalpoq), default til, tarjima inline editor */}
      <div className="rounded-md border bg-white p-12 text-center text-muted-foreground">
        Tillar va tarjima
      </div>
    </div>
  );
}
