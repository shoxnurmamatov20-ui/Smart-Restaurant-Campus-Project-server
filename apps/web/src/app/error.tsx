'use client';

import Link from 'next/link';
import { useEffect } from 'react';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // TODO: Sentry.captureException(error)
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="text-6xl">⚠️</div>
        <h1 className="text-2xl font-bold">Xatolik yuz berdi</h1>
        <p className="text-muted-foreground text-sm">
          {error.message || "Kutilmagan xatolik. Iltimos, qaytadan urinib ko'ring."}
        </p>
        {error.digest && (
          <p className="text-muted-foreground font-mono text-xs">ID: {error.digest}</p>
        )}
        <div className="flex justify-center gap-2">
          <button
            onClick={reset}
            className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-4 py-2 text-sm font-medium"
          >
            Qaytadan urinish
          </button>
          <Link
            href="/"
            className="hover:bg-accent rounded-md border px-4 py-2 text-sm font-medium"
          >
            Bosh sahifa
          </Link>
        </div>
      </div>
    </div>
  );
}
