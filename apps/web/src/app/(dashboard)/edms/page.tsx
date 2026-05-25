export const metadata = { title: 'Hujjat aylanishi · CAMPUS' };

export default function EDMSPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Elektron hujjat aylanish tizimi</h1>
        <p className="mt-2 text-muted-foreground">
          E-ariza, buyruqlar, E-IMZO, QR tasdiqlash, arxiv
        </p>
      </header>

      {/* TODO: Phase 1 — EDMS:
          - Yangi ariza yaratish
          - Mening arizalarim
          - Tasdiqlash kutmoqda (workflow)
          - Arxiv (qidiruv)
          - QR-kod orqali tekshirish
      */}
      <div className="rounded-md border border-dashed p-12 text-center text-muted-foreground">
        Modul tez orada
      </div>
    </div>
  );
}
