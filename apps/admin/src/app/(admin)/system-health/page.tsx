export const metadata = { title: 'Tizim salomatligi · Super Admin' };

const SERVICES = [
  { name: 'PostgreSQL', port: 5432, status: 'unknown' },
  { name: 'Redis', port: 6379, status: 'unknown' },
  { name: 'ClickHouse', port: 8123, status: 'unknown' },
  { name: 'MinIO', port: 9000, status: 'unknown' },
  { name: 'Meilisearch', port: 7700, status: 'unknown' },
  { name: 'Keycloak', port: 8090, status: 'unknown' },
  { name: 'Laravel Reverb (WS)', port: 8080, status: 'unknown' },
  { name: 'AI Services', port: 8001, status: 'unknown' },
];

export default function SystemHealthPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Tizim salomatligi</h1>
        <p className="mt-2 text-muted-foreground">
          Real-time servislar holati (Prometheus + Loki)
        </p>
      </header>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        {SERVICES.map((s) => (
          <div key={s.name} className="rounded-md border bg-white p-4">
            <div className="flex items-center justify-between">
              <p className="font-medium">{s.name}</p>
              <span className="h-2 w-2 rounded-full bg-zinc-300" title={s.status} />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Port: {s.port}</p>
          </div>
        ))}
      </div>

      {/* TODO: real status via /api/v1/admin/health/services, latency graphs */}
    </div>
  );
}
