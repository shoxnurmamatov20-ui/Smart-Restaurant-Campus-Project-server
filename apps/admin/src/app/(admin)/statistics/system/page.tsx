export const metadata = { title: 'Tizim resurslari · Super Admin' };

export default function SystemStatsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Tizim resurslari</h1>
      {/* TODO: CPU, RAM, disk, network — Prometheus API'dan */}
      <div className="rounded-md border bg-white p-12 text-center text-muted-foreground">
        Server health metrics
      </div>
    </div>
  );
}
