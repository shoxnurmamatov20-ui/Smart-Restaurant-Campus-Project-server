export const metadata = { title: 'Media · CAMPUS' };

export default function MediaPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Media boshqaruv (DAM)</h1>
        <p className="mt-2 text-muted-foreground">
          Rasm/video arxivi, cloud saqlash (MinIO), AI orqali avtomatik teglar
        </p>
      </header>

      {/* TODO: Phase 1 — Media:
          - Yuklash (drag & drop)
          - Gallereya (grid)
          - AI auto-tagging
          - Yuz tanish bo'yicha qidiruv
          - Tadbirlar bo'yicha to'plamlar
          - Universitet sayti uchun API
      */}
      <div className="rounded-md border border-dashed p-12 text-center text-muted-foreground">
        Modul tez orada
      </div>
    </div>
  );
}
