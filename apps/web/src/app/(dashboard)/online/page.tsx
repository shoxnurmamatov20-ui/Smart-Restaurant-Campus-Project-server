export const metadata = { title: 'Online platforma · CAMPUS' };

export default function OnlinePage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Online ta'lim platformasi (5–6 kurs)</h1>
        <p className="mt-2 text-muted-foreground">
          Live darslar, video konferensiya, dars monitoringi
        </p>
      </header>

      {/* TODO: Phase 1 — Online:
          - Dars jadvali
          - Live video qatnashish
          - Yozib olingan darslar arxivi
          - Davomat (face ID + activity)
          - Materiallar
      */}
      <div className="rounded-md border border-dashed p-12 text-center text-muted-foreground">
        Modul tez orada
      </div>
    </div>
  );
}
