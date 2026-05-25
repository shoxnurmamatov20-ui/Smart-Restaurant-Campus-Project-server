export const metadata = { title: 'Audit log · Super Admin' };

export default function AuditPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Audit log</h1>
        <p className="mt-2 text-muted-foreground">
          Barcha admin amallar tarixi (immutable, Spatie ActivityLog)
        </p>
      </header>

      {/* TODO: filterlangan jadval — user, amal, sana, IP. Faqat o'qish. */}
      <div className="rounded-md border bg-white p-12 text-center text-muted-foreground">
        Audit log jadvali
      </div>
    </div>
  );
}
