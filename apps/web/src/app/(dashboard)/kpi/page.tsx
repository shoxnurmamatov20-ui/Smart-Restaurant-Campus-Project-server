export const metadata = { title: 'KPI · CAMPUS' };

export default function KPIPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Shaffof KPI tizimi</h1>
        <p className="mt-2 text-muted-foreground">
          Avtomatik KPI hisoblash, reyting, real-time analitika (ClickHouse)
        </p>
      </header>

      {/* TODO: Phase 1 — KPI:
          - O'qituvchi reytingi
          - Kafedra/Fakultet reyting
          - OKR maqsadlar
          - 360-graduslik baholash
          - Bonuslar (Moliya bilan integratsiya)
          - Vizual dashboardlar (Recharts)
      */}
      <div className="rounded-md border border-dashed p-12 text-center text-muted-foreground">
        Modul tez orada
      </div>
    </div>
  );
}
