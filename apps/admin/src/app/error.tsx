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
    <div className="bg-background flex min-h-screen items-center justify-center p-4">
      <div className="bg-card w-full max-w-md space-y-6 rounded-lg border p-8 text-center shadow">
        <div className="text-6xl">🛑</div>
        <h1 className="text-2xl font-bold">Admin panel xatosi</h1>
        <p className="text-muted-foreground text-sm">
          {error.message || "Kutilmagan xatolik. IT bo'limga xabar berildi."}
        </p>
        {error.digest && (
          <p className="text-muted-foreground font-mono text-xs">Error ID: {error.digest}</p>
        )}
        <div className="flex justify-center gap-2">
          <button
            onClick={reset}
            className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:opacity-90"
          >
            Qaytadan urinish
          </button>
        </div>
      </div>
    </div>
  );
}
