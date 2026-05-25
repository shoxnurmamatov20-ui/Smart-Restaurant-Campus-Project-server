export const metadata = { title: 'Email sozlamalari · Super Admin' };

export default function EmailSettingsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Email (SMTP) sozlamalari</h1>
      {/* TODO: host, port, encryption, username, password, from address, test send */}
      <div className="rounded-md border bg-white p-12 text-center text-muted-foreground">
        SMTP konfiguratsiya
      </div>
    </div>
  );
}
