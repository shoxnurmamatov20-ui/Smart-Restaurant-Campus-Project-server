import Link from 'next/link';

export const metadata = { title: 'Foydalanuvchilar · Super Admin' };

export default function UsersPage() {
  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Foydalanuvchilar</h1>
          <p className="mt-2 text-muted-foreground">
            Barcha rollardagi foydalanuvchilarni boshqarish
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/users/invite"
            className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-zinc-50"
          >
            📧 Taklif yuborish
          </Link>
          <Link
            href="/users/new"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            ➕ Yangi foydalanuvchi
          </Link>
        </div>
      </header>

      {/* TODO: DataTable with filters (role, status, search, last login) */}
      <div className="rounded-md border bg-white p-12 text-center text-muted-foreground">
        Foydalanuvchilar jadvali (DataTable + TanStack Table + spatie/laravel-query-builder)
      </div>
    </div>
  );
}
