export const metadata = { title: 'API kalitlari · Super Admin' };

export default function ApiKeysPage() {
  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">API kalitlari</h1>
          <p className="mt-2 text-muted-foreground">
            Tashqi tizimlar uchun API tokenlar (Laravel Sanctum personal access tokens)
          </p>
        </div>
        <button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
          ➕ Yangi kalit
        </button>
      </header>

      {/* TODO: kalitlar jadvali, scope, last used, revoke */}
      <div className="rounded-md border bg-white p-12 text-center text-muted-foreground">
        API kalitlar ro'yxati
      </div>
    </div>
  );
}
