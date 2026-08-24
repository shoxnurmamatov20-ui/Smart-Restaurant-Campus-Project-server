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
    <div className="bg-background flex min-h-dvh items-center justify-center p-4">
      <div className="bg-card w-full max-w-md space-y-6 rounded-lg border p-8 text-center shadow">
        {/*
          A stroked triangle, not ⚠️. `FOUNDATIONS §8`: no emoji in product UI —
          the Telegram bot is the single exception, and a check of all fourteen
          design files finds them in exactly one file, the Telegram one. An emoji
          also renders as a different picture on every platform, which is the
          opposite of what an error state wants.
        */}
        <svg
          width="40"
          height="40"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-warning-600 mx-auto"
          aria-hidden
        >
          <path d="M10.3 3.6 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.6a2 2 0 0 0-3.4 0Z" />
          <path d="M12 9v4M12 17h.01" />
        </svg>
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
