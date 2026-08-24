'use client';

/**
 * The only client code on this surface.
 *
 * Everything else — the switcher, all seven documents, the paper decision — is
 * server-rendered: the switcher is links carrying `?d=`, so a chosen document
 * is a place that survives a refresh and can be sent to somebody, which is
 * exactly what the entry points in the till and the store room rely on.
 *
 * Printing is the one thing a URL cannot express. `window.print()` opens the
 * browser's own dialogue, which is right rather than merely easy: the reader
 * picks the printer, and on this surface that choice is real — an 80 mm roll
 * on the till and an A4 tray in the office are two different machines, and no
 * page can know which one is loaded.
 */
export function PrintButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      data-press
      onClick={() => window.print()}
      className="bg-brand-500 hover:bg-brand-600 h-9 flex-none rounded-md px-3.5 text-sm font-semibold whitespace-nowrap text-white"
    >
      {label}
    </button>
  );
}
