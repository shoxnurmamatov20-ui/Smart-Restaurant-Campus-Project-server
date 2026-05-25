export const metadata = { title: 'Modullar · Super Admin' };

const MODULES = [
  { key: 'hr', name: 'HR — Kadrlar', enabled: true },
  { key: 'students', name: 'Talabalar', enabled: true },
  { key: 'online', name: 'Online platforma', enabled: true },
  { key: 'edms', name: 'EDMS — Hujjat aylanishi', enabled: true },
  { key: 'rttm', name: 'RTTM — IT inventarizatsiya', enabled: true },
  { key: 'psychology', name: 'Psixologik test', enabled: true },
  { key: 'exams', name: 'Fanlar test tizimi', enabled: true },
  { key: 'library', name: 'Elektron kutubxona', enabled: true },
  { key: 'media', name: 'Media DAM', enabled: true },
  { key: 'kpi', name: 'KPI', enabled: true },
];

export default function ModulesPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Modullar boshqaruvi</h1>
        <p className="mt-2 text-muted-foreground">Modullarni yoqish/o'chirish, har birining sozlamalari</p>
      </header>

      <div className="grid gap-3 md:grid-cols-2">
        {MODULES.map((m) => (
          <div key={m.key} className="flex items-center justify-between rounded-md border bg-white p-4">
            <div>
              <p className="font-medium">{m.name}</p>
              <p className="text-xs text-muted-foreground">key: {m.key}</p>
            </div>
            <label className="inline-flex cursor-pointer items-center">
              <input type="checkbox" defaultChecked={m.enabled} className="h-4 w-4" />
              <span className="ml-2 text-sm">{m.enabled ? 'Yoqilgan' : "O'chirilgan"}</span>
            </label>
          </div>
        ))}
      </div>

      {/* TODO: real toggle saved via API, audit log */}
    </div>
  );
}
