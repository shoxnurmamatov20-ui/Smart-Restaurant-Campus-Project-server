export const metadata = { title: 'RTTM · CAMPUS' };

export default function RTTMPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">RTTM — IT inventarizatsiya</h1>
        <p className="mt-2 text-muted-foreground">
          Kompyuter texnikalari hisoboti, remont, inventarizatsiya
        </p>
      </header>

      {/* TODO: Phase 1 — RTTM:
          - Texnika reestri (QR/barcode)
          - Joylashuv xaritasi
          - Remont so'rovlari (ticket)
          - Yillik inventarizatsiya
          - Litsenziya muddatlari
      */}
      <div className="rounded-md border border-dashed p-12 text-center text-muted-foreground">
        Modul tez orada
      </div>
    </div>
  );
}
