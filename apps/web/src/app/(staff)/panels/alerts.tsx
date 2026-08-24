import { ALERTS_COPY, copy } from '@restaurant/surfaces/crew/copy';
import { ALERTS, say, type Lang } from '@restaurant/surfaces/crew/data';
import { EmptyState, Note } from './bits';

/**
 * What went wrong today, newest first, and nothing to press.
 *
 * Deliberately read-only. Every line here is already actionable somewhere else
 * — the cash variance in the till, the beef in a purchase order, the discount
 * in the approval that granted it — and putting a button on the alert would
 * create a second place to resolve the same thing, which is how two systems
 * come to disagree about whether a variance was explained.
 *
 * The dot is a second signal, not the signal. Each row states the fact in
 * words; the colour only sorts by urgency at a glance, so the feed still reads
 * for someone who cannot tell the red from the amber.
 */
export function AlertsPanel({ lang }: { lang: Lang }) {
  const t = copy(ALERTS_COPY, lang);

  if (ALERTS.length === 0) return <EmptyState>{t.empty}</EmptyState>;

  const dot: Record<string, string> = {
    danger: 'bg-danger-500',
    warning: 'bg-warning-500',
    brand: 'bg-brand-500',
    success: 'bg-success-500',
    quiet: 'bg-n-400',
  };

  return (
    <section>
      <ul>
        {ALERTS.map((alert) => (
          <li key={alert.id} className="border-divider flex gap-3 border-b py-3.5 last:border-b-0">
            <span
              aria-hidden
              className={`mt-1.5 size-[7px] flex-none rounded-full ${dot[alert.tone]}`}
            />
            <div className="min-w-0">
              <h3 className="text-sm leading-snug font-semibold">{say(alert.title, lang)}</h3>
              <p className="text-fg-muted mt-0.5 text-xs leading-normal">{say(alert.body, lang)}</p>
              <p data-num className="text-fg-subtle text-2xs mt-1">
                {say(alert.ago, lang)}
              </p>
            </div>
          </li>
        ))}
      </ul>

      <Note>{t.note}</Note>
    </section>
  );
}
