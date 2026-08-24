/**
 * The chrome around the paper — and only the chrome.
 *
 * `Smart Restaurant OS - Hujjatlar.dc.html` is the one design file in this
 * handoff with **no `P("uz","ru","en")` table**: every other file carries its
 * copy in three languages, this one is written in Uzbek throughout. That is not
 * an oversight to be patched by translating it. A fiscal receipt, a Z report
 * and a payslip are documents of one jurisdiction, and their wording is settled
 * by the tax office and the labour code rather than by a product decision — so
 * `documents-data.ts` prints exactly the Uzbek the file draws, and nothing here
 * translates it.
 *
 * What *is* trilingual is the surface a manager stands in front of to choose a
 * document and press print. Two kinds of string live here and they are marked
 * apart on purpose:
 *
 *   **Sourced.** The seven document names and the print verb exist elsewhere in
 *   the design in all three languages; each carries the file and line it was
 *   read from, so a wording change there is traceable to here.
 *
 *   **New.** The design never drew this switcher — the handoff is a deck of
 *   seven sheets, not an application screen — so the lede, the paper notes and
 *   the Uzbek-only warning had to be written. They are marked NEW and are the
 *   only strings on this surface nobody can point at a design line for.
 *
 * They live here rather than in `src/i18n/*.ts` because the seven document
 * names are the switcher, and the switcher is this surface — the console
 * catalogue would carry them for one screen and one screen only.
 */

import type { DocumentKey } from './documents-data';

export type Lang = 'uz' | 'ru' | 'en';

export type Trilingual = Readonly<Record<Lang, string>>;

export const say = (text: Trilingual, lang: Lang): string => text[lang];

/** Narrow whatever `getLocale()` answered to the three the catalogues carry. */
export const langOf = (locale: string): Lang =>
  locale === 'ru' || locale === 'en' ? locale : 'uz';

/**
 * The seven names, as the rest of the design already says them.
 *
 * Line references are into `docs/design/source/Smart Restaurant OS.dc.html`,
 * which is where the console's own trilingual table lives.
 */
export const DOCUMENT_NAMES = {
  /** `bkT5` :9666 — the ledger's own tab for this material. */
  index: { uz: 'Hujjatlar', ru: 'Документы', en: 'Documents' },
  /** :12504 — "Mijoz cheki va Z-hisobot" / "Чек клиента и Z-отчёт". */
  receipts: { uz: 'Mijoz cheki', ru: 'Чек клиента', en: 'Guest receipt' },
  /** `tlZ` :9579 — "Z-hisobot va yopish", trimmed to the document. */
  z: { uz: 'Z-hisobot', ru: 'Z-отчёт', en: 'Z report' },
  /** `attn1cta` :9913 — "Xarid buyurtmasi tuzish" / "Создать заказ поставщику". */
  invoice: { uz: 'Xarid buyurtmasi', ru: 'Заказ поставщику', en: 'Purchase order' },
  /** `opT2` :9498 and `bStockCount` :10117 agree. */
  'stock-count': { uz: 'Inventarizatsiya', ru: 'Инвентаризация', en: 'Stock count' },
  /** `pSlip` :9141 — the payroll screen's own name for this sheet. */
  payslip: { uz: 'Maosh varaqasi', ru: 'Расчётный лист', en: 'Payslip' },
  /** `plTitle` :10161. */
  'profit-loss': { uz: 'Foyda va zarar', ru: 'Прибыли и убытки', en: 'Profit and loss' },
} as const satisfies Readonly<Record<string, Trilingual>>;

export const DOCUMENT_COPY = {
  /** `rvPrint` :9297, `tlPrint` :9598 and `rcPrint` :9995 all agree. */
  print: { uz: 'Chop etish', ru: 'Печать', en: 'Print' },

  /** NEW — composed from `rvPrint` :9297 and `bkT5` :9666. */
  title: { uz: 'Chop etiladigan hujjatlar', ru: 'Печатные документы', en: 'Printable documents' },

  /** NEW. */
  lede: {
    uz: "Hujjatni tanlang va chop eting. Qog'oz o'lchami hujjatga qarab o'zgaradi.",
    ru: 'Выберите документ и распечатайте. Размер бумаги зависит от документа.',
    en: 'Pick a document and print it. The paper size follows the document.',
  },

  /**
   * NEW. Said out loud rather than left for a reader to discover at the printer.
   *
   * A manager who sends a Z report to the A4 tray gets a 210 mm sheet with an
   * 80 mm strip up its left edge and no way to tell whether that was the
   * document or the setup.
   */
  paperNote: {
    uz: 'Bu hujjat 80 mm termal printerga chiqadi',
    ru: 'Этот документ печатается на 80 мм термопринтере',
    en: 'This document prints on the 80 mm thermal printer',
  },

  /** NEW. */
  a4Note: {
    uz: 'Bu hujjat A4 ga chiqadi',
    ru: 'Этот документ печатается на A4',
    en: 'This document prints on A4',
  },

  /**
   * NEW. The surface says the documents are Uzbek, because it is the one thing a
   * Russian-reading accountant will otherwise assume is broken.
   */
  uzbekOnly: {
    uz: "Hujjatlarning o'zi faqat o'zbekcha chop etiladi — matni soliq va mehnat hujjatlariniki.",
    ru: 'Сами документы печатаются только на узбекском — их текст задан налоговыми и трудовыми нормами.',
    en: 'The documents themselves print in Uzbek only — their wording is set by tax and labour rules.',
  },

  /** The label on the links added to the till, the ledger and the store room. */
  openDocument: { uz: 'Chop etish', ru: 'Печать', en: 'Print' },

  /**
   * NEW — the three states a sheet can be in, said out loud above it.
   *
   * This is the one line on the surface that is not a convenience. Every other
   * console screen that falls back to fixtures shows a person numbers they will
   * forget; this one shows them a document they are about to **print**, and once
   * it is on paper nothing distinguishes a specimen from a record. A Z with the
   * design's 17 672 600 on it, signed by a cashier and filed, is the failure
   * this line exists to prevent — and it costs a sentence.
   *
   * They stay here rather than in `src/i18n/*.ts` for the same reason the seven
   * document names do: they are about this surface and no other.
   */
  specimen: {
    uz: 'Namunaviy hujjat — raqamlar dizayndan olingan',
    ru: 'Образец документа — цифры взяты из макета',
    en: 'Specimen document — the figures come from the design',
  },

  /** NEW. */
  liveSheet: {
    uz: 'Jonli hujjat — serverdan',
    ru: 'Реальный документ — с сервера',
    en: 'Live document — from the server',
  },

  /**
   * NEW. Incomplete is its own state, not a shade of live.
   *
   * A payslip whose deductions could not be read is worth printing to check the
   * hours on and is not worth handing to the employee, and only the reader can
   * make that call — so they are told rather than guessed for.
   */
  partialSheet: {
    uz: "Qisman jonli — hujjatning bir qismi tizimda yo'q",
    ru: 'Частично реальный — части документа нет в системе',
    en: 'Partly live — part of this document is not in the system',
  },

  /**
   * NEW — and deliberately not `specimen`.
   *
   * Two sheets on this surface have no specimen to fall back to: a settlement
   * and a standard report. Both are made entirely of somebody's money, and a
   * drawn-from-the-design version of either is a real letterhead over invented
   * figures. So when the read comes back empty they print nothing and say this
   * instead — which is a different sentence from "these numbers are a sample",
   * because there are no numbers at all.
   */
  noSheet: {
    uz: "Ma'lumot yo'q — hujjat chop etilmaydi",
    ru: 'Нет данных — документ не печатается',
    en: 'No data — nothing to print',
  },

  /** NEW. Prefixes the parameter that would make the specimen a real document. */
  specimenHint: {
    uz: 'jonli hujjat uchun',
    ru: 'для реального документа',
    en: 'for the real document',
  },
} as const satisfies Readonly<Record<string, Trilingual>>;

/**
 * The way in, for the three console screens that produce these documents.
 *
 * A helper rather than three hand-written labels, because the alternative is a
 * new i18n key per entry point for a phrase that is already two design-sourced
 * words: the print verb and the document's own name. It also keeps the change
 * to `finance/till`, `finance/books` and `inventory` down to one import and one
 * link each — those files are not this feature's, and this feature has no
 * business reshaping them.
 */
export type DocumentName = keyof typeof DOCUMENT_NAMES;

/**
 * The query parameter that names each document's subject.
 *
 * `?d=z` is the specimen the design drew; `?d=z&shift=318` is the Z of shift
 * 318. The map is the contract between three parties — a reader typing an
 * address, the screens that link here, and the reads in `documents-server.ts` —
 * and it lives beside `documentHref` because URL shape is what this module
 * already owns.
 *
 * Here rather than in `documents-data.ts` for a second reason: `finance/books`
 * is a client component and imports this file, so anything it reaches for is in
 * a browser bundle. A map of seven short strings belongs there; a thousand lines
 * of specimen figures does not.
 *
 * `stock-count` takes a store room rather than a branch because that is what an
 * ingredient carries — `store` is `main | kitchen | bar`, and which venue's
 * shelves a reader may count is already settled by their token.
 */
export const LIVE_PARAM: Readonly<Record<DocumentKey, string | null>> = {
  index: null,
  receipts: 'bill',
  z: 'shift',
  invoice: 'po',
  'stock-count': 'store',
  payslip: 'member',
  /*
   * A calendar month, not a period word.
   *
   * It was `period` and it took `today | week | month` — the analytics module's
   * whole vocabulary, where `month` means the trailing thirty trading days. A
   * statement is headed with a month's name and filed against that month's
   * return, so `?d=profit-loss&month=2026-07` is the only address that can mean
   * what the sheet claims.
   */
  'profit-loss': 'month',
};

/**
 * The address of a document, and optionally of *which one*.
 *
 * `documentHref('z')` opens the specimen the design drew; `documentHref('z',
 * '318')` opens the Z of shift 318. The subject's parameter name comes from
 * `LIVE_PARAM` rather than from the caller, so a screen linking here has to know
 * one thing — the id it is already holding — and cannot spell the parameter
 * wrong and silently land on a specimen.
 *
 * Optional because the three existing entry points pass none yet: the till, the
 * ledger and the store room each hold the id their document wants, and adding it
 * is a one-argument change in a file this feature does not own.
 *
 * The parameter comes from `LIVE_PARAM` above rather than from the caller, so a
 * screen linking here has to know one thing — the id it is already holding — and
 * cannot spell the parameter wrong and land on a specimen without noticing.
 */
export const documentHref = (key: DocumentName, subject?: string | number): string => {
  const parameter = LIVE_PARAM[key];

  if (subject === undefined || parameter === null || `${subject}` === '') {
    return `/documents?d=${key}`;
  }

  return `/documents?d=${key}&${parameter}=${encodeURIComponent(subject)}`;
};

export const printLink = (key: DocumentName, lang: Lang): string =>
  `${say(DOCUMENT_COPY.print, lang)} · ${say(DOCUMENT_NAMES[key], lang)}`;
