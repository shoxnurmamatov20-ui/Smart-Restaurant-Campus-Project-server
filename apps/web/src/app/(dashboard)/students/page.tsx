export const metadata = { title: 'Talabalar · CAMPUS' };

export default function StudentsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Talabalar boshqaruv tizimi</h1>
        <p className="mt-2 text-muted-foreground">
          HEMIS integratsiya, elektron jurnal, davomat, akademik monitoring
        </p>
      </header>

      {/* TODO: Phase 1 — Students:
          - Talaba ro'yxati (HEMIS sync)
          - Shaxsiy kabinet
          - Davomat / baholar
          - Akademik tarix
          - Online murojaatlar
      */}
      <div className="rounded-md border border-dashed p-12 text-center text-muted-foreground">
        Modul tez orada
      </div>
    </div>
  );
}
