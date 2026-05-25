export const metadata = { title: 'Kadrlar boshqaruvi · CAMPUS' };

export default function HRPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Kadrlar boshqaruv tizimi</h1>
        <p className="mt-2 text-muted-foreground">
          Xodimlar, Face ID + QR davomat, ta'til, statistika
        </p>
      </header>

      {/* TODO: Phase 1 — HR modul:
          - Xodimlar ro'yxati (DataTable)
          - Kelish-ketish jadvali
          - Ta'til/xizmat safari ariza
          - Statistik hisobotlar
      */}
      <div className="rounded-md border border-dashed p-12 text-center text-muted-foreground">
        Modul tez orada
      </div>
    </div>
  );
}
