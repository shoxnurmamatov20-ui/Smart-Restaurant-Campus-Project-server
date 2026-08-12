import Link from 'next/link';

export default function AdminNotFoundPage() {
  return (
    <div className="bg-background flex min-h-screen items-center justify-center p-4">
      <div className="bg-card w-full max-w-md space-y-6 rounded-lg border p-8 text-center shadow">
        <div className="text-muted-foreground text-7xl font-bold">404</div>
        <h1 className="text-2xl font-bold">Admin sahifa topilmadi</h1>
        <p className="text-muted-foreground text-sm">
          Siz qidirayotgan admin bo&apos;limi mavjud emas.
        </p>
        <Link
          href="/dashboard"
          className="bg-primary text-primary-foreground inline-block rounded-md px-4 py-2 text-sm font-medium hover:opacity-90"
        >
          Admin Dashboard
        </Link>
      </div>
    </div>
  );
}
