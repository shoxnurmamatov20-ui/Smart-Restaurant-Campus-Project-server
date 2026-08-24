'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import { flash } from '@restaurant/ui';

import { post } from '@/lib/console-post';

import { ACTION_PRIMARY } from '../screen';
import { POSITIONS } from './staff-data';

/**
 * Hiring somebody, from the screen that lists them.
 *
 * The button here used to be an `ActionButton` — a control that flashes a
 * message and calls nothing. On the demo console, where eight people are
 * already listed, that reads as a screen not yet finished; on a real
 * restaurant's first day, where the table is empty and the button is the only
 * thing on it, it reads as a product that does not work. It was the first
 * thing the first real owner tried.
 *
 * Four fields, and no more: a name, a job, a phone if there is one, and a
 * venue when there is a choice. The employee code is allocated by the API,
 * the status defaults to active, and the rota is a different screen. A form
 * that asked for everything the table can hold would be a form nobody
 * finishes.
 */

export type BranchOption = { id: string; name: string };

const FIELD =
  'border-border-strong bg-surface text-fg h-9 rounded-md border px-3 text-sm font-medium';

export function AddStaff({
  labels,
  branches,
}: {
  /** `console.staff`, the keys this sheet uses. */
  labels: Record<string, string>;
  /** The venues this person may hire into; empty means none has been opened. */
  branches: readonly BranchOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [position, setPosition] = useState('waiter');
  const [phone, setPhone] = useState('');
  const [branchId, setBranchId] = useState(branches[0]?.id ?? '');
  const [saving, setSaving] = useState(false);
  /*
   * The PIN of the person just hired, held until the manager dismisses it.
   *
   * Not in the toast: a toast lives 2.8 seconds and the server keeps only a
   * hash, so a PIN that went past in a toast is a PIN nobody has. It sits
   * beside the button instead, for as long as it takes to read out, and one
   * press clears it — the same once-only discipline as the pairing code.
   */
  const [justHired, setJustHired] = useState<{ name: string; code: string; pin: string } | null>(
    null,
  );

  const ready = first.trim().length >= 2 && last.trim().length >= 2 && !saving;

  /*
   * A restaurant with no venue cannot hire: `branch_id` is on every shift,
   * every attendance row and every till. Rather than let the form fail
   * upstream, the button says what to do and links to the screen that does
   * it — which is the state a brand-new restaurant is in on its first
   * morning.
   */
  if (branches.length === 0) {
    return (
      <Link href="/settings/branches" className={ACTION_PRIMARY} title={labels.hire_needBranch}>
        {labels.hire_openBranches}
      </Link>
    );
  }

  const submit = async (): Promise<void> => {
    if (!ready) return;

    setSaving(true);

    const answer = await post<{ pin: string; data: { first_name: string; employee_code: string } }>(
      '/api/staff/members',
      {
        firstName: first.trim(),
        lastName: last.trim(),
        position,
        phone: phone.trim(),
        branchId: branches.length > 1 ? branchId : (branches[0]?.id ?? ''),
      },
    );

    setSaving(false);

    if (!answer.ok) {
      flash.problem(answer.message ?? labels.hire_failed);
      return;
    }

    /*
     * The PIN rides in the same sentence as the employee code, because both
     * are shown exactly once: the server keeps only a hash, and the manager
     * reads the two numbers to the person in front of them. A forgotten PIN
     * is a "new PIN" press on the row, not a lookup.
     */
    flash(
      (labels.hire_done ?? '')
        .replace('{name}', answer.data.data.first_name)
        .replace('{code}', answer.data.data.employee_code),
    );

    setJustHired({
      name: answer.data.data.first_name,
      code: answer.data.data.employee_code,
      pin: answer.data.pin,
    });

    setFirst('');
    setLast('');
    setPhone('');
    setOpen(false);
    router.refresh();
  };

  if (!open) {
    return (
      <>
        {justHired === null ? null : (
          <span
            role="status"
            className="bg-brand-50 text-brand-700 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 rounded-md px-2.5 py-1 text-xs font-semibold"
          >
            <span className="truncate">
              {justHired.name} · {justHired.code}
            </span>
            <span data-num className="font-display text-base font-bold tracking-[0.08em]">
              PIN {justHired.pin}
            </span>
            <span className="text-brand-600 text-2xs font-medium">{labels.pair_pinOnce}</span>
            <button
              type="button"
              onClick={() => setJustHired(null)}
              aria-label={labels.hire_cancel}
              className="text-brand-600 hover:text-brand-700 -mr-1 grid size-6 place-items-center rounded"
            >
              ×
            </button>
          </span>
        )}
        <button type="button" data-press onClick={() => setOpen(true)} className={ACTION_PRIMARY}>
          {labels.add}
        </button>
      </>
    );
  }

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <input
        autoFocus
        value={first}
        onChange={(event) => setFirst(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false);
        }}
        placeholder={labels.hire_first}
        aria-label={labels.hire_first}
        className={`${FIELD} w-[120px]`}
      />
      <input
        value={last}
        onChange={(event) => setLast(event.target.value)}
        placeholder={labels.hire_last}
        aria-label={labels.hire_last}
        className={`${FIELD} w-[140px]`}
      />
      <select
        value={position}
        onChange={(event) => setPosition(event.target.value)}
        aria-label={labels.hire_position}
        className={`${FIELD} w-[150px]`}
      >
        {POSITIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {labels[option.label]}
          </option>
        ))}
      </select>
      <input
        value={phone}
        onChange={(event) => setPhone(event.target.value)}
        placeholder={labels.hire_phone}
        aria-label={labels.hire_phone}
        inputMode="tel"
        className={`${FIELD} w-[160px]`}
      />
      {branches.length > 1 ? (
        <select
          value={branchId}
          onChange={(event) => setBranchId(event.target.value)}
          aria-label={labels.hire_branch}
          className={`${FIELD} w-[150px]`}
        >
          {branches.map((branch) => (
            <option key={branch.id} value={branch.id}>
              {branch.name}
            </option>
          ))}
        </select>
      ) : null}
      <button type="submit" data-press disabled={!ready} className={ACTION_PRIMARY}>
        {labels.hire_save}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="text-fg-muted hover:text-fg h-9 px-2 text-sm font-medium"
      >
        {labels.hire_cancel}
      </button>
    </form>
  );
}
