export const metadata = { title: 'Psixologik test · CAMPUS' };

export default function PsychologyPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Psixologik test tizimi</h1>
        <p className="mt-2 text-muted-foreground">
          Online testlar, avtomatik tahlil, psixolog kabinetii
        </p>
      </header>

      {/* TODO: Phase 1 — Psychology:
          - 100+ test (Beck, MMPI, Eysenck, Lusher)
          - Davriy testlar
          - AI tahlil
          - Anonim natijalar
          - Psixolog kabineti
          - Maxfiy chat
      */}
      <div className="rounded-md border border-dashed p-12 text-center text-muted-foreground">
        Modul tez orada
      </div>
    </div>
  );
}
