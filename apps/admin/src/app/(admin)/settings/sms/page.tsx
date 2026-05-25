export const metadata = { title: 'SMS sozlamalari · Super Admin' };

export default function SmsSettingsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">SMS (Eskiz) sozlamalari</h1>
      {/* TODO: Eskiz API token, from, test send, hisob balansi */}
      <div className="rounded-md border bg-white p-12 text-center text-muted-foreground">
        Eskiz API konfiguratsiya
      </div>
    </div>
  );
}
