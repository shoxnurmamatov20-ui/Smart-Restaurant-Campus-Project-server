export const metadata = { title: 'Test tizimi · CAMPUS' };

export default function ExamsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Fanlar bo'yicha test tizimi</h1>
        <p className="mt-2 text-muted-foreground">
          Online imtihonlar, anti-cheat (webcam + AI proktoring), apellyatsiya
        </p>
      </header>

      {/* TODO: Phase 1 — Exams:
          - Test bazasi (10K+ savol)
          - Imtihon topshirish
          - Live proktoring (webcam + AI)
          - Natijalar
          - Apellyatsiya
          - Olimpiada rejimi
      */}
      <div className="rounded-md border border-dashed p-12 text-center text-muted-foreground">
        Modul tez orada
      </div>
    </div>
  );
}
