'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { flash } from '@restaurant/ui';

import { post } from '@/lib/console-post';

/**
 * The invite — a name, an address, and the password the API minted, shown
 * once.
 *
 * This was a `PendingAction`: a button whose whole behaviour was a note
 * saying invites were not wired yet, while `POST /api/v1/platform/team` had
 * been on the router all along. The password is shown here and only here,
 * because the platform sends no mail yet; the person inviting reads it out
 * to the person invited, who then enrols a second factor with
 * `admin:two-factor` before the account can sign in at all.
 */
export function InviteOperator({
  labels,
}: {
  labels: {
    invite: string;
    name: string;
    email: string;
    send: string;
    cancel: string;
    failed: string;
    minted: string;
    next: string;
  };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [minted, setMinted] = useState<{ email: string; password: string } | null>(null);

  const ready = name.trim().length >= 2 && email.includes('@') && !saving;

  const submit = async (): Promise<void> => {
    if (!ready) return;

    setSaving(true);
    const answer = await post<{ data: { email: string }; password: string }>('/api/platform/team', {
      name: name.trim(),
      email: email.trim(),
    });
    setSaving(false);

    if (!answer.ok) {
      flash.problem(answer.message ?? labels.failed);
      return;
    }

    setMinted({ email: answer.data.data.email, password: answer.data.password });
    setName('');
    setEmail('');
    router.refresh();
  };

  if (minted !== null) {
    return (
      <div className="bg-warning-50 border-warning-200 flex flex-wrap items-center gap-3 rounded-md border px-3 py-2 text-sm">
        <span className="font-semibold">{labels.minted}</span>
        <code className="bg-surface rounded px-2 py-0.5 font-mono text-sm">{minted.email}</code>
        <code className="bg-surface rounded px-2 py-0.5 font-mono text-sm">{minted.password}</code>
        <span className="text-fg-muted text-xs">{labels.next}</span>
        <button
          type="button"
          onClick={() => {
            setMinted(null);
            setOpen(false);
          }}
          className="text-fg-muted hover:text-fg text-xs font-medium"
        >
          {labels.cancel}
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        data-press
        onClick={() => setOpen(true)}
        className="bg-brand-500 hover:bg-brand-600 h-9 rounded-md px-4 text-sm font-semibold text-white"
      >
        {labels.invite}
      </button>
    );
  }

  const field =
    'border-border-strong bg-surface text-fg h-9 rounded-md border px-3 text-sm font-medium';

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
        value={name}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false);
        }}
        placeholder={labels.name}
        aria-label={labels.name}
        className={`${field} w-[160px]`}
      />
      <input
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder={labels.email}
        aria-label={labels.email}
        inputMode="email"
        className={`${field} w-[220px]`}
      />
      <button
        type="submit"
        data-press
        disabled={!ready}
        className="bg-brand-500 hover:bg-brand-600 h-9 rounded-md px-4 text-sm font-semibold text-white disabled:opacity-50"
      >
        {labels.send}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="text-fg-muted hover:text-fg h-9 px-2 text-sm font-medium"
      >
        {labels.cancel}
      </button>
    </form>
  );
}
