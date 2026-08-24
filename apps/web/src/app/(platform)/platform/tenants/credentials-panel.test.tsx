import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { uz } from '@/i18n/uz';

import { TenantList, type TenantRow } from './tenant-list';

/**
 * The panel an operator opens when a restaurant rings about its login.
 *
 * Two questions arrive on that call — "what do I sign in with" and "change my
 * password" — and both are answered here, by a form that writes real
 * credentials for a real business. The unit tests upstream prove the API does
 * the right thing; these prove the screen asks it for the right thing, which is
 * the half that had no coverage at all: `tenant-list.tsx` is 2 200 lines of
 * client component and nothing rendered it.
 *
 * What is asserted is the wiring an operator depends on and cannot see:
 * which endpoint each button reaches, what it sends, and — the two that would
 * be silent failures — that an untouched password field sends nothing rather
 * than an empty string, and that a fixture row cannot write at all.
 */

vi.mock('next-intl', () => ({ useMessages: () => uz }));

vi.mock('@restaurant/ui', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@restaurant/ui');

  return {
    ...actual,
    // A toast portal needs a mount point these assertions have no use for; the
    // calls still have to be swallowed rather than throw.
    flash: Object.assign(vi.fn(), { problem: vi.fn() }),
  };
});

const CARD = uz.console.platformTenants.card;

function tenantRow(overrides: Partial<TenantRow> = {}): TenantRow {
  return {
    id: 'osh-xona',
    tenantId: 42,
    name: 'Osh Xona',
    city: 'Termiz',
    plan: 'Growth',
    planId: 'growth',
    branches: 1,
    users: 3,
    mrr: "390 000 so'm",
    mrrRaw: 39_000_000,
    pay: "To'langan",
    payState: 'paid',
    payTone: 'success',
    owner: 'Ravshan aka',
    ownerEmail: 'egasi@oshxona.uz',
    phone: '+998901112233',
    since: '01.08.2026',
    nextInvoice: '01.09.2026',
    seen: 'Kecha',
    state: 'live',
    stateLabel: 'Faol',
    problem: false,
    branchRows: [],
    pool: [],
    ownerRole: 'owner',
    invoiceOffset: 0,
    invoices: [],
    features: [],
    ...overrides,
  };
}

function list(row: TenantRow) {
  return render(
    <TenantList
      rows={[row]}
      labels={{
        search: 'Qidirish',
        all: 'Hammasi',
        problems: 'Muammoli',
        showing: '{n}',
        empty: 'Yo‘q',
        colName: 'Restoran',
        colPlan: 'Tarif',
        colBranches: 'Filial',
        colUsers: 'Foydalanuvchi',
        colMrr: 'MRR',
        colPay: "To'lov",
      }}
      head={{ title: 'Restoranlar', subtitle: '1' }}
      stats={[]}
      lang="uz"
    />,
  );
}

/** Open the card, then its credentials panel. */
function openCredentials(row: TenantRow = tenantRow()) {
  list(row);

  fireEvent.click(screen.getByText(row.name));
  fireEvent.click(screen.getByRole('button', { name: CARD.credentials }));
}

type Call = { url: string; body: Record<string, unknown> };

function upstream(answer: unknown = { owner: { password: 'Yangi7Parol7Bor' } }) {
  const calls: Call[] = [];

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) as Record<string, unknown> });

      return new Response(JSON.stringify(answer), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );

  return calls;
}

beforeEach(() => {
  // jsdom has no clipboard, and the panel copies the address on demand.
  Object.assign(navigator, { clipboard: { writeText: vi.fn(async () => undefined) } });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('the credentials panel', () => {
  it('shows the address the restaurant signs in with, in a field that can be corrected', () => {
    // It used to be a copy button and nothing else, so a typo taken down on a
    // phone call was a business that could not sign in and could not be fixed.
    openCredentials();

    expect(screen.getByDisplayValue('egasi@oshxona.uz')).toBeTruthy();
  });

  it('sends a corrected address to the owner endpoint, not the password one', async () => {
    /*
     * The split is the whole design. Issuing a password ends every session that
     * account has open; correcting an address must not, so it cannot share a
     * door with it — an operator fixing a phone number would sign the owner out
     * of the till they are standing at.
     */
    const calls = upstream({ owner: { email: 'yangi@oshxona.uz' } });

    openCredentials();

    fireEvent.change(screen.getByDisplayValue('egasi@oshxona.uz'), {
      target: { value: 'yangi@oshxona.uz' },
    });
    fireEvent.click(screen.getByRole('button', { name: CARD.emailSave }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.url).toBe('/api/platform/tenant-owner');
    expect(calls[0]?.body).toEqual({ tenantId: 42, email: 'yangi@oshxona.uz' });
  });

  it('edits the name and the phone on the same call, not just the address', async () => {
    /*
     * The API took all three from the day it was written and the panel only ever
     * sent the email, so "you spelled my name wrong" and "that is my old number"
     * — which arrive on the same phone call — had nowhere to go.
     */
    const calls = upstream({
      owner: { email: 'egasi@oshxona.uz', name: 'Ravshan Karimov', phone: '+998907776655' },
    });

    openCredentials();

    fireEvent.change(screen.getByDisplayValue('Ravshan aka'), {
      target: { value: 'Ravshan Karimov' },
    });
    fireEvent.change(screen.getByDisplayValue('+998901112233'), {
      target: { value: '+998907776655' },
    });
    fireEvent.click(screen.getByRole('button', { name: CARD.emailSave }));

    await waitFor(() => expect(calls).toHaveLength(1));
    // The address is absent because it was not touched — `sometimes` upstream
    // reads an absent key as "leave it alone".
    expect(calls[0]?.body).toEqual({
      tenantId: 42,
      name: 'Ravshan Karimov',
      phone: '+998907776655',
    });
  });

  it('lets a wrong phone number be removed, not only replaced', async () => {
    // Emptied on purpose is a different instruction from untouched, and the
    // proxy forwards it as an explicit null.
    const calls = upstream({ owner: { email: 'egasi@oshxona.uz', phone: null } });

    openCredentials();

    fireEvent.change(screen.getByDisplayValue('+998901112233'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: CARD.emailSave }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.body).toEqual({ tenantId: 42, phone: '' });
  });

  it('will not save an address nobody changed', async () => {
    // The button has nothing to do, and a round trip that changes nothing would
    // report success for a form the operator had not filled in.
    const calls = upstream();

    openCredentials();

    fireEvent.click(screen.getByRole('button', { name: CARD.emailSave }));

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(calls).toHaveLength(0);
  });

  it('asks for a generated password when the field was left alone', async () => {
    /*
     * The silent failure this guards: an empty field has to reach the API as an
     * ABSENT key, not `""`. The rule upstream is `nullable` with a minimum
     * length, so an empty string is a *chosen* blank and is refused for being
     * too short — and the generator, which is what this button means when
     * nothing is typed, would never run.
     */
    const calls = upstream();

    openCredentials();

    fireEvent.click(screen.getByRole('button', { name: CARD.newPassword }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.url).toBe('/api/platform/tenant-password');
    expect(calls[0]?.body).toEqual({ tenantId: 42, password: '' });
  });

  it('sends the password the operator typed, and offers to set it rather than generate', async () => {
    const calls = upstream({ owner: { password: 'Osh7Xona7Termiz' } });

    openCredentials();

    fireEvent.change(screen.getByPlaceholderText(CARD.passwordPlaceholder), {
      target: { value: 'Osh7Xona7Termiz' },
    });

    // The button changes what it says the moment there is something to set: an
    // operator must not press "issue a new one" and have their typed password
    // used, nor the reverse.
    const set = screen.getByRole('button', { name: CARD.setPassword });

    fireEvent.click(set);

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.body).toEqual({ tenantId: 42, password: 'Osh7Xona7Termiz' });
  });

  it('posts whatever the operator typed, however weak', async () => {
    /*
     * Reported as a bug and fixed as a decision: a short password used to be
     * refused with a 422 and the sentence "the submitted data is not valid,
     * check the highlighted field", which names no field and no rule. There is
     * no strength rule now — restaurants dictate their own password — so this
     * asserts the console does not invent one.
     */
    const calls = upstream();

    openCredentials();

    fireEvent.change(screen.getByPlaceholderText(CARD.passwordPlaceholder), {
      target: { value: 'parol' },
    });
    fireEvent.click(screen.getByRole('button', { name: CARD.setPassword }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.body).toEqual({ tenantId: 42, password: 'parol' });
  });

  it('will not post one longer than bcrypt reads', async () => {
    // The only refusal left, and it is not a policy: bcrypt reads 72 bytes and
    // ignores the rest, so a longer one would match anything sharing its prefix.
    // Caught in the browser so the round trip does not happen.
    const calls = upstream();

    openCredentials();

    fireEvent.change(screen.getByPlaceholderText(CARD.passwordPlaceholder), {
      target: { value: 'a'.repeat(73) },
    });
    fireEvent.click(screen.getByRole('button', { name: CARD.setPassword }));

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(calls).toHaveLength(0);
  });

  it('prints the issued password once, and empties the field it was typed into', async () => {
    // The answer is the only copy of it that exists; leaving the typed value in
    // an input on a console somebody walks away from is the thing this screen is
    // otherwise careful about.
    upstream({ owner: { password: 'Yangi7Parol7Bor' } });

    openCredentials();

    fireEvent.change(screen.getByPlaceholderText(CARD.passwordPlaceholder), {
      target: { value: 'Osh7Xona7Termiz' },
    });
    fireEvent.click(screen.getByRole('button', { name: CARD.setPassword }));

    await waitFor(() => expect(screen.getByText('Yangi7Parol7Bor')).toBeTruthy());
    expect(screen.queryByDisplayValue('Osh7Xona7Termiz')).toBeNull();
  });

  it('writes nothing at all from a fixture row', async () => {
    /*
     * `tenantId: null` is a render that fell back to fixtures. Every button on
     * this card checks it, and this panel is the one where getting it wrong
     * would reset the credentials of whichever real restaurant happens to hold
     * that id.
     */
    const calls = upstream();

    openCredentials(tenantRow({ tenantId: null }));

    fireEvent.change(screen.getByDisplayValue('egasi@oshxona.uz'), {
      target: { value: 'yangi@oshxona.uz' },
    });
    fireEvent.click(screen.getByRole('button', { name: CARD.emailSave }));
    fireEvent.click(screen.getByRole('button', { name: CARD.newPassword }));

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(calls).toHaveLength(0);
  });

  it('reads back the password the platform issued', async () => {
    /*
     * The call an operator takes all day — "what is my password" — and the one
     * this panel had no answer to. Not a decryption of the hash; the value the
     * platform issued, kept beside it.
     */
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              owner: { password: 'Osh7Xona7Termiz', issued_at: new Date().toISOString() },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
      ),
    );

    openCredentials();

    fireEvent.click(screen.getByRole('button', { name: CARD.revealPassword }));

    await waitFor(() => expect(screen.getByText('Osh7Xona7Termiz')).toBeTruthy());
    // The age, because an operator judges by it before reading it out.
    expect(screen.getByText(CARD.revealedToday)).toBeTruthy();
  });

  it('says there is nothing stored rather than showing an empty box', async () => {
    // `null` is a real answer: the owner changed their password, so the copy was
    // cleared. Silence here would look like a bug and hide the next step.
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ owner: { password: null, issued_at: null } }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    );

    openCredentials();

    fireEvent.click(screen.getByRole('button', { name: CARD.revealPassword }));

    await waitFor(() => expect(screen.getByText(CARD.revealedNone)).toBeTruthy());
  });

  it('says a restaurant has no owner rather than offering to edit one', () => {
    // A real state — a business archived before anybody signed in — and the
    // panel names it instead of drawing a form that would write nothing.
    openCredentials(tenantRow({ ownerEmail: null }));

    expect(screen.getByText(CARD.credentialsNone)).toBeTruthy();
    expect(screen.queryByRole('button', { name: CARD.emailSave })).toBeNull();
  });
});
