export const metadata = { title: 'Xavfsizlik markazi · Super Admin' };

export default function SecurityPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Xavfsizlik markazi</h1>
        <p className="mt-2 text-muted-foreground">
          Failed logins, shubhali harakatlar, IP allowlist, faol sessions
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-md border bg-white p-5">
          <p className="text-xs uppercase text-muted-foreground">Failed logins (24h)</p>
          <p className="mt-1 text-2xl font-bold">—</p>
        </div>
        <div className="rounded-md border bg-white p-5">
          <p className="text-xs uppercase text-muted-foreground">Shubhali IP'lar</p>
          <p className="mt-1 text-2xl font-bold">—</p>
        </div>
        <div className="rounded-md border bg-white p-5">
          <p className="text-xs uppercase text-muted-foreground">Faol sessions</p>
          <p className="mt-1 text-2xl font-bold">—</p>
        </div>
        <div className="rounded-md border bg-white p-5">
          <p className="text-xs uppercase text-muted-foreground">2FA yoqilgan adminlar</p>
          <p className="mt-1 text-2xl font-bold">—</p>
        </div>
      </div>

      {/* TODO: tabs: failed-logins / suspicious / ip-allowlist / sessions */}
    </div>
  );
}
