import type { Locale } from '@/i18n';

/**
 * The contact form, posted to this app's own handler.
 *
 * A function rather than four lines inside the board, so the board's submit
 * handler stays about validation and what the reader sees. It never throws:
 * this is a form somebody is standing in front of, and an unhandled rejection
 * in a submit handler is a button that appears to do nothing.
 */
export async function submitLead(lead: {
  name: string;
  phone: string;
  restaurant: string;
  message: string;
  locale: Locale;
}): Promise<{ ok: boolean; message?: string }> {
  try {
    const response = await fetch(`/api/public/leads?lang=${lead.locale}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: lead.name,
        phone: lead.phone,
        restaurant: lead.restaurant,
        message: lead.message === '' ? undefined : lead.message,
      }),
      cache: 'no-store',
    });

    const payload = (await response.json().catch(() => null)) as {
      message?: string;
      data?: { duplicate?: boolean };
    } | null;

    /*
     * A duplicate is a success from the reader's side.
     *
     * The server keeps one live enquiry per number per day and answers 200 with
     * `duplicate: true` rather than refusing — somebody who pressed send twice
     * because the first tap did not look like it worked has not done anything
     * wrong, and telling them so would send them to press a third time.
     */
    if (response.ok) return { ok: true };

    return { ok: false, message: payload?.message };
  } catch {
    return { ok: false };
  }
}
