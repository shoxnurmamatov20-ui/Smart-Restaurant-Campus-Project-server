/**
 * Settings, assembled: the catalogue's sentences over the screen's own figures.
 *
 * `Smart Restaurant OS.dc.html:5677-6189` draws **eight** settings screens
 * behind one tab strip — terminal, printers, receipt, payment methods,
 * categories, zones, notifications, releases — then the order-state table, the
 * three policy groups and the appearance row underneath.
 *
 * The copy used to live here, all three languages of it, interleaved with the
 * printer IPs and the switch positions. That is two different things in one
 * file, and the wrong half was written three times: an IP, a share of today's
 * takings and a version number read the same in Uzbek, Russian and English, so
 * holding them in three language blocks meant every edit had three chances to
 * go in twice and once wrong.
 *
 * Now the sentences are `console.settingsPanels` in `src/i18n` — one place, and
 * `i18n.test.ts` checks the three languages carry the same keys — and the
 * figures are `./settings-data.ts`, written once. This module puts them back
 * together into the shape `settings-panels.tsx` already reads, which is why
 * that file did not change.
 *
 * The two halves line up two ways: arrays by index (printers, payment methods,
 * releases), keyed rows by name (an order state, a terminal identity row). Add
 * a row to one half and the other has to grow with it — a mismatch is a
 * compile error where the shape is fixed and a blank cell where it is not, so
 * they are edited together.
 */

import type { Messages } from '@/i18n';

import {
  CATEGORY_ROWS,
  NOTIFY_DATA,
  PAY_ROWS,
  POLICY_SWITCHES,
  PRINTER_ROWS,
  RECEIPT_DATA,
  RELEASE_ROWS,
  STATE_ROWS,
  TERMINAL_DATA,
  ZONE_ROWS,
} from './settings-data';

/** What `console.settingsPanels` holds — the reader-facing half. */
export type SettingsMessages = Messages['console']['settingsPanels'];

export type Labelled = { label: string; note: string };

export type CategoryRow = {
  id: string;
  name: string;
  sum: number;
  used: number;
  code?: string;
  direction?: 'in' | 'out';
};

export type SettingsCopy = {
  subtitle: string;
  /**
   * The header when the restaurant's own name is known — `{brand} · {place}`.
   *
   * `subtitle` above is the design's sentence and names the Chilonzor branch of
   * a group nobody belongs to; `settings-server.ts` fills this one in and only
   * falls back to the other where the whole screen is the fixture.
   */
  subtitleLive: string;

  tabs: {
    terminal: string;
    printers: string;
    receipt: string;
    pays: string;
    cats: string;
    zones: string;
    notify: string;
    releases: string;
  };

  terminal: {
    title: string;
    sub: string;
    preview: string;
    livePreview: string;
    mode: string;
    modeSub: string;
    background: string;
    photo: string;
    photoNote: string;
    blocks: string;
    msgTitleField: string;
    msgBodyField: string;
    security: string;
    securitySub: string;
    lock: string;
    minutes: string;
    identity: string;
    identityNote: string;
    lockedOff: string;
    lockedFlash: string;
    signIn: string;
    date: string;
    branch: string;
    msgTitle: string;
    msgBody: string;
    modes: readonly (Labelled & { key: 'minimal' | 'status' | 'brand'; modeNote: string })[];
    backgrounds: readonly { key: string; label: string; swatch: string }[];
    blockRows: readonly (Labelled & { key: 'clock' | 'brand' | 'stats' | 'health' | 'msg' })[];
    secRows: readonly (Labelled & { key: 'pinSet' | 'pinShift' })[];
    stats: readonly { value: string; label: string; good?: boolean }[];
    identityRows: readonly { key: string; value: string; mono: boolean }[];
    previewFlash: string;
  };

  printers: {
    title: string;
    sub: string;
    add: string;
    colName: string;
    colIp: string;
    colKind: string;
    colState: string;
    colLast: string;
    test: string;
    edit: string;
    note: string;
    dishes: string;
    noDishes: string;
    kinds: Record<'kitchen' | 'bar' | 'till' | 'pass', string>;
    up: string;
    down: string;
    testOk: string;
    testFail: string;
    addFlash: string;
    editFlash: string;
    rows: readonly {
      id: string;
      name: string;
      ip: string;
      kind: 'kitchen' | 'bar' | 'till' | 'pass';
      up: boolean;
      last: string;
      dishes: number;
    }[];
  };

  receipt: {
    title: string;
    sub: string;
    test: string;
    elements: string;
    elementsSub: string;
    thanksField: string;
    phonesField: string;
    note: string;
    testFlash: string;
    brand: string;
    branch: string;
    address: string;
    taxId: string;
    /** What an unfilled requisite says on the preview. */
    unset: string;
    thanks: string;
    phones: string;
    metaReceipt: string;
    metaReceiptValue: string;
    metaDate: string;
    metaDateValue: string;
    metaTable: string;
    metaTableValue: string;
    metaGuests: string;
    metaGuestsValue: string;
    metaOrders: string;
    metaOrdersValue: string;
    metaWaiter: string;
    metaWaiterValue: string;
    lines: readonly { name: string; value: string }[];
    totalItems: string;
    totalService: string;
    totalTotal: string;
    totalVat: string;
    totals: readonly { key: 'items' | 'svc' | 'total' | 'vat'; value: string }[];
    toggles: readonly (Labelled & { key: string })[];
  };

  pays: {
    title: string;
    sub: string;
    add: string;
    colName: string;
    colKind: string;
    colFiscal: string;
    colShare: string;
    colOn: string;
    note: string;
    fiscal: string;
    nonFiscal: string;
    kinds: Record<'cash' | 'card' | 'debt', string>;
    addFlash: string;
    lockedFlash: string;
    onFlash: string;
    offFlash: string;
    rows: readonly {
      id: string;
      name: string;
      kind: 'cash' | 'card' | 'debt';
      fiscal: boolean;
      on: boolean;
      share: number;
      note: string;
      /**
       * The tender this row configures — `cash`, `uzcard`, `payme`.
       *
       * Present only on a live list. It is what the switch writes against,
       * because half the rows on that table have no id yet: the platform
       * answers a default for every tender a restaurant has not configured, and
       * the first switch is what materialises the row. A fixture console has no
       * tender behind its rows and says so by leaving this undefined.
       */
      method?: string;
    }[];
  };

  cats: {
    add: string;
    del: string;
    entries: string;
    inTitle: string;
    inSub: string;
    inNote: string;
    outTitle: string;
    outSub: string;
    outNote: string;
    addFlash: string;
    inUse: string;
    deleted: string;
    /**
     * `code` and `direction` are present only on a live list, and both are
     * needed to write: the code is what `expenses.category` carries and what an
     * archive is addressed by, and the direction is what makes it unique — a
     * restaurant may have `other` on both sides of its ledger.
     */
    income: readonly CategoryRow[];
    expense: readonly CategoryRow[];
  };

  zones: {
    title: string;
    sub: string;
    add: string;
    svcToggle: string;
    note: string;
    seats: string;
    avg: string;
    pax: string;
    svcOn: string;
    svcOff: string;
    addFlash: string;
    svcAdded: string;
    svcRemoved: string;
    rows: readonly { id: string; name: string; tables: number; seats: number; svc: boolean }[];
  };

  notify: {
    title: string;
    sub: string;
    chat: string;
    bot: string;
    botHandle: string;
    which: string;
    test: string;
    save: string;
    note: string;
    hintEmpty: string;
    hintOk: string;
    /** The format-only confirmation — see `settings-panels.tsx`. */
    hintOkPlain: string;
    hintBad: string;
    testSent: string;
    testBad: string;
    saved: string;
    saveBad: string;
    events: readonly { key: string; label: string; when: string; on: boolean }[];
  };

  releases: {
    title: string;
    sub: string;
    note: string;
    current: string;
    major: string;
    minor: string;
    rows: readonly { version: string; date: string; major: boolean; note: string }[];
  };

  states: {
    title: string;
    sub: string;
    colStaff: string;
    colKitchen: string;
    colGuest: string;
    colChannel: string;
    note: string;
    all: string;
    offPremise: string;
    dine: string;
    delivery: string;
    pickup: string;
    rows: readonly {
      key: string;
      tone: 'neutral' | 'brand' | 'warning' | 'success' | 'danger';
      staff: string;
      kitchen: string | null;
      guest: string | null;
      channels: readonly ('dine' | 'delivery' | 'pickup')[];
    }[];
  };

  policy: {
    groups: readonly {
      title: string;
      rows: readonly {
        label: string;
        value: string;
        on: boolean;
        /**
         * Whether this row is a lever or a statement.
         *
         * Five of the ten switches wrote nothing and still flipped and still
         * flashed "<label> enabled" — a VAT rate, coursing the kitchen does not
         * implement, and three discount ceilings whose single source is
         * `Terminal.settings.discount_limits`. A manager who moved the waiter
         * limit here was told it took effect while the till went on refusing at
         * the old number. Those rows keep their value and lose their switch.
         */
        readOnly?: boolean;
      }[];
    }[];
    on: string;
    off: string;
    /** What a read-only row says instead of a switch. */
    readOnlyNote: string;
    /** The three figures the live document fills in — see `settings-server.ts`. */
    svcValue: string;
    vatValue: string;
    vatUnset: string;
    kdsValue: string;
    discountValue: string;
    discountUnset: string;
  };

  appearance: { title: string; sub: string; light: string; dark: string };
};

/* -------------------------------------------------------------- assembly */

/**
 * One order state can be missing two of its three words.
 *
 * A draft has no kitchen line and nothing the guest is told, because neither
 * has heard of the order yet. The catalogue says so by not carrying the key,
 * which is more honest than an empty string and is what the table draws as a
 * dash.
 */
const optional = (words: Readonly<Record<string, string>>, key: string): string | null =>
  words[key] ?? null;

export function settingsCopy(m: SettingsMessages): SettingsCopy {
  return {
    subtitle: m.subtitle,
    subtitleLive: m.subtitleLive,
    tabs: m.tabs,

    terminal: {
      title: m.terminal.title,
      sub: m.terminal.sub,
      preview: m.terminal.preview,
      livePreview: m.terminal.livePreview,
      mode: m.terminal.mode,
      modeSub: m.terminal.modeSub,
      background: m.terminal.background,
      photo: m.terminal.photo,
      photoNote: m.terminal.photoNote,
      blocks: m.terminal.blocks,
      msgTitleField: m.terminal.msgTitleField,
      msgBodyField: m.terminal.msgBodyField,
      security: m.terminal.security,
      securitySub: m.terminal.securitySub,
      lock: m.terminal.lock,
      minutes: m.terminal.minutes,
      identity: m.terminal.identity,
      identityNote: m.terminal.identityNote,
      lockedOff: m.terminal.lockedOff,
      lockedFlash: m.terminal.lockedFlash,
      signIn: m.terminal.signIn,
      date: m.terminal.date,
      branch: m.terminal.branch,
      msgTitle: m.terminal.msgTitle,
      msgBody: m.terminal.msgBody,
      previewFlash: m.terminal.previewFlash,

      modes: TERMINAL_DATA.modeKeys.map((key, index) => ({ key, ...m.terminal.modes[index] })),
      backgrounds: TERMINAL_DATA.backgrounds.map((background, index) => ({
        key: background.key,
        label: m.terminal.backgrounds[index].label,
        swatch: background.swatch,
      })),
      blockRows: TERMINAL_DATA.blockKeys.map((key, index) => ({
        key,
        ...m.terminal.blockRows[index],
      })),
      secRows: TERMINAL_DATA.secKeys.map((key, index) => ({ key, ...m.terminal.secRows[index] })),
      stats: TERMINAL_DATA.stats.map((stat, index) => ({
        ...stat,
        label: m.terminal.stats[index].label,
      })),
      identityRows: TERMINAL_DATA.identityRows.map((row) => ({
        key: m.terminal.identityRows[row.label],
        /* Two of the five are themselves translated — the default zone and the
           order type are words, not serial numbers. */
        value: row.value ?? m.terminal.identityValues[row.label as 'zone' | 'orderType'],
        mono: row.mono,
      })),
    },

    printers: { ...m.printers, rows: PRINTER_ROWS },

    receipt: {
      ...m.receipt,
      brand: RECEIPT_DATA.brand,
      address: RECEIPT_DATA.address,
      taxId: RECEIPT_DATA.taxId,
      phones: RECEIPT_DATA.phones,
      metaReceiptValue: RECEIPT_DATA.metaReceiptValue,
      metaDateValue: RECEIPT_DATA.metaDateValue,
      metaTableValue: RECEIPT_DATA.metaTableValue,
      metaGuestsValue: RECEIPT_DATA.metaGuestsValue,
      metaOrdersValue: RECEIPT_DATA.metaOrdersValue,
      metaWaiterValue: RECEIPT_DATA.metaWaiterValue,
      lines: RECEIPT_DATA.lines,
      totals: RECEIPT_DATA.totals,
      toggles: RECEIPT_DATA.toggleKeys.map((key, index) => ({
        key,
        ...m.receipt.toggles[index],
      })),
    },

    pays: {
      ...m.pays,
      rows: PAY_ROWS.map((row, index) => ({ ...row, note: m.pays.rows[index].note })),
    },

    cats: {
      ...m.cats,
      income: CATEGORY_ROWS.income.map((row, index) => ({
        ...row,
        name: m.cats.income[index].name,
      })),
      expense: CATEGORY_ROWS.expense.map((row, index) => ({
        ...row,
        name: m.cats.expense[index].name,
      })),
    },

    zones: {
      title: m.zones.title,
      sub: m.zones.sub,
      add: m.zones.add,
      svcToggle: m.zones.svcToggle,
      note: m.zones.note,
      seats: m.zones.seats,
      avg: m.zones.avg,
      pax: m.zones.pax,
      svcOn: m.zones.svcOn,
      svcOff: m.zones.svcOff,
      addFlash: m.zones.addFlash,
      svcAdded: m.zones.svcAdded,
      svcRemoved: m.zones.svcRemoved,
      /* Three zones are named by the restaurant and stay as they are typed;
         the terrace is the design's own word and is translated. */
      rows: ZONE_ROWS.map((row) => ({ ...row, name: row.name ?? m.zones.terraceName })),
    },

    notify: {
      ...m.notify,
      botHandle: NOTIFY_DATA.botHandle,
      events: NOTIFY_DATA.events.map((event, index) => ({ ...event, ...m.notify.events[index] })),
    },

    releases: {
      ...m.releases,
      rows: RELEASE_ROWS.map((row, index) => ({ ...row, note: m.releases.rows[index].note })),
    },

    states: {
      title: m.states.title,
      sub: m.states.sub,
      colStaff: m.states.colStaff,
      colKitchen: m.states.colKitchen,
      colGuest: m.states.colGuest,
      colChannel: m.states.colChannel,
      note: m.states.note,
      all: m.states.all,
      offPremise: m.states.offPremise,
      dine: m.states.dine,
      delivery: m.states.delivery,
      pickup: m.states.pickup,
      rows: STATE_ROWS.map((row) => ({
        key: row.key,
        tone: row.tone,
        staff: m.states.staff[row.key],
        kitchen: optional(m.states.kitchen, row.key),
        guest: optional(m.states.guest, row.key),
        channels: row.channels,
      })),
    },

    policy: {
      on: m.policy.on,
      off: m.policy.off,
      readOnlyNote: m.policy.readOnly,
      svcValue: m.policy.svcValue,
      vatValue: m.policy.vatValue,
      vatUnset: m.policy.vatUnset,
      kdsValue: m.policy.kdsValue,
      discountValue: m.policy.discountValue,
      discountUnset: m.policy.discountUnset,
      groups: m.policy.groups.map((group, groupIndex) => ({
        title: group.title,
        rows: group.rows.map((row, rowIndex) => ({
          ...row,
          on: POLICY_SWITCHES[groupIndex][rowIndex],
        })),
      })),
    },

    appearance: m.appearance,
  };
}
