'use client';

import type { ReactNode } from 'react';

import { copy, SHARED, type Resolved } from './setup-copy';
import type { Lang, StepFailure } from './setup-data';

/**
 * The small parts every step of the wizard is built from.
 *
 * Drawn to the design file's numbers rather than to a component library: this
 * surface has a 44px control height, a 12px card radius and a 13px label, and
 * three of those disagree with the shadcn defaults in `packages/ui`. Reaching
 * for the shared primitives and then overriding each one produces a screen that
 * is neither the design nor the design system.
 *
 * Icons are inline SVG with the design file's own path data, which is how every
 * other screen in this app draws them. A sprite or an icon package would be a
 * second source of truth for shapes the design already states exactly.
 */

/* ============================================================
   Icons
   ============================================================ */

export function TickIcon({ size = 12, colour = '#fff' }: { size?: number; colour?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={colour}
      strokeWidth="3.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function ChevronIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

export function PlusIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function CloseIcon({ size = 15 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

export function AlertIcon({
  size = 16,
  colour = 'currentColor',
}: {
  size?: number;
  colour?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={colour}
      strokeWidth="2.2"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M12 8v5M12 17h0" />
      <circle cx="12" cy="12" r="9" />
    </svg>
  );
}

/* ============================================================
   Form parts
   ============================================================ */

/**
 * A labelled field.
 *
 * The error message sits under the input and the input carries
 * `aria-invalid`, so the fact that something is wrong reaches a screen reader
 * and a person who cannot tell the red border from the grey one. Status is
 * never carried by colour alone — FOUNDATIONS §7.
 */
export function Field({
  label,
  note,
  error,
  children,
}: {
  label: string;
  note?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-semibold">{label}</span>
      <span className="mt-[7px] block">{children}</span>
      {error !== undefined ? (
        <span className="text-danger-600 mt-1.5 flex items-center gap-1.5 text-xs">
          <AlertIcon size={13} />
          {error}
        </span>
      ) : note !== undefined ? (
        <span className="text-fg-subtle mt-1.5 block text-xs">{note}</span>
      ) : null}
    </label>
  );
}

/** A pill that is either chosen or not. Used for cuisines and rounding steps. */
export function Chip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`sw-tap rounded-pill h-[38px] border px-[15px] text-sm font-semibold ${
        on
          ? 'bg-n-900 border-n-900 text-white'
          : 'bg-surface border-border-strong text-fg hover:bg-bg-subtle'
      }`}
    >
      {children}
    </button>
  );
}

/** A 17px tick box. The design's checkbox, at the design's size. */
export function CheckBox({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={`grid size-[17px] flex-none place-items-center rounded-[5px] border-[1.6px] ${
        on ? 'bg-brand-500 border-brand-500' : 'border-n-300 bg-transparent'
      }`}
    >
      {on ? <TickIcon size={10} /> : null}
    </span>
  );
}

/**
 * Minus, a number, plus.
 *
 * The number is a static readout rather than an input, exactly as the design
 * draws it: a table count is changed by pressing a button eighteen times or not
 * at all, and a free text field here invites "eighteen" and "18 ta" and an
 * empty string, each of which has to be rejected with a sentence.
 */
export function Stepper({
  value,
  onChange,
  min,
  max,
  label,
}: {
  value: number;
  onChange: (next: number) => void;
  min: number;
  max: number;
  label: string;
}) {
  return (
    <div className="border-border flex items-center gap-0.5 rounded-[10px] border p-[3px]">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        aria-label={`${label} −`}
        className="sw-tap text-fg-muted disabled:text-fg-disabled grid size-8 place-items-center rounded-lg bg-transparent text-[17px] font-semibold disabled:cursor-not-allowed"
      >
        −
      </button>
      <span data-num className="w-8 text-center font-mono text-[15px] font-semibold">
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        aria-label={`${label} +`}
        className="sw-tap bg-bg-muted text-fg disabled:text-fg-disabled grid size-8 place-items-center rounded-lg text-[17px] font-semibold disabled:cursor-not-allowed"
      >
        +
      </button>
    </div>
  );
}

/** A status chip: a dot, a word, and a background that agrees with both. */
export function StatusChip({
  tone,
  children,
}: {
  tone: 'neutral' | 'good' | 'warn' | 'bad';
  children: ReactNode;
}) {
  const skin = {
    neutral: 'bg-bg-muted text-fg-muted',
    good: 'bg-success-50 text-success-700',
    warn: 'bg-warning-50 text-warning-700',
    bad: 'bg-danger-50 text-danger-700',
  }[tone];

  const dot = {
    neutral: 'bg-n-400',
    good: 'bg-success-500',
    warn: 'bg-warning-500',
    bad: 'bg-danger-500',
  }[tone];

  return (
    <span
      className={`rounded-pill flex flex-none items-center gap-[7px] px-[11px] py-1.5 text-xs font-semibold ${skin}`}
    >
      <span aria-hidden className={`size-1.5 rounded-full ${dot}`} />
      {children}
    </span>
  );
}

/* ============================================================
   Saying what is not there
   ============================================================ */

/**
 * The honesty block.
 *
 * A step whose endpoint does not exist still renders and still validates, and
 * then says this. It is drawn as information rather than as an error, because
 * nothing the owner did is wrong — the platform is simply not finished, and
 * pretending otherwise means collecting a restaurant's tax details into
 * nothing and reporting success.
 *
 * It is deliberately specific about what is missing. "Coming soon" tells an
 * owner nothing they can act on; "there is no endpoint that stores a fiscal
 * module number, and certification is slow, so start it this week" tells them
 * what to do on Monday.
 */
export function NotWired({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-border border-l-warning-500 bg-warning-50 flex items-start gap-3 rounded-[12px] border border-l-[3px] px-[18px] py-4">
      <span className="text-warning-600 mt-px flex-none">
        <AlertIcon size={17} />
      </span>
      <div>
        <div className="text-warning-700 text-sm font-semibold">{title}</div>
        <p className="text-warning-700 mt-1 text-sm leading-relaxed text-pretty">{children}</p>
      </div>
    </div>
  );
}

/**
 * What went wrong with a write, in the words the API used.
 *
 * Three kinds, three instructions. A dropped connection says try again; a
 * refusal shows the server's own sentence, which already distinguishes a taken
 * slug from a missing permission; an expired session says sign in, because
 * nothing about the form is wrong.
 *
 * The refusal text is never rewritten here. The API writes it in all three
 * languages precisely so a second copy does not have to exist and then drift.
 */
export function Failure({ failure, lang }: { failure: StepFailure; lang: Lang }) {
  const t: Resolved<typeof SHARED> = copy(SHARED, lang);

  const sentence =
    failure.kind === 'offline'
      ? t.offline
      : failure.kind === 'unauthorised'
        ? t.noSession
        : (failure.refusal.message?.[lang] ?? t.refused);

  return (
    <div
      role="alert"
      className="border-border border-l-danger-500 bg-danger-50 flex items-start gap-3 rounded-[12px] border border-l-[3px] px-[18px] py-4"
    >
      <span className="text-danger-600 mt-px flex-none">
        <AlertIcon size={17} />
      </span>
      <div className="min-w-0">
        <p className="text-danger-700 text-sm leading-relaxed text-pretty">{sentence}</p>
        {failure.kind === 'refused' && failure.refusal.code !== null ? (
          // The machine key, for the person who has to look it up in the error
          // catalogue. Muted and monospaced: it is for an engineer reading over
          // an owner's shoulder, not for the owner.
          <p data-num className="text-danger-600 mt-1.5 font-mono text-xs opacity-80">
            {failure.refusal.code}
            {failure.refusal.field !== null ? ` · ${failure.refusal.field}` : ''}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The toast, one at a time.
 *
 * `role="status"` rather than `alert`: it announces a thing that went right,
 * politely, without interrupting whatever the reader is doing. A queue was
 * considered and rejected — FOUNDATIONS §5 says a new toast replaces the
 * current one, and a stack of them covers the button that produced them.
 */
export function Toast({ message }: { message: string }) {
  if (message === '') return null;

  return (
    <div role="status" className="sw-toast">
      <TickIcon size={15} colour="var(--success-500)" />
      {message}
    </div>
  );
}
