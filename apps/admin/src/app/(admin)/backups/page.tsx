export const metadata = { title: 'Backups · Super Admin' };

export default function BackupsPage() {
  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Zaxira nusxalar</h1>
          <p className="mt-2 text-muted-foreground">
            Postgres + MinIO + Redis avtomatik backup (Spatie laravel-backup)
          </p>
        </div>
        <button className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-zinc-50">
          🔄 Hozir backup
        </button>
      </header>

      {/* TODO: backup ro'yxati (sana, hajm, status), restore tugmasi, schedule sozlash */}
      <div className="rounded-md border bg-white p-12 text-center text-muted-foreground">
        Backup tarixi va schedule
      </div>
    </div>
  );
}
