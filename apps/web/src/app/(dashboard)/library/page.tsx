export const metadata = { title: 'Kutubxona · CAMPUS' };

export default function LibraryPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Elektron kutubxona</h1>
        <p className="mt-2 text-muted-foreground">
          50,000+ kitob, QR orqali olish/qaytarish, online o'qish, AI tavsiyalar
        </p>
      </header>

      {/* TODO: Phase 1 — Library:
          - Kitoblar bazasi (Meilisearch qidiruv)
          - Online o'qish (PDF.js, EPUB)
          - QR orqali jismoniy olish
          - Reservation
          - Reyting va sharhlar
          - AI tavsiyalar
      */}
      <div className="rounded-md border border-dashed p-12 text-center text-muted-foreground">
        Modul tez orada
      </div>
    </div>
  );
}
