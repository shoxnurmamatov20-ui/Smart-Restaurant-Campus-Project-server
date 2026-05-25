import Link from 'next/link';

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="text-7xl font-bold text-muted-foreground">404</div>
        <h1 className="text-2xl font-bold">Sahifa topilmadi</h1>
        <p className="text-sm text-muted-foreground">
          Siz qidirayotgan sahifa mavjud emas yoki ko'chirilgan.
        </p>
        <Link
          href="/"
          className="inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Bosh sahifaga qaytish
        </Link>
      </div>
    </div>
  );
}
