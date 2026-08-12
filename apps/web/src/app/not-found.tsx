import Link from 'next/link';

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="text-muted-foreground text-7xl font-bold">404</div>
        <h1 className="text-2xl font-bold">Sahifa topilmadi</h1>
        <p className="text-muted-foreground text-sm">
          Siz qidirayotgan sahifa mavjud emas yoki ko&apos;chirilgan.
        </p>
        <Link
          href="/"
          className="bg-primary text-primary-foreground hover:bg-primary/90 inline-block rounded-md px-4 py-2 text-sm font-medium"
        >
          Bosh sahifaga qaytish
        </Link>
      </div>
    </div>
  );
}
