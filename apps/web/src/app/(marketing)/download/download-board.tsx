'use client';

import Link from 'next/link';
import { useLocale } from 'next-intl';
import { flash } from '@restaurant/ui';

import { StoreBadges } from '@/components/store-badges';

import type { Locale } from '@/i18n';

import { pagesCopy, type SitePages } from '../pages-copy';
import { CARD, EYEBROW, H2, LEDE, PageHead } from '../page-ui';
import {
  type AppManifest,
  DOWNLOAD_SURFACES,
  formatBuiltAt,
  formatMegabytes,
} from './download-data';

type Copy = SitePages['download'];

/**
 * `/download` — the page a restaurant owner is sent to during the onboarding
 * call, with the phone already in their hand.
 *
 * The design has no screen for this: `Smart Restaurant Sayt va PWA.dc.html`
 * makes the case for a PWA against a native app and draws the install sheet,
 * because when it was drawn there was no native build to hand out. So nothing
 * below is invented visual language — the furniture is this site's own
 * (`page-ui.tsx`, `marketing.css`), and the *tone* is that file's: it states
 * what a thing cannot do in the same sentence as what it can, which is why its
 * `limits` block exists at all.
 *
 * ---------------------------------------------------------------------------
 * Two states, and only two
 *
 * Either there is a published APK on this host or there is not, and
 * `parseManifest` collapses every partial case into the second. A page that
 * says "coming soon" over a grey button is the pattern this repo has already
 * refused once — `setup-steps.tsx` disables its QR button and says why, rather
 * than firing a toast about a PDF nothing renders. Here the honest empty state
 * is better than that, because there is a real install route that works today:
 * the PWA, on both platforms.
 *
 * The three Android steps render only beside a real file. "Tap the button
 * above" is not advice on a page with no button above, and a numbered
 * procedure for something that does not exist is how a support call starts.
 */
export function DownloadBoard({
  manifest,
  pageUrl,
}: {
  manifest: AppManifest | null;
  /** This page's own absolute URL, resolved on the server from `SITE_URL`. */
  pageUrl: string;
}) {
  const locale = useLocale() as Locale;
  const t = pagesCopy(locale).download;

  /* The clipboard, really — same as the contact page's four rows. A digest is
     64 characters that nobody retypes, and a "Copy" button that only looked
     like one would be the most annoying control on the page. */
  const copy = (value: string, said: string) => {
    void navigator.clipboard?.writeText(value);
    flash(said);
  };

  return (
    <>
      <section data-pagetop className="pt-[76px]">
        <div data-wrap>
          <PageHead eyebrow={t.eyebrow} title={t.h} lede={t.lede} />
          {/* The two badges everyone knows how to press, right under the
              title. The Android one is the file; the Apple one jumps to the
              iPhone steps below, because that is the only honest place it can
              go. */}
          <div className="mt-7">
            <StoreBadges copy={t.badges} apkHref={manifest?.url ?? null} iosHref="#iphone" />
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------- android ---- */}
      <section data-sec>
        <div data-wrap>
          <div className={EYEBROW}>{t.andEyebrow}</div>
          <h2 data-h2 className={H2}>
            {manifest === null ? t.noneH : t.andH}
          </h2>
          <p data-lede className={LEDE}>
            {manifest === null ? t.noneP : t.andP}
          </p>

          {manifest === null ? (
            <p className="text-fg-muted mt-5 max-w-[640px] text-[15px] leading-[1.65] text-pretty">
              {t.noneAlt}
            </p>
          ) : (
            <ReleaseCard manifest={manifest} t={t} onCopy={copy} />
          )}
        </div>
      </section>

      {/* --------------------------------------------------------- steps ---- */}
      {manifest === null ? null : (
        <section data-sec className="bg-bg-subtle border-y">
          <div data-wrap>
            <h2 data-h2 className={`${H2} mt-0`}>
              {t.stepsH}
            </h2>
            <p data-lede className={LEDE}>
              {t.stepsP}
            </p>

            <div data-three className="mt-11 grid grid-cols-3 gap-4">
              {t.steps.map((step, index) => (
                <div key={step.t} data-card className={`${CARD} p-[22px]`}>
                  <span
                    data-num
                    className="bg-brand-50 text-brand-700 grid size-7 place-items-center rounded-full font-mono text-[13px] font-bold"
                  >
                    {index + 1}
                  </span>
                  <div className="mt-3.5 text-[15px] leading-[1.35] font-semibold tracking-[-.01em]">
                    {step.t}
                  </div>
                  <p className="text-fg-muted mt-2 text-[13px] leading-[1.6] text-pretty">
                    {step.b}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ----------------------------------------------------------- ios ---- */}
      <section
        id="iphone"
        data-sec
        className={`scroll-mt-20 ${manifest === null ? 'bg-bg-subtle border-y' : 'border-b'}`}
      >
        <div data-wrap>
          <div data-two className="grid grid-cols-[1fr_420px] items-start gap-14">
            <div>
              <div className={EYEBROW}>{t.iosEyebrow}</div>
              <h2 data-h2 className={H2}>
                {t.iosH}
              </h2>
              <p data-lede className={LEDE}>
                {t.iosP}
              </p>
              <p className="text-fg-subtle mt-4 max-w-[640px] text-[13px] leading-[1.6] text-pretty">
                {t.iosNote}
              </p>
            </div>

            {/*
             * The same three steps `install-prompt.tsx` shows an iPhone, and
             * deliberately the same words: that component is what a guest sees
             * inside the customer app, this is what an owner reads on the
             * website, and two descriptions of one gesture is how one of them
             * ends up naming a menu item Safari renamed.
             */}
            <div className={`${CARD} p-[26px]`}>
              <ol className="grid gap-3.5">
                {t.iosSteps.map((step, index) => (
                  <li key={step} className="flex items-start gap-3">
                    <span
                      data-num
                      className="bg-bg-muted text-fg-muted mt-px grid size-5 flex-none place-items-center rounded-full font-mono text-[11px] font-bold"
                    >
                      {index + 1}
                    </span>
                    <span className="text-[14px] leading-[1.5]">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------ surfaces ---- */}
      <section data-sec className="border-b">
        <div data-wrap>
          <div className={EYEBROW}>{t.surfEyebrow}</div>
          <h2 data-h2 className={H2}>
            {t.surfH}
          </h2>
          <p data-lede className={LEDE}>
            {t.surfP}
          </p>

          <div className="mt-11 grid grid-cols-[repeat(auto-fit,minmax(min(230px,100%),1fr))] gap-4">
            {t.surfaces.map((surface, index) => {
              const shape = DOWNLOAD_SURFACES[index];

              const inside = (
                <>
                  <span
                    aria-hidden
                    className="bg-brand-50 text-brand-700 font-display grid size-10 place-items-center rounded-[11px] text-[13px] font-bold"
                  >
                    {shape?.mark}
                  </span>
                  <div className="mt-3.5 text-[15px] font-semibold tracking-[-.01em]">
                    {surface.name}
                  </div>
                  <p className="text-fg-muted mt-1.5 text-[13px] leading-[1.55] text-pretty">
                    {surface.body}
                  </p>
                </>
              );

              /*
               * A card is a link only where there is somewhere to go.
               *
               * Three of these open in a browser, and that is not decoration:
               * the iPhone section above tells a reader to open the page they
               * want in Safari, and these are the pages. The fourth is the QR
               * guest, whose route is `/qr/[restaurant]/[table]` — one table in
               * one restaurant. There is no `/qr`, so a card linking there
               * would 404 on this site's newest public page.
               */
              return shape?.href == null ? (
                <div key={surface.name} data-card className={`${CARD} p-[22px]`}>
                  {inside}
                </div>
              ) : (
                <Link
                  key={surface.name}
                  data-card
                  data-press
                  href={shape.href}
                  className={`${CARD} text-fg block p-[22px]`}
                >
                  {inside}
                </Link>
              );
            })}
          </div>

          <p className="text-fg-subtle mt-6 max-w-[640px] text-[13px] leading-[1.6] text-pretty">
            {t.surfNote}
          </p>
        </div>
      </section>

      {/* ---------------------------------------------------------- link ---- */}
      {/*
       * The address, large and monospaced, rather than a QR code.
       *
       * A QR was the first plan and it was dropped on purpose. Drawing one
       * without a dependency means writing the encoder — Reed-Solomon over
       * GF(256), block interleaving, the mask and its BCH format bits — and
       * nothing in this repo or on this machine can verify the result: there is
       * no decoder here to scan it back. An encoder that is subtly wrong
       * produces a square that looks exactly like a QR code and scans to
       * nothing, on a page whose entire promise is "this exact file". That is
       * the same failure as a button that does not work, so the honest control
       * is the one below: an address a person can read across a desk, and a
       * button that really copies it.
       */}
      <section data-sec>
        <div data-wrap>
          <div className={`${CARD} p-[30px]`}>
            <div className="text-[17px] font-semibold tracking-[-.012em]">{t.linkH}</div>
            <p className="text-fg-muted mt-2 max-w-[520px] text-[14px] leading-[1.6] text-pretty">
              {t.linkP}
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <code
                data-num
                className="bg-bg-subtle border-border text-fg inline-flex min-h-12 items-center rounded-[11px] border px-4 font-mono text-[17px] leading-[1.4] break-all"
              >
                {pageUrl}
              </code>

              <button
                type="button"
                data-btn-quiet
                data-press
                onClick={() => copy(pageUrl, t.linkCopied)}
                className="border-border-strong bg-surface text-fg h-12 flex-none cursor-pointer rounded-[11px] border px-[18px] text-[14px] font-semibold"
              >
                {t.linkCopy}
              </button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

/**
 * The published build: one button, then everything a careful reader needs to
 * check it is the file we say it is.
 *
 * Version, size and date answer "is this newer than what I have"; the two
 * digests answer "is this ours". `srcp-apk` refuses to publish an APK signed
 * with anything but the release key and writes that certificate's digest into
 * the manifest, so the signer row is not decoration — it is the one value that
 * survives a compromised download.
 */
function ReleaseCard({
  manifest,
  t,
  onCopy,
}: {
  manifest: AppManifest;
  t: Copy;
  onCopy: (value: string, said: string) => void;
}) {
  const built = formatBuiltAt(manifest.builtAt);

  const facts: readonly { label: string; value: string }[] = [
    { label: t.verLbl, value: manifest.version },
    { label: t.sizeLbl, value: `${formatMegabytes(manifest.sizeBytes)} ${t.sizeUnit}` },
    // `formatBuiltAt` already returned a string during parsing, or the manifest
    // would have been rejected — the fallback is for the type, not for a case.
    { label: t.builtLbl, value: built ?? manifest.builtAt },
    { label: t.minLbl, value: manifest.minAndroid },
    { label: t.pkgLbl, value: manifest.package },
  ];

  return (
    <div className={`${CARD} mt-8 p-[30px]`}>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        {/*
         * A real anchor with `download`, not a button that calls a script.
         *
         * The href is the manifest's own `url`, which `parseManifest` has
         * already held to `/downloads/…` — the path nginx serves the file from,
         * with the Android package MIME type set. That type is what makes
         * Chrome offer to install rather than just save, and it is set there
         * rather than here because the response header is nginx's to write.
         */}
        <a
          data-btn-brand
          data-press
          href={manifest.url}
          download={manifest.file}
          className="bg-brand-500 inline-flex h-13 items-center rounded-[12px] px-[26px] text-[15px] font-semibold text-white"
        >
          {t.andBtn}
        </a>

        <span className="text-fg-subtle text-[13px] leading-[1.5]">{t.andNotPlay}</span>
      </div>

      <dl className="mt-7 grid grid-cols-[repeat(auto-fit,minmax(min(170px,100%),1fr))] gap-x-5 gap-y-5 border-t pt-6">
        {facts.map((fact) => (
          <div key={fact.label}>
            <dt className="tracking-caps text-fg-subtle text-xs font-semibold uppercase">
              {fact.label}
            </dt>
            <dd data-num className="text-fg mt-1.5 font-mono text-[14px] break-all">
              {fact.value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-6 grid gap-5 border-t pt-6">
        <Digest
          label={t.sumLbl}
          note={t.sumP}
          value={manifest.sha256}
          action={t.copy}
          said={t.copied}
          onCopy={onCopy}
        />
        <Digest
          label={t.signerLbl}
          note={t.signerP}
          value={manifest.signerSha256}
          action={t.copy}
          said={t.copied}
          onCopy={onCopy}
        />
      </div>
    </div>
  );
}

/** Sixty-four characters, wrapped, with the one control that makes them usable. */
function Digest({
  label,
  note,
  value,
  action,
  said,
  onCopy,
}: {
  label: string;
  note: string;
  value: string;
  action: string;
  said: string;
  onCopy: (value: string, said: string) => void;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="tracking-caps text-fg-subtle text-xs font-semibold uppercase">
          {label}
        </span>

        <button
          type="button"
          data-press
          onClick={() => onCopy(value, said)}
          className="border-border-strong bg-surface text-fg-muted hover:bg-bg-muted h-[34px] flex-none cursor-pointer rounded-[9px] border px-3.5 text-[13px] font-semibold whitespace-nowrap"
        >
          {action}
        </button>
      </div>

      <code
        data-num
        className="bg-bg-subtle border-border text-fg-muted mt-2.5 block rounded-[10px] border px-3.5 py-3 font-mono text-[13px] leading-[1.6] break-all"
      >
        {value}
      </code>

      <p className="text-fg-subtle mt-2 max-w-[640px] text-[13px] leading-[1.6] text-pretty">
        {note}
      </p>
    </div>
  );
}
