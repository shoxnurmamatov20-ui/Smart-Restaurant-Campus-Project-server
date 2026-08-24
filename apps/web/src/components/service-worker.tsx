'use client';

import { useEffect } from 'react';

/**
 * Registering the worker, and the three conditions on doing so.
 *
 * **Production only.** A service worker in development serves yesterday's
 * bundle from a cache and makes every change look like it did not apply — the
 * single most common way a day is lost to a PWA.
 *
 * **After load.** Registration competes with the page's own requests for the
 * connection it is trying to make faster, and on the networks this exists for
 * that is the wrong trade. `load` has already fired by then in most cases; the
 * check covers the one where it has not.
 *
 * **Never blocking.** A browser without service workers, a private window that
 * refuses, an insecure origin — all answer by doing nothing. The application
 * works identically without it; what is lost is the install prompt and the
 * offline page.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    const register = () => {
      void navigator.serviceWorker.register('/sw.js').catch(() => {
        // A refusal is not a failure worth showing anybody: the page works.
      });
    };

    if (document.readyState === 'complete') {
      register();

      return;
    }

    window.addEventListener('load', register);

    return () => window.removeEventListener('load', register);
  }, []);

  return null;
}
