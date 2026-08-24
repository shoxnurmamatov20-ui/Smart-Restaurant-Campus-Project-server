'use client';

import type { Messages } from '@/i18n';

/**
 * The keyboard, listed — `FOUNDATIONS §11`.
 *
 * A till is a tablet and it is also, on most counters in this market, a tablet
 * with a keyboard wedge or a small USB keypad beside it. The design lists nine
 * shortcuts and the build bound none of them, so the fastest way to ring an
 * order in was always the slowest input the hardware has.
 *
 * The sheet exists because a shortcut nobody can find is a shortcut nobody
 * uses. `?` opens it, which is the one binding somebody discovers by accident.
 *
 * **The rows are the caller's.** The design draws one sheet with a group per
 * surface — till, KDS, global — and `?` is global: it opens wherever you are and
 * lists what that screen answers to. This used to build the till's rows itself,
 * so the kitchen display had five working shortcuts and no way to find out. Each
 * surface passes its own groups now; the labels live with the screen that owns
 * the keys.
 */

export type ShortcutGroup = {
  title: string;
  rows: readonly { what: string; keys: string }[];
};

/** The till's own two groups, built from its catalogue. */
export function tillShortcuts(m: Messages['console']['pos']): readonly ShortcutGroup[] {
  return [
    {
      title: m.scTill,
      rows: [
        { what: m.scPick, keys: '1 – 9' },
        { what: m.scSend, keys: '↵' },
        { what: m.scPay, keys: 'P' },
        { what: m.scPlus, keys: '+' },
        { what: m.scMinus, keys: '− / ⌫' },
      ],
    },
    {
      title: m.scGlobal,
      rows: [
        { what: m.scHelp, keys: '?' },
        { what: m.scClose, keys: 'Esc' },
        { what: m.scFloor, keys: 'B' },
        { what: m.scKitchen, keys: 'K' },
      ],
    },
  ];
}

export function ShortcutsSheet({
  title,
  closeLabel,
  groups,
  onClose,
}: {
  title: string;
  closeLabel: string;
  groups: readonly ShortcutGroup[];
  onClose: () => void;
}) {
  const GROUPS = groups;

  return (
    <div
      data-fade
      className="fixed inset-0 z-[70] flex items-center justify-center p-6"
      style={{ background: 'rgba(15,19,32,.45)' }}
      onClick={onClose}
      role="presentation"
    >
      <div
        data-sheet
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        className="bg-surface w-full max-w-[520px] rounded-[18px] p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-display text-xl font-semibold tracking-tight">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="border-border grid h-10 w-10 place-items-center rounded-md border text-lg"
          >
            ×
          </button>
        </div>

        {GROUPS.map((group) => (
          <section key={group.title} className="mt-5">
            <h4 className="text-2xs tracking-caps text-fg-subtle font-semibold uppercase">
              {group.title}
            </h4>

            <dl className="mt-2">
              {group.rows.map((row) => (
                <div
                  key={row.keys}
                  className="border-divider flex items-center justify-between gap-4 border-b py-2.5 last:border-0"
                >
                  <dt className="text-sm">{row.what}</dt>
                  <dd>
                    <kbd className="border-border bg-bg-subtle rounded-sm border px-2 py-1 font-sans text-xs font-semibold">
                      {row.keys}
                    </kbd>
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </div>
  );
}
