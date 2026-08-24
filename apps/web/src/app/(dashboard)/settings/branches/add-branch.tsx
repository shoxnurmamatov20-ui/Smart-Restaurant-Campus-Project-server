'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { flash } from '@restaurant/ui';

import { post } from '@/lib/console-post';

/**
 * Opening a venue, from the console rather than from the platform.
 *
 * This was a `PendingAction` whose note sent the reader to the platform console
 * — and that was never true. `POST /api/v1/branches` is core, has existed since
 * the foundation alongside the branch scope every module reads, and is gated by
 * `branches.manage`, which the RBAC seeder gives the owner. Nothing had to be
 * built on the server; the console simply never asked.
 *
 * **One field.** `StoreBranchRequest` wants a name and a slug, and the slug is
 * derived in the route handler because a manager typing "Chilonzor" should not
 * also have to invent `chilonzor` and keep the two in step. Everything else a
 * branch has — its city, address, hours, monthly target — is edited on the
 * branch once it exists. Asking for nine fields before a venue has a name is a
 * form nobody finishes, and eight of them are nullable in the migration for
 * exactly that reason.
 *
 * **No toast on success.** The row appears in the table underneath, which says
 * more than a sentence does; the failure path is the one that needs words,
 * because the two things that go wrong here — a duplicate name and a role
 * without `branches.manage` — are both refusals the API explains in the
 * reader's own language.
 */
export function AddBranch({
  label,
  field,
  offline,
  className,
}: {
  /** The button, and the form's own label — `console.branches.add`. */
  label: string;
  /** What the one input is asking for — `console.branches.colBranch`. */
  field: string;
  /** Shown when the request never reached the API — `console.shell.offline`. */
  offline: string;
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (): Promise<void> => {
    const wanted = name.trim();

    if (wanted.length < 2) return;

    setSaving(true);
    const answer = await post('/api/branches', { name: wanted });
    setSaving(false);

    if (!answer.ok) {
      flash.problem(answer.message ?? offline);
      return;
    }

    setName('');
    setOpen(false);
    router.refresh();
  };

  return (
    <span className="flex items-center gap-2">
      {open ? (
        <input
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void submit();
            if (event.key === 'Escape') setOpen(false);
          }}
          placeholder={field}
          aria-label={field}
          className="border-border-strong bg-surface text-fg h-9 w-[200px] rounded-md border px-3 text-sm font-medium"
        />
      ) : null}

      <button
        type="button"
        disabled={saving}
        onClick={() => (open ? void submit() : setOpen(true))}
        className={className}
      >
        {label}
      </button>
    </span>
  );
}
