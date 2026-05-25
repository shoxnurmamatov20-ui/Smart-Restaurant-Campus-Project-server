'use client';

import { useEffect } from 'react';

export default function AdminErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[ADMIN ERROR]', error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-4">
      <div className="w-full max-w-md space-y-6 rounded-lg border bg-white p-8 text-center shadow">
        <div className="text-6xl">🛑</div>
        <h1 className="text-2xl font-bold">Admin panel xatosi</h1>
        <p className="text-sm text-muted-foreground">
          {error.message || 'Kutilmagan xatolik. IT bo\'limga xabar berildi.'}
        </p>
        {error.digest && (
          <p className="text-xs font-mono text-muted-foreground">
            Error ID: {error.digest}
          </p>
        )}
        <div className="flex justify-center gap-2">
          <button
            onClick={reset}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Qaytadan urinish
          </button>
        </div>
      </div>
    </div>
  );
}
