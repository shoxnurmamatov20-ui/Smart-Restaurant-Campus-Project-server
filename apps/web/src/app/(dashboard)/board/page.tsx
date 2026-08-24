import { getLocale, getTranslations } from 'next-intl/server';
import { formatTiyinAmount } from '@restaurant/utils';

import { moduleMetadata } from '../module-page';
import { PageHead } from '../screen';
import { BoardPanels } from './board-panels';
import { say, type Lang } from './board-data';
import { BoardPushButton } from './board-push';
import { getBoard } from './board-server';

export const generateMetadata = () => moduleMetadata('board');

/**
 * The menu board, managed from the console.
 *
 * Half of this screen is a preview and that is not decoration. The board hangs
 * on a wall in a different room from whoever configures it; without a picture
 * of what it currently says, a mistake — a column in the wrong order, a banner
 * still running from last month — lives until somebody walks past the counter
 * and happens to look up.
 *
 * The preview is drawn in the board's own dark palette rather than the
 * console's, at the board's own proportions, so what is on this page and what
 * is on that wall are the same picture. It and the three tabs below come from
 * ONE server read (`board-server.ts`), for the same reason: two reads can
 * disagree, and the disagreement would be invisible on exactly the screen built
 * to make it visible.
 */
export default async function BoardPage() {
  const [t, act, locale, board] = await Promise.all([
    getTranslations('console.board'),
    getTranslations('console.actions'),
    getLocale(),
    getBoard(),
  ]);
  const lang = locale as Lang;
  const money = (tiyin: number) => formatTiyinAmount(tiyin, lang);

  const liveBanner = board.banners.find((banner) => banner.live) ?? board.banners[0];
  const dimmed = board.soldOut;

  const kindLabel = {
    offer: t('kindOffer'),
    new: t('kindNew'),
    loyalty: t('kindLoyalty'),
  } as const;

  return (
    <>
      <PageHead title={t('title')} subtitle={t('sub')}>
        {/*
          The push writes and announces, both. `POST /api/v1/board/push` stamps
          every row of this venue that has changed since the last one and
          broadcasts `board.pushed` on `branch.{branchId}.board` — the channel
          this module added beside `.kitchen`, `.orders`, `.stoplist`, `.floor`
          and `.approvals`.

          The broadcast is not an optimisation. Nobody is standing at a menu
          board: a television that only picked up a new price on its next reload
          is a television advertising last week's price to the queue, and there
          is no one to press F5.

          The stop list still works the other way round and is the reason nobody
          dims a dish from this screen: a dish 86'd in the kitchen reaches the
          board through `branch.{id}.stoplist`, which the wall subscribes to, and
          `GET board/preview` joins the same sheet in on every render.
        */}
        <BoardPushButton
          label={t('push')}
          live={board.live}
          labels={{
            pushed: act('boardPushed'),
            upToDate: act('boardUpToDate'),
            failed: act('boardPushFailed'),
          }}
        />
      </PageHead>

      {/* ------------------------------------------------------- the preview */}
      <section
        className="mb-7 overflow-hidden rounded-lg"
        style={{ background: '#0B0E16', color: '#fff' }}
        aria-label={t('previewLabel')}
      >
        <header
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: '1px solid rgba(255,255,255,.09)' }}
        >
          {/*
            The only number on this screen that is not a fact — and it is
            configuration rather than a pending integration. Nothing outside
            the building is being waited on, so this is a note about a product
            decision and not a marker for a wire nobody has run.

            "Live · 2 screens" counts nothing. It is `config('board.screens')`
            in `Modules/Board/config/config.php`, which is what an operator
            typed — the platform enrols tills (`pos.terminals`, an
            eight-character pairing code) and printers, and it enrols nothing
            for signage: a wall screen opens a URL and starts drawing. There is
            no row to count and no device to ask.

            One config key, therefore one number for a chain whose Chilonzor
            counter has three televisions and whose Termiz counter has one.

            TODO — a signage device registry: a screen pairing the way a
            terminal does, with its own token, so `branch.{id}.board` reaches
            known hardware and this figure becomes a count. That is a product
            decision nobody has taken rather than a wire nobody has run.
            Everything else on this page is read from the database on every
            render.

            The green dot has the same caveat and is worse: nothing here knows
            whether a screen is switched on. It says the board is configured,
            not that anybody can see it.
          */}
          <span className="flex items-center gap-2.5 text-sm">
            <span
              className="size-2 rounded-full"
              style={{ background: 'var(--success-500)' }}
              aria-hidden
            />
            <span style={{ color: '#5EE9B5' }} className="font-semibold">
              {t('liveOn', { n: board.screens })}
            </span>
          </span>

          {/*
           * No clock. The design's preview shows the wall screen's own time,
           * which on a server-rendered page would be the server's — and a
           * preview that is confidently ten minutes wrong is worse than one
           * that does not claim to know. The rotation length goes here instead,
           * which is the number somebody configuring a playlist actually wants.
           */}
          <span className="text-2xs" style={{ color: 'rgba(255,255,255,.55)' }}>
            {t('rotation', { n: board.rotation })}
          </span>
        </header>

        <div className="grid gap-6 px-6 py-6 md:grid-cols-3">
          {board.wall.map((column) => (
            <div key={column.key}>
              <h3
                className="text-2xs tracking-caps mb-3 font-semibold uppercase"
                style={{ color: column.accent }}
              >
                {say(column.title, lang)}
              </h3>

              <ul className="flex flex-col gap-2">
                {column.items.map((dish) => (
                  <li
                    key={say(dish.name, lang)}
                    className="flex items-baseline justify-between gap-3 text-sm"
                    /*
                     * Dimmed, not removed. A customer who came in for the
                     * cheeseburger needs to see that it exists and is off
                     * today; an item that vanishes reads as a menu that never
                     * had it, and they ask at the counter instead.
                     */
                    style={{ opacity: dish.soldOut ? 0.38 : 1 }}
                  >
                    <span className="min-w-0 truncate">
                      {say(dish.name, lang)}
                      {dish.soldOut ? (
                        <span className="text-2xs ml-2 uppercase">{t('soldOut')}</span>
                      ) : null}
                    </span>
                    <span data-num className="flex-none font-semibold">
                      {money(dish.price)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {liveBanner ? (
          <div
            className="flex items-center gap-3 px-6 py-4"
            style={{ background: liveBanner.wash }}
          >
            <span
              className="rounded-pill text-2xs px-2.5 py-1 font-semibold"
              style={{ background: 'rgba(0,0,0,.25)', color: liveBanner.ink }}
            >
              {kindLabel[liveBanner.kind]}
            </span>
            <span className="text-sm font-semibold">{say(liveBanner.text, lang)}</span>
          </div>
        ) : null}
      </section>

      {/*
       * Changes the wall has not been told about.
       *
       * The API answers this from `updated_at > published_at` across the three
       * lists. It is the other half of the push button: without it a manager
       * who reordered two columns and walked away has no way of knowing the
       * counter is still showing the old order, and the screen that exists to
       * make that visible would be the screen hiding it.
       */}
      {board.behind ? (
        <p className="border-warning-500/30 bg-warning-50 text-warning-700 mb-3 rounded-md border px-3.5 py-3 text-sm leading-normal">
          {t('behind')}
        </p>
      ) : null}

      {/*
       * The one sentence that keeps two systems from disagreeing: the board
       * follows the 86 sheet, and nobody dims a dish from here.
       */}
      {dimmed > 0 ? (
        <p className="border-warning-500/30 bg-warning-50 text-warning-700 mb-7 rounded-md border px-3.5 py-3 text-sm leading-normal">
          {t('stopNote', { n: dimmed })}
        </p>
      ) : null}

      <BoardPanels
        lang={lang}
        live={board.live}
        columns={board.columns}
        playlist={board.playlist}
        banners={board.banners}
        labels={{
          tabColumns: t('tabColumns'),
          tabPlaylist: t('tabPlaylist'),
          tabBanners: t('tabBanners'),
          /*
           * `t.raw` rather than `t(key, { n })`: these three are interpolated
           * on the client, where the position changes as columns are reordered
           * and the message catalogue is deliberately not shipped. Raw hands
           * over the ICU source — `{n} pozitsiya` — for the leaf to fill in.
           */
          columnPosition: t.raw('columnPosition') as string,
          items: t.raw('items') as string,
          moveUp: t('moveUp'),
          moveDown: t('moveDown'),
          seconds: t.raw('seconds') as string,
          on: t('on'),
          scheduled: t('scheduled'),
          live: t('bannerLive'),
          off: t('bannerOff'),
          addBanner: t('addBanner'),
          bannerTextUz: t('bannerTextUz'),
          bannerTextRu: t('bannerTextRu'),
          bannerTextEn: t('bannerTextEn'),
          bannerKind: t('bannerKind'),
          bannerFrom: t('bannerFrom'),
          bannerTo: t('bannerTo'),
          bannerLiveNow: t('bannerLiveNow'),
          bannerSave: t('bannerSave'),
          bannerCancel: t('bannerCancel'),
          bannerSaved: t('bannerSaved'),
          bannerFailed: t('bannerFailed'),
          bannerNeedsThree: t('bannerNeedsThree'),
          bannerDemo: t('bannerDemo'),
          orderFailed: t('orderFailed'),
          kindOffer: kindLabel.offer,
          kindNew: kindLabel.new,
          kindLoyalty: kindLabel.loyalty,
        }}
      />
    </>
  );
}
