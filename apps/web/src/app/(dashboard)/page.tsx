export default function DashboardHomePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Xush kelibsiz, CAMPUS!</h1>
        <p className="mt-2 text-muted-foreground">
          Universitetning yagona raqamli ekotizimi.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-lg border bg-card p-6">
          <h2 className="font-semibold">Talabalar</h2>
          <p className="mt-2 text-3xl font-bold">—</p>
          <p className="text-sm text-muted-foreground">Jami aktiv</p>
        </div>
        <div className="rounded-lg border bg-card p-6">
          <h2 className="font-semibold">Bugungi darslar</h2>
          <p className="mt-2 text-3xl font-bold">—</p>
        </div>
        <div className="rounded-lg border bg-card p-6">
          <h2 className="font-semibold">Online foydalanuvchilar</h2>
          <p className="mt-2 text-3xl font-bold">—</p>
        </div>
      </div>

      {/* TODO: real widgets via TanStack Query + @campus/sdk */}
    </div>
  );
}
