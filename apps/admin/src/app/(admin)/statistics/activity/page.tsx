export const metadata = { title: 'Faollik statistikasi · Super Admin' };

export default function ActivityStatsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Faollik analitikasi</h1>
      {/* TODO: API calls, login attempts, peak hours, geographic distribution */}
      <div className="rounded-md border bg-white p-12 text-center text-muted-foreground">
        Faollik dashboard
      </div>
    </div>
  );
}
