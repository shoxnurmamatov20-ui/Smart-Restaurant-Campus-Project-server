'use client';

import { useMemo, useRef, useState } from 'react';
import { flash } from '@restaurant/ui';
import { dishImageFrom, type DishImage } from '@restaurant/surfaces/media/image';

import { DishPhoto } from '@/components/dish-photo';
import { apiId, post } from '@/lib/console-post';
import { shrinkPhoto } from '@/lib/shrink-photo';

import type { MenuScreenRow } from './menu-server';
import { PhotoCropper, type CropperLabels } from './photo-cropper';
import { EDITOR_COPY, say, type Lang } from './prep-data';

/**
 * The items tab: search, category chips, a result count, and the editor.
 *
 * `specs/01-os.md §5.6` asks for all four and the module had none of them —
 * one static table. The search is the one that earns its place: a restaurant
 * with two hundred dishes has a manager who is looking for *one*, and scrolling
 * a two-hundred-row table to change a price is how prices stop getting changed.
 *
 * **Search matches all three locales.** A dish stored as `{uz, ru, en}` is
 * findable by whichever name the person typing knows, which is not always the
 * one the console is currently rendering — a Russian-speaking manager on an
 * Uzbek console types «Плов». The seam already resolves one name for display,
 * so the other two are passed alongside rather than re-fetched.
 *
 * The editor is a drawer rather than a page: a manager changing four prices
 * should not lose the filter they set to find them.
 */
export function MenuItems({
  rows,
  categories,
  money,
  labels,
  lang,
  photoFilter = false,
}: {
  rows: readonly (MenuScreenRow & { search: string })[];
  /** Category label and how many rows carry it, in menu order. */
  categories: readonly { label: string; count: number }[];
  money: Readonly<Record<string, string>>;
  labels: Record<string, string>;
  lang: Lang;
  /**
   * Open on the dishes with no photograph — `/menu?filter=no-photo`.
   *
   * The site screen counts them and its "fix them all" button links here. That
   * button used to raise a toast naming a number and then leave the person on
   * a page with no way to act on it; the list of exactly those dishes, on the
   * screen where the uploader lives, is the thing it was pointing at.
   */
  photoFilter?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [noPhoto, setNoPhoto] = useState(photoFilter);
  const [open, setOpen] = useState<MenuScreenRow | null>(null);

  const withoutPhoto = rows.filter((row) => row.imageUrl === null).length;

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return rows.filter((row) => {
      if (category !== null && row.categoryLabel !== category) return false;
      if (noPhoto && row.imageUrl !== null) return false;

      return needle === '' || row.search.includes(needle);
    });
  }, [rows, query, category, noPhoto]);

  const COLUMNS = '[grid-template-columns:minmax(0,1.5fr)_minmax(0,1fr)_110px_110px_92px_120px]';

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={labels.search}
          aria-label={labels.search}
          className="bg-surface border-border h-9 min-w-[220px] flex-1 rounded-md border px-3 text-sm"
        />

        <button
          type="button"
          onClick={() => {
            setCategory(null);
            setNoPhoto(false);
          }}
          className={`rounded-pill border px-3.5 py-1.5 text-sm font-medium ${
            category === null && !noPhoto
              ? 'border-brand-500 bg-brand-500 text-white'
              : 'bg-surface'
          }`}
        >
          {labels.all}
        </button>

        {/*
         * Drawn only while it is on, which is why it is not a chip beside the
         * categories: an always-present "no photograph" filter would be a
         * control for a job most people opening this screen are not doing. It
         * arrives from the site screen's link and it says how many rows it is
         * holding back, so pressing it off is an informed act.
         */}
        {noPhoto ? (
          <button
            type="button"
            onClick={() => setNoPhoto(false)}
            className="rounded-pill border-brand-500 bg-brand-500 border px-3.5 py-1.5 text-sm font-medium text-white"
          >
            {labels.photo}{' '}
            <span data-num className="opacity-70">
              {withoutPhoto}
            </span>
          </button>
        ) : null}

        {categories.map((entry) => (
          <button
            key={entry.label}
            type="button"
            onClick={() => setCategory(entry.label)}
            className={`rounded-pill border px-3.5 py-1.5 text-sm font-medium ${
              category === entry.label ? 'border-brand-500 bg-brand-500 text-white' : 'bg-surface'
            }`}
          >
            {entry.label}{' '}
            <span data-num className="opacity-70">
              {entry.count}
            </span>
          </button>
        ))}
      </div>

      {/* The count, which is what tells somebody their filter did something. */}
      <p className="text-fg-subtle mb-2.5 text-xs">
        {labels.showing
          .replace('{n}', String(shown.length))
          .replace('{total}', String(rows.length))}
      </p>

      <div data-table className="bg-surface overflow-hidden rounded-lg border">
        <div
          className={`bg-bg-subtle text-fg-subtle grid ${COLUMNS} gap-4 border-b px-5 py-[11px] text-xs font-semibold tracking-wide`}
        >
          <span>{labels.colItem}</span>
          <span>{labels.colCategory}</span>
          <span className="text-right">{labels.colPrice}</span>
          <span className="text-right">{labels.colCost}</span>
          <span className="text-right">{labels.colMargin}</span>
          <span>{labels.colState}</span>
        </div>

        {shown.length === 0 ? (
          <div className="px-5 py-14 text-center">
            <p className="text-sm font-semibold">{labels.emptyFilter}</p>
            <p className="text-fg-subtle mx-auto mt-1.5 max-w-[44ch] text-xs leading-normal">
              {labels.emptyFilterSub}
            </p>
          </div>
        ) : (
          shown.map((row) => (
            <button
              key={row.id}
              type="button"
              data-row
              onClick={() => setOpen(row)}
              className={`border-divider hover:bg-bg-subtle grid w-full ${COLUMNS} items-center gap-4 border-b px-5 py-3 text-left`}
            >
              <span className="flex min-w-0 items-center gap-3">
                {/*
                 * The plate, beside the name — 40px of `thumb`, five kilobytes
                 * a row. This is the screen the "dishes without a photograph"
                 * link lands on, and a manager scanning two hundred rows for
                 * the ones with a grey square finds them without opening each.
                 */}
                <DishPhoto
                  image={row.image}
                  alt=""
                  sizes="40px"
                  className="size-10 flex-none rounded-[8px]"
                  fallback={
                    <span
                      aria-hidden
                      className="bg-bg-muted text-fg-subtle grid size-10 flex-none place-items-center rounded-[8px]"
                    >
                      <PhotoGlyph />
                    </span>
                  }
                />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{row.name}</span>
                  <span className="text-fg-subtle block text-xs">{row.stationLabel}</span>
                </span>
              </span>

              <span className="text-fg-muted truncate text-sm">{row.categoryLabel}</span>
              <span data-num className="text-right text-sm font-semibold">
                {money[`price_${row.id}`]}
              </span>
              <span data-num className="text-fg-muted text-right text-sm">
                {money[`cost_${row.id}`]}
              </span>
              <span data-num className="text-right text-sm font-medium">
                {money[`margin_${row.id}`]}
              </span>

              <span>
                <span
                  className={`rounded-pill text-2xs px-2.5 py-1 font-semibold ${
                    row.available
                      ? 'bg-success-50 text-success-700'
                      : 'bg-danger-50 text-danger-700'
                  }`}
                >
                  {row.available ? labels.onSale : labels.stopped}
                </span>
              </span>
            </button>
          ))
        )}
      </div>

      {open === null ? null : (
        <ItemEditor
          item={open}
          money={money}
          labels={labels}
          lang={lang}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}

/**
 * One dish, opened.
 *
 * Three name fields, not one. A dish stored as `{uz, ru, en}` is only as good
 * as the worst-filled of the three: a menu with Uzbek names and empty Russian
 * ones renders blank rows on half the guest surfaces, and the way to stop that
 * is to put all three in front of whoever is typing.
 */
function ItemEditor({
  item,
  money,
  labels,
  lang,
  onClose,
}: {
  item: MenuScreenRow;
  money: Readonly<Record<string, string>>;
  labels: Record<string, string>;
  lang: Lang;
  onClose: () => void;
}) {
  /*
   * Opened with what is stored, not with one field filled and two blank.
   *
   * The drawer used to seed `{uz: item.name, ru: '', en: ''}` and send all
   * three on save — which on a live dish would have wiped the Russian and
   * English somebody typed, silently, as the price of correcting a typo. The
   * seam now carries the whole `{uz, ru, en}` column beside the resolved name;
   * the fallback is for a fixture row, which genuinely has only the one.
   */
  const [names, setNames] = useState<Record<Lang, string>>({
    uz: item.names?.uz ?? item.name,
    ru: item.names?.ru ?? '',
    en: item.names?.en ?? '',
  });
  const name = names.uz;
  const [price, setPrice] = useState(money[`priceRaw_${item.id}`] ?? '');
  const [cost, setCost] = useState(money[`costRaw_${item.id}`] ?? '');
  const [saving, setSaving] = useState(false);

  /*
   * The photograph.
   *
   * Its own upload rather than a field on save, and that is a decision about
   * failure: a menu edit is a form somebody filled in, an upload is a file over
   * a phone connection that drops halfway. Folded together, a failed upload
   * loses the price typed above it.
   *
   * `photo` is what the drawer currently shows — the stored set until a new
   * one lands, then the set the API answered with, so a manager sees the
   * picture they just chose without waiting for the table behind the drawer
   * to re-render.
   */
  const [photo, setPhoto] = useState<DishImage | null>(item.image);
  const [phase, setPhase] = useState<'idle' | 'shrinking' | 'uploading' | 'removing'>('idle');
  const [dragging, setDragging] = useState(false);
  const picker = useRef<HTMLInputElement>(null);

  /*
   * What the cropper is open on: the file just chosen, or the address of the
   * photograph already held (its `full` rendition, so a re-crop works from
   * the most pixels the platform kept). Null while it is closed.
   *
   * Every new file goes through it. The default shape is the photograph's
   * own, so a manager who wants the picture as it is presses Save and gets
   * exactly that — and one who uploaded it sideways last week turns it here
   * without finding the original again.
   */
  const [cropping, setCropping] = useState<File | string | null>(null);

  const busy = phase !== 'idle';

  const cropperLabels: CropperLabels = {
    title: labels.cropTitle,
    hint: labels.cropHint,
    original: labels.cropOriginal,
    zoom: labels.cropZoom,
    turnLeft: labels.cropTurnLeft,
    turnRight: labels.cropTurnRight,
    apply: labels.cropApply,
    cancel: labels.cropCancel,
    loading: labels.cropLoading,
    loadFailed: labels.cropLoadFailed,
    saveFailed: labels.cropSaveFailed,
  };

  async function upload(chosen: File) {
    // Shrunk in the browser first — a 6 MB camera original becomes a few
    // hundred kilobytes before it leaves the phone. The API does its own
    // sizing either way; this is about the twenty seconds of spinner.
    setPhase('shrinking');
    const { file } = await shrinkPhoto(chosen);

    setPhase('uploading');

    try {
      const body = new FormData();
      body.append('image', file, file.name);

      const response = await fetch(`/api/menu/image?id=${item.id}`, { method: 'POST', body });

      if (!response.ok) throw new Error(String(response.status));

      const { data } = (await response.json()) as {
        data: { image: Parameters<typeof dishImageFrom>[0]; image_url: string | null };
      };

      setPhoto(dishImageFrom(data.image, data.image_url));
      flash(`${item.name} · ${labels.photoSaved}`);
    } catch {
      // The API refuses anything over 12 MB, anything that is not a JPEG, PNG
      // or WebP, and anything it cannot decode.
      flash.problem(labels.photoFailed);
    } finally {
      setPhase('idle');
    }
  }

  async function removePhoto() {
    setPhase('removing');

    try {
      const response = await fetch(`/api/menu/image?id=${item.id}`, { method: 'DELETE' });

      if (!response.ok) throw new Error(String(response.status));

      setPhoto(null);
      flash(`${item.name} · ${labels.photoRemoved}`);
    } catch {
      flash.problem(labels.photoFailed);
    } finally {
      setPhase('idle');
    }
  }

  /** One file from a pick or a drop, into the cropper; anything that is not an image is ignored. */
  function take(files: FileList | null | undefined) {
    const file = files?.[0];

    if (file !== undefined && file.type.startsWith('image/')) setCropping(file);
  }

  /* Digits only, and parsed the same way the design's `num()` does it: a
     manager typing "42 000" or "42,000" means the same number either way. */
  const digits = (value: string): number => Number.parseInt(value.replace(/[^0-9]/g, ''), 10) || 0;

  async function save() {
    if (name.trim() === '') {
      flash.problem(say(EDITOR_COPY.needName, lang));

      return;
    }

    if (digits(price) <= 0) {
      flash.problem(say(EDITOR_COPY.needPrice, lang));

      return;
    }

    if (digits(cost) >= digits(price)) {
      flash.problem(say(EDITOR_COPY.costTooHigh, lang));

      return;
    }

    const told = `${name.trim()} · ${say(EDITOR_COPY.saved, lang)}`;
    const id = apiId(item.id);

    if (id === null) {
      // A fixture row. The drawer still does its arithmetic and says so, which
      // is what the demo console is for — and the note above the button has
      // already told the reader nothing is stored.
      flash(told);
      onClose();

      return;
    }

    setSaving(true);

    /*
     * All three names in one write, and the money in tiyin.
     *
     * The multiplication happens here rather than in the route handler because
     * it is a fact about this field — a manager types so'm, the platform
     * stores tiyin — and doing it twice is two roundings of one figure.
     */
    const answer = await post(
      '/api/menu/items',
      {
        id,
        names: { uz: name.trim(), ru: names.ru.trim(), en: names.en.trim() },
        price: digits(price) * 100,
        // Null when the field is blank, not zero. A dish nobody has costed yet
        // reports no margin; a dish costed at zero claims a 100% one, and that
        // is a number somebody would act on.
        cost: cost.trim() === '' ? null : digits(cost) * 100,
      },
      lang,
    );

    setSaving(false);

    if (!answer.ok) {
      // The API's own sentence when it sent one — it carries the reason in the
      // reader's language, which is more use than anything this screen could
      // invent. The dish name is the fallback: red, and it names the row.
      flash.problem(answer.message ?? name.trim());

      return;
    }

    flash(told);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex justify-end"
      style={{ background: 'rgba(15,19,32,.4)' }}
      onClick={onClose}
      role="presentation"
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={item.name}
        onClick={(event) => event.stopPropagation()}
        data-scroll
        className="bg-surface-raised flex h-full w-[440px] max-w-full flex-col overflow-y-auto border-l p-6"
      >
        <header className="flex items-start justify-between gap-3">
          <h3 className="font-display text-xl font-semibold tracking-tight">{item.name}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={labels.close}
            className="text-fg-muted hover:bg-bg-muted grid size-8 flex-none place-items-center rounded-md"
          >
            ✕
          </button>
        </header>

        <div className="mt-5 flex flex-col gap-3">
          {(['uz', 'ru', 'en'] as const).map((code) => (
            <label key={code} className="block">
              <span className="text-fg-subtle mb-1.5 block text-xs uppercase">{code}</span>
              <input
                value={names[code]}
                onChange={(event) =>
                  setNames((current) => ({ ...current, [code]: event.target.value }))
                }
                placeholder={item.name}
                className="bg-bg-subtle border-border h-11 w-full rounded-md border px-3.5 text-sm"
              />
            </label>
          ))}
        </div>

        {/*
         * The picture, above the numbers.
         *
         * Only when there is a server behind the screen: on fixtures the
         * button would post a file into a 401, and a control that cannot work
         * is worse than one that is not there. See `isServerRow`.
         */}
        {!isServerRow(item.id) ? null : (
          <div className="border-divider mt-5 border-t pt-4">
            <p className="text-sm font-medium">{labels.photo}</p>

            {/*
             * A drop zone that is also a button. A manager at a desk drags the
             * file from the photographer's folder; a manager on a phone taps
             * and the picker opens the camera roll. Both land in `take()`.
             *
             * The preview is `card` (640px) drawn at 96 — what the guest menu
             * shows — so what the manager approves here is what a guest sees,
             * not a full-size file that hides a soft focus until it is drawn
             * small.
             */}
            <div
              role="button"
              tabIndex={0}
              aria-label={labels.photoChoose}
              aria-busy={busy}
              onClick={() => (busy ? undefined : picker.current?.click())}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  if (!busy) picker.current?.click();
                }
              }}
              onDragOver={(event) => {
                event.preventDefault();
                if (!dragging) setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                if (!busy) take(event.dataTransfer.files);
              }}
              className={`mt-2 flex cursor-pointer items-center gap-4 rounded-lg border border-dashed p-3 transition-colors ${
                dragging ? 'border-brand-500 bg-brand-50' : 'border-border-strong bg-bg-subtle'
              } ${busy ? 'opacity-70' : ''}`}
            >
              <DishPhoto
                image={photo}
                alt=""
                sizes="96px"
                className="size-24 flex-none rounded-md"
                fallback={
                  <span
                    aria-hidden
                    className="bg-bg-muted text-fg-subtle grid size-24 flex-none place-items-center rounded-md"
                  >
                    <PhotoGlyph size={28} />
                  </span>
                }
              />

              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">
                  {phase === 'shrinking'
                    ? labels.photoShrinking
                    : phase === 'uploading'
                      ? labels.photoUploading
                      : photo === null
                        ? labels.photoNone
                        : labels.photoDrop}
                </p>
                <p className="text-fg-subtle mt-0.5 text-xs leading-normal">{labels.photoHint}</p>

                <div className="mt-2.5 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={(event) => {
                      event.stopPropagation();
                      picker.current?.click();
                    }}
                    className="bg-surface h-9 rounded-md border px-3.5 text-sm font-medium disabled:opacity-50"
                  >
                    {labels.photoChoose}
                  </button>

                  {photo === null ? null : (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={(event) => {
                          event.stopPropagation();
                          setCropping(photo.sizes.full?.url ?? photo.src);
                        }}
                        className="bg-surface h-9 rounded-md border px-3.5 text-sm font-medium disabled:opacity-50"
                      >
                        {labels.cropEdit}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={(event) => {
                          event.stopPropagation();
                          void removePhoto();
                        }}
                        className="text-danger-700 h-9 rounded-md border border-transparent px-3.5 text-sm font-medium disabled:opacity-50"
                      >
                        {labels.photoRemove}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>

            <input
              ref={picker}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(event) => {
                const files = event.target.files;

                // Cleared so choosing the same file twice fires again — a
                // manager who re-crops and re-picks expects the second one to
                // upload.
                take(files);
                event.target.value = '';
              }}
            />

            {cropping === null ? null : (
              <PhotoCropper
                source={cropping}
                labels={cropperLabels}
                onCancel={() => setCropping(null)}
                onDone={(file) => {
                  setCropping(null);
                  void upload(file);
                }}
              />
            )}
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-fg-subtle mb-1.5 block text-xs">{labels.colPrice}</span>
            <input
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              inputMode="numeric"
              data-num
              className="bg-bg-subtle border-border h-11 w-full rounded-md border px-3.5 text-right text-sm font-semibold"
            />
          </label>

          <label className="block">
            <span className="text-fg-subtle mb-1.5 block text-xs">{labels.colCost}</span>
            <input
              value={cost}
              onChange={(event) => setCost(event.target.value)}
              inputMode="numeric"
              data-num
              className="bg-bg-subtle border-border h-11 w-full rounded-md border px-3.5 text-right text-sm font-semibold"
            />
          </label>
        </div>

        {/* The margin is derived and shown, never typed. Two numbers decide it
            and a third that disagrees is the drift this avoids. */}
        <p className="text-fg-subtle mt-2 text-xs">
          {labels.marginNote.replace('{percent}', money[`margin_${item.id}`] ?? '')}
        </p>

        <dl className="border-divider mt-5 grid grid-cols-2 gap-y-2 border-t pt-4 text-sm">
          <dt className="text-fg-subtle">{labels.colCategory}</dt>
          <dd className="text-right font-medium">{item.categoryLabel}</dd>
          <dt className="text-fg-subtle">{labels.station}</dt>
          <dd className="text-right font-medium">{item.stationLabel}</dd>
          <dt className="text-fg-subtle">{labels.colState}</dt>
          <dd className="text-right font-medium">
            {item.available ? labels.onSale : labels.stopped}
          </dd>
        </dl>

        {/*
         * "Nothing here is stored yet", and only where it is still true.
         *
         * A live dish now saves through `PATCH /api/v1/menu/items/{item}`, so
         * leaving this warning above a button that does write would be the
         * console lying about its own effect — the kind of note a manager
         * learns to ignore and then misses when it matters. A fixture row keeps
         * it, because for that row it is the plain truth.
         */}
        {isServerRow(item.id) ? null : (
          <p className="border-warning-500/30 bg-warning-50 text-warning-700 mt-5 rounded-md border px-3.5 py-2.5 text-xs leading-normal">
            {labels.editorNote}
          </p>
        )}

        <button
          type="button"
          data-press
          disabled={saving}
          onClick={() => void save()}
          className="bg-brand-500 hover:bg-brand-600 mt-3 h-11 w-full rounded-md text-sm font-semibold text-white disabled:opacity-50"
        >
          {labels.save}
        </button>
      </aside>
    </div>
  );
}

/**
 * Whether this row is a real dish or one of the design's fixtures.
 *
 * The fixtures are keyed by name — `osh`, `lagmon`, `somsa` — and a row the
 * seam mapped from the API carries its database id. So the id itself is the
 * tell, and it is the same value the upload is addressed by: a control that
 * cannot name a row it would write to is a control that should not be drawn.
 *
 * Cheaper than threading a `live` flag through three components to gate one
 * button, and it cannot drift from the thing it is gating.
 */
function isServerRow(id: string): boolean {
  return /^\d+$/.test(id);
}

/** The picture-frame glyph the guest menu uses for a dish with no photograph. */
function PhotoGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="8.5" cy="10" r="1.5" />
      <path d="m21 15-4.5-4.5L9 18" />
    </svg>
  );
}
