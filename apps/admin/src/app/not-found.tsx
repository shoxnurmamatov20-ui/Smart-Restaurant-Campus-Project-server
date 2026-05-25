import Link from 'next/link';

export default function AdminNotFoundPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-4">
      <div className="w-full max-w-md space-y-6 rounded-lg border bg-white p-8 text-center shadow">
        <div className="text-7xl font-bold text-muted-foreground">404</div>
        <h1 className="text-2xl font-bold">Admin sahifa topilmadi</h1>
        <p className="text-sm text-muted-foreground">
          Siz qidirayotgan admin bo'limi mavjud emas.
        </p>
        <Link
          href="/dashboard"
          className="inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Admin Dashboard
        </Link>
      </div>
    </div>
  );
}
