import type { GuestMenu } from '../guest/menu-data';
import type { TgCategory, TgDish } from './data';

/**
 * The mini app's menu, read from the restaurant's own card.
 *
 * `GET /api/v1/public/menu` is the one endpoint this platform publishes to a
 * stranger, and it is what the QR code on the table and the restaurant site
 * already draw. The Telegram surface drew `TG_MENU` — ten dishes out of a
 * design file — and the consequence went further than a wrong price list: the
 * cart's `placeOrderPayloadFrom` refuses a basket whose dish ids are not
 * numbers, so **every** order placed from the mini app was answered
 * `not_orderable`. A bot with a working checkout and a fixture menu is a bot
 * that cannot take an order at all.
 *
 * ---------------------------------------------------------------------------
 * Why a mapper and not the guest type directly
 *
 * The mini app's screens are drawn against `TgDish`, whose words are
 * `Trilingual` because the fixture has to render in three languages from one
 * constant. A live row arrives already resolved for this reader — the API read
 * `X-Locale` — so the same string goes into all three slots rather than being
 * translated a second time here, which would answer a different question.
 *
 * Rewriting the screens to take `GuestDish` was the alternative and it is
 * worse: it would fork the mini app's rendering from the fixture it is checked
 * against, and this is the one surface with no console and no test data of its
 * own.
 *
 * Pure by the package's rule — no fetch, no DOM, no clock.
 */
export type TgLiveMenu = {
  categories: readonly TgCategory[];
  dishes: readonly TgDish[];
};

/**
 * Flatten the guest menu into the mini app's two lists.
 *
 * Headings with nothing sellable under them are dropped. The endpoint already
 * excludes draft and archived dishes, so an empty heading is a section this
 * restaurant has but is not selling from tonight — and a chip that filters to
 * an empty screen is a chip a guest taps twice and then leaves.
 *
 * A stopped dish is kept, dimmed by the screen. `is_stopped` comes down in its
 * own place for exactly that reason: a guest who came for the somsa is owed the
 * word "finished" rather than a menu that silently never had one.
 */
export function tgMenuFrom(menu: GuestMenu): TgLiveMenu {
  const categories: TgCategory[] = [];
  const dishes: TgDish[] = [];

  for (const category of menu.categories) {
    if (category.dishes.length === 0) continue;

    categories.push({
      id: category.id,
      name: { uz: category.name, ru: category.name, en: category.name },
    });

    for (const dish of category.dishes) {
      dishes.push({
        id: dish.id,
        categoryId: category.id,
        name: { uz: dish.name, ru: dish.name, en: dish.name },
        description: {
          uz: dish.description,
          ru: dish.description,
          en: dish.description,
        },
        price: dish.price,
        soldOut: dish.soldOut,
        /*
         * The set, not an address: the row draws a 64px square and the
         * browser should be choosing `thumb` for it from the `srcset`, not
         * downloading the 1600px file the guest type's `imageUrl` names.
         */
        image: dish.image,
      });
    }
  }

  return { categories, dishes };
}
