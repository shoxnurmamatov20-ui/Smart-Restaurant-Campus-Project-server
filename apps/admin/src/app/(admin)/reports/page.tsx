export const metadata = { title: 'Hisobotlar · Super Admin' };

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Hisobotlar generatsiyasi</h1>
        <p className="mt-2 text-muted-foreground">
          Excel/PDF eksport (maatwebsite/excel + barryvdh/laravel-dompdf)
        </p>
      </header>

      {/* TODO: shabloniyalar (talaba ro'yxati, davomat, KPI, va h.k.), scheduling */}
      <div className="rounded-md border bg-white p-12 text-center text-muted-foreground">
        Hisobot shabloniyalari
      </div>
    </div>
  );
}
