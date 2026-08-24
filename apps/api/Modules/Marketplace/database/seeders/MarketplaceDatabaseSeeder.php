<?php

declare(strict_types=1);

namespace Modules\Marketplace\Database\Seeders;

use App\Contracts\Menu\MenuCatalog;
use App\Contracts\Menu\Section;
use App\Models\Branch;
use App\Support\Tenancy\BranchContext;
use Illuminate\Database\Seeder;
use Modules\Marketplace\Models\Consumer;
use Modules\Marketplace\Models\Courier;
use Modules\Marketplace\Models\DeliveryZone;
use Modules\Marketplace\Models\Placement;
use Modules\Marketplace\Models\Store;
use Modules\Marketplace\Models\StoreItem;
use Modules\Marketplace\Models\Subscription;

/**
 * The eight storefronts the design draws, transcribed exactly.
 *
 * Every figure here comes from `STORES` in `packages/surfaces/src/mp/data.ts` —
 * the ratings, the review counts, the delivery fees, the windows, the badges and
 * the one shop that is deliberately shut. Not approximately: the fixture is what
 * every marketplace screen was built against, and a seeder that rounded 4.9 to 5
 * would make the first live render look like a regression.
 *
 * ---------------------------------------------------------------------------
 * Eight windows, one restaurant
 *
 * All eight belong to `demo-restaurant`, and that is a demo compromise rather
 * than the shape of the thing. A real marketplace has eight tenants — eight
 * businesses, eight kitchens, eight settlements, eight bank accounts — and the
 * schema is built for exactly that: `stores.tenant_id` is the join and the
 * policies do the rest.
 *
 * What the compromise costs is one test this seeder cannot support: a merchant
 * of restaurant A failing to see restaurant B's orders. That is covered in
 * `MerchantIsolationTest` with two tenants built by hand, which is the right
 * place for it anyway — an isolation test that depended on demo data would pass
 * for the wrong reason the day somebody edited the demo.
 *
 * ---------------------------------------------------------------------------
 * Coordinates
 *
 * Derived from the fixture's `distanceKm`, placed due north of the Tashkent
 * reference point. Real bearings would look better on a map and would be
 * invented; a straight line at the right distance makes `?near=` answer the
 * number the design prints, which is the property that matters.
 */
final class MarketplaceDatabaseSeeder extends Seeder
{
    /** Where the fixture's distances are measured from — central Tashkent. */
    private const ORIGIN_LAT_E6 = 41_311_081;

    private const ORIGIN_LNG_E6 = 69_240_562;

    /** One degree of latitude is about 111.32 km. In microdegrees per km: */
    private const E6_PER_KM = 8_983;

    /**
     * `STORES`, in order, with `distanceKm` kept as the tenth of a kilometre it
     * is drawn as.
     *
     * @var array<int, array{slug: string, name: string, uz: string, ru: string, en: string, cuisine: string, rating: int, reviews: int, fee: int, km10: int, from: int, to: int, open: bool, initials: string, tint: string, offer?: array{uz: string, ru: string, en: string}, tone?: string}>
     */
    private const STORES = [
        [
            'slug' => 'osh-xona', 'name' => 'Osh Xona',
            'uz' => 'Milliy taomlar · osh markazi', 'ru' => 'Национальная кухня · плов', 'en' => 'Uzbek · plov house',
            'cuisine' => 'osh', 'rating' => 49, 'reviews' => 1_240, 'fee' => 1_200_000, 'km10' => 12,
            'from' => 25, 'to' => 35, 'open' => true, 'initials' => 'OX', 'tint' => '#C2410C',
            'offer' => ['uz' => 'Yangi narxlar', 'ru' => 'Новые цены', 'en' => 'New prices'], 'tone' => 'warning',
        ],
        [
            'slug' => 'smart-restaurant', 'name' => 'Smart Restaurant',
            'uz' => 'Milliy · burger · pitsa', 'ru' => 'Национальная · бургеры · пицца', 'en' => 'Uzbek · burgers · pizza',
            'cuisine' => 'osh', 'rating' => 48, 'reviews' => 2_100, 'fee' => 0, 'km10' => 18,
            'from' => 20, 'to' => 30, 'open' => true, 'initials' => 'SR', 'tint' => '#2E74EA',
            'offer' => ['uz' => 'Bepul yetkazish', 'ru' => 'Бесплатная доставка', 'en' => 'Free delivery'], 'tone' => 'brand',
        ],
        [
            'slug' => 'choyxona-navruz', 'name' => 'Choyxona Navruz',
            'uz' => 'Choyxona · shashlik', 'ru' => 'Чайхана · шашлык', 'en' => 'Choyxona · kebab',
            'cuisine' => 'choyxona', 'rating' => 47, 'reviews' => 860, 'fee' => 900_000, 'km10' => 24,
            'from' => 30, 'to' => 40, 'open' => true, 'initials' => 'CN', 'tint' => '#0F766E',
        ],
        [
            'slug' => 'lavash-baraka', 'name' => 'Lavash Baraka',
            'uz' => 'Lavash · tez tayyor', 'ru' => 'Лаваш · фастфуд', 'en' => 'Lavash · fast food',
            'cuisine' => 'lavash', 'rating' => 46, 'reviews' => 3_400, 'fee' => 800_000, 'km10' => 9,
            'from' => 15, 'to' => 25, 'open' => true, 'initials' => 'LB', 'tint' => '#7C3AED',
            'offer' => ['uz' => '−20% ikkinchi lavash', 'ru' => '−20% на второй', 'en' => '−20% second one'], 'tone' => 'danger',
        ],
        [
            'slug' => 'pizza-roma', 'name' => 'Pizza Roma',
            'uz' => 'Pitsa · pasta', 'ru' => 'Пицца · паста', 'en' => 'Pizza · pasta',
            'cuisine' => 'pizza', 'rating' => 45, 'reviews' => 1_900, 'fee' => 1_000_000, 'km10' => 31,
            'from' => 25, 'to' => 35, 'open' => true, 'initials' => 'PR', 'tint' => '#DC2626',
        ],
        [
            'slug' => 'milliy-taomlar', 'name' => 'Milliy Taomlar',
            'uz' => "Milliy · to'y oshi", 'ru' => 'Национальная · свадебный плов', 'en' => 'Uzbek · wedding plov',
            'cuisine' => 'osh', 'rating' => 48, 'reviews' => 640, 'fee' => 1_500_000, 'km10' => 46,
            'from' => 35, 'to' => 45, 'open' => true, 'initials' => 'MT', 'tint' => '#B45309',
        ],
        [
            'slug' => 'burger-xona', 'name' => 'Burger Xona',
            'uz' => 'Burger · qanotcha', 'ru' => 'Бургеры · крылышки', 'en' => 'Burgers · wings',
            'cuisine' => 'burger', 'rating' => 44, 'reviews' => 2_800, 'fee' => 800_000, 'km10' => 15,
            'from' => 15, 'to' => 25, 'open' => true, 'initials' => 'BX', 'tint' => '#1F2533',
        ],
        [
            /*
             * Shut, on purpose, and the fixture says why: the design keeps one
             * store closed so the dimmed card and its "Yopiq" overlay are a
             * state somebody has actually looked at rather than a branch nobody
             * ever renders. A seeder that opened all eight would take that away.
             */
            'slug' => 'shashlik-markazi', 'name' => 'Shashlik Markazi',
            'uz' => 'Shashlik · kabob', 'ru' => 'Шашлык · кебаб', 'en' => 'Kebab · grill',
            'cuisine' => 'shashlik', 'rating' => 47, 'reviews' => 1_100, 'fee' => 1_200_000, 'km10' => 29,
            'from' => 30, 'to' => 40, 'open' => false, 'initials' => 'SM', 'tint' => '#166534',
        ],
    ];

    /**
     * How much dearer a dish is on the market, per storefront position.
     *
     * A cycle rather than a random draw, and it is the same reason
     * `FinancePaymentSeeder` cycles its payment methods: the same seed has to
     * build the same database, or a screenshot from yesterday cannot be compared
     * with one from today. Three thousand so'm on the first window, five on the
     * second, nothing on the third — enough spread that the merchant catalogue
     * screen has something to show in its "market price" column.
     *
     * @var array<int, int>
     */
    private const MARKUPS = [300_000, 500_000, 0, 200_000];

    public function run(): void
    {
        if (Store::query()->exists()) {
            // Idempotent: `db:seed` is run more than once on a machine, and a
            // second pass must not put sixteen windows on the market.
            return;
        }

        $branch = app(BranchContext::class)->branch() ?? Branch::query()->first();

        foreach (self::STORES as $index => $row) {
            $store = Store::create([
                'branch_id' => $branch?->id,
                'slug' => $row['slug'],
                'name' => $row['name'],
                'kind' => ['uz' => $row['uz'], 'ru' => $row['ru'], 'en' => $row['en']],
                'cuisine' => $row['cuisine'],
                'vertical' => 'food',
                'rating_tenths' => $row['rating'],
                'reviews_count' => $row['reviews'],
                'delivery_fee_tiyin' => $row['fee'],
                'min_order_tiyin' => 0,
                'minutes_from' => $row['from'],
                'minutes_to' => $row['to'],
                'commission_percent' => Store::DEFAULT_COMMISSION_PERCENT,
                'status' => 'live',
                'is_open' => $row['open'],
                'initials' => $row['initials'],
                'tint' => $row['tint'],
                'offer' => $row['offer'] ?? null,
                'offer_tone' => $row['tone'] ?? null,
                // Due north of the origin, at the distance the card prints.
                'latitude_e6' => self::ORIGIN_LAT_E6 + intdiv($row['km10'] * self::E6_PER_KM, 10),
                'longitude_e6' => self::ORIGIN_LNG_E6,
            ]);

            $this->stock($store, self::MARKUPS[$index % count(self::MARKUPS)]);
            $this->reach($store, $index);
        }

        $this->people();
        $this->commerce();
    }

    /**
     * A boundary and a bank account for each window.
     *
     * Both are seeded because the screens that read them are unreadable empty:
     * a delivery-zone editor with no rows looks broken rather than
     * unconfigured, and a settlement statement with no payout prints a blank
     * where the bank should be.
     *
     * The first storefront is left UNVERIFIED on purpose. The platform's review
     * queue is a queue — a demo in which every account is already verified never
     * shows the state the screen exists for, and `pending_review` is what a real
     * restaurant is in on the day it joins.
     */
    private function reach(Store $store, int $index): void
    {
        DeliveryZone::create([
            'store_id' => $store->id,
            'label' => 'Markaz',
            // Three kilometres round the venue: the block, the district, and
            // the ring the design's third sample address sits outside of.
            'radius_m' => 3_000,
            'latitude_e6' => $store->latitude_e6 ?? self::ORIGIN_LAT_E6,
            'longitude_e6' => $store->longitude_e6 ?? self::ORIGIN_LNG_E6,
            'fee_tiyin' => null,
            'min_order_tiyin' => null,
            'sort_order' => 0,
        ]);

        $store->savePayout([
            'bank_name' => 'Ipoteka Bank · Chilonzor',
            'mfo' => '00873',
            // Twenty digits, deterministic per storefront: a demo where two
            // shops share an account is a payout screen nobody can read.
            'account' => str_pad((string) (20_208_000_900_000_000 + $index), 20, '0', STR_PAD_LEFT),
            'inn' => '30'.str_pad((string) (1_234_500 + $index), 7, '0', STR_PAD_LEFT),
            'holder' => $store->name.' MChJ',
        ]);

        if ($index > 0) {
            $store->forceFill([
                'payout_state' => 'verified',
                'payout_verified_at' => now()->subDays(30 - $index),
            ])->save();
        }
    }

    /**
     * One banner on air and one subscription running.
     *
     * The merchant's placement card counts a queue and the consumer's Plus
     * sheet reports a renewal date; neither has anything to draw over an empty
     * table. Both are attached to the FIRST storefront and the first customer,
     * so the demo is the same on every machine.
     */
    private function commerce(): void
    {
        $store = Store::query()->orderBy('id')->first();

        if ($store instanceof Store) {
            $starts = now()->startOfDay()->subDays(2);

            Placement::create([
                'store_id' => $store->id,
                'slot' => 'home_top',
                'starts_on' => $starts->toDateString(),
                'ends_on' => $starts->copy()->addDays(6)->toDateString(),
                'days' => 7,
                'day_rate_tiyin' => Placement::DAY_RATE_TIYIN['home_top'],
                'total_tiyin' => Placement::DAY_RATE_TIYIN['home_top'] * 7,
                'state' => 'running',
            ]);
        }

        $subscriber = Consumer::query()->where('phone', '+998901234567')->first();

        if ($subscriber instanceof Consumer && $subscriber->subscription() === null) {
            Subscription::create([
                'consumer_id' => $subscriber->id,
                'plan' => Subscription::PLAN,
                'state' => 'active',
                'monthly_tiyin' => Consumer::PLUS_MONTHLY_TIYIN,
                // Matches the `plus_until` three months out that `people()`
                // already writes, so the two never disagree on a screen.
                'started_at' => now()->subMonths(1),
                'renews_at' => $subscriber->plus_until ?? now()->addMonths(3),
                'pay_rail' => 'click',
            ]);
        }
    }

    /**
     * Put the restaurant's own menu in the window.
     *
     * Through `MenuCatalog`, never through Menu's tables — the same contract the
     * running module uses, so a seeder cannot quietly depend on a column the
     * boundary forbids the rest of the code from reading.
     *
     * `sellable('delivery')` rather than the whole catalogue: what a restaurant
     * offers for delivery is already a decision it has made, and putting
     * dine-in-only dishes on a marketplace is how a courier ends up carrying
     * soup in a paper cup.
     */
    private function stock(Store $store, int $markup): void
    {
        $sort = 0;

        /** @var Section $section */
        foreach (app(MenuCatalog::class)->sellable('delivery') as $section) {
            foreach ($section->dishes as $dish) {
                StoreItem::create([
                    'store_id' => $store->id,
                    'menu_item_id' => $dish->id,
                    // Drinks keep the house price. Nobody accepts a tea costing
                    // three thousand more because it arrived by moped, and the
                    // catalogue screen needs at least one row where the two
                    // prices match so the "no markup" case is visible.
                    'markup_tiyin' => $dish->kind === 'drink' ? 0 : $markup,
                    'is_listed' => true,
                    'sort_order' => $sort++,
                ]);
            }
        }
    }

    /**
     * Two customers and two riders.
     *
     * One customer on MyPOS Plus and one without, because free delivery is the
     * whole subscription and a demo where every basket ships free never shows
     * the fee at all. The numbers are fixed rather than generated: a phone
     * number is what somebody signs in with, and a demo you cannot sign into is
     * a screenshot.
     */
    private function people(): void
    {
        Consumer::query()->firstOrCreate(
            ['phone' => '+998901234567'],
            ['name' => 'Nilufar Yusupova', 'locale' => 'uz', 'points' => 2_840, 'plus_until' => now()->addMonths(3)],
        );

        Consumer::query()->firstOrCreate(
            ['phone' => '+998907654321'],
            ['name' => 'Oybek Saidov', 'locale' => 'uz', 'points' => 310],
        );

        Courier::query()->firstOrCreate(
            ['phone' => '+998935550101'],
            ['name' => 'Oybek S.', 'rating_tenths' => 49, 'deliveries_count' => 1_842, 'is_active' => true],
        );

        Courier::query()->firstOrCreate(
            ['phone' => '+998935550102'],
            ['name' => 'Rustam T.', 'rating_tenths' => 47, 'deliveries_count' => 604, 'is_active' => true],
        );
    }
}
