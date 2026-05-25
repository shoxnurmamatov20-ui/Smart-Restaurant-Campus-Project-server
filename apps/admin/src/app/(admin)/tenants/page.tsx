export const metadata = { title: 'Universitetlar · Super Admin' };

export default function TenantsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Universitetlar (Multi-tenant)</h1>
        <p className="mt-2 text-muted-foreground">
          Tizimga ulangan universitetlar boshqaruvi
        </p>
      </header>

      {/* TODO: Tenants jadvali + yangi tenant qo'shish (multi-tenant arxitektura kerak bo'lganda) */}
      <div className="rounded-md border bg-white p-12 text-center text-muted-foreground">
        Universitetlar ro'yxati
      </div>
    </div>
  );
}
