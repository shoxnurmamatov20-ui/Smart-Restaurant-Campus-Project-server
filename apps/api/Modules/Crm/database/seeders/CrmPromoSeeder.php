<?php

declare(strict_types=1);

namespace Modules\Crm\Database\Seeders;

use Illuminate\Database\Seeder;
use Modules\Crm\Models\Coupon;
use Modules\Crm\Models\PromoCode;

/**
 * The three promo codes and the three loyalty coupons the customer app draws.
 *
 * Not invented here. `packages/surfaces/src/customer/data.ts` has been shipping
 * `PROMO_CODES = { OSH15: 15, YANGI10: 10, PLOV20: 20 }` and
 * `PROMO_MINIMUM = 50 000 so'm` as a fixture, with a docblock saying why that
 * is a fixture: "A real code is validated by the server against the tenant's
 * campaign — a client that decides its own discount decides its own price."
 * This is that campaign, with the same three words and the same floor, so the
 * screen behaves identically whether or not the API is reachable.
 *
 * The same goes for `COUPONS`: three keys, three tones, three notes, in the
 * order the loyalty screen draws them.
 *
 * ---------------------------------------------------------------------------
 * The one number the design does not give
 *
 * What a coupon costs in points. The loyalty screen draws a balance (2 480) and
 * three coupons and no price on any of them, so the prices below are derived
 * from the rule the same screen states — "100 ball = 1 000 so'm chegirma" —
 * against what each coupon is worth:
 *
 *   pickup-5        5% of a typical 100 000 so'm pickup order ≈ 5 000  →   500
 *   free-delivery   the branch delivery fee, 12 000 so'm              → 1 200
 *   second-lavash   a lavash is 32 000 so'm, and this is the cheaper
 *                   of two, so half of it                            → 1 500
 *
 * All three are affordable at 2 480 points, which matters: a shelf where the
 * demo guest can afford nothing never exercises the reserve flow.
 *
 * Deterministic, like every seeder here — the same seed gives the same rows, so
 * a screenshot from Tuesday matches the database on Thursday.
 */
final class CrmPromoSeeder extends Seeder
{
    /** 1 so'm = 100 tiyin. Written this way so the figures read as the design writes them. */
    private const SOM = 100;

    public function run(): void
    {
        $this->seedPromoCodes();
        $this->seedCoupons();

        $this->command?->info('✅ CRM: 3 promo-kod va 3 sodiqlik kuponi yaratildi.');
    }

    private function seedPromoCodes(): void
    {
        /*
         * The floor, shared by all three, exactly as `PROMO_MINIMUM` is shared
         * in the fixture: 50 000 so'm.
         */
        $floor = 50_000 * self::SOM;

        $campaigns = [
            [
                'code' => 'OSH15',
                'value' => 15,
                'title' => ['uz' => 'Oshga 15%', 'ru' => '15% на плов', 'en' => '15% off plov'],
            ],
            [
                'code' => 'YANGI10',
                'value' => 10,
                'title' => [
                    'uz' => 'Yangi mijozga 10%',
                    'ru' => '10% новому клиенту',
                    'en' => '10% for new guests',
                ],
            ],
            [
                'code' => 'PLOV20',
                'value' => 20,
                'title' => ['uz' => 'Palovga 20%', 'ru' => '20% на плов', 'en' => '20% off plov'],
            ],
        ];

        foreach ($campaigns as $campaign) {
            PromoCode::query()->updateOrCreate(
                ['code' => $campaign['code']],
                [
                    'title' => $campaign['title'],
                    'kind' => 'percent',
                    'value' => $campaign['value'],
                    'min_tiyin' => $floor,
                    /*
                     * A ceiling on every percentage campaign.
                     *
                     * 20% off a 4 000 000 so'm corporate order is not what
                     * anybody meant by a lunch promotion. The fixture has no
                     * such concept because a fixture never meets a corporate
                     * order; a seeded campaign that a real restaurant might
                     * copy should not teach the wrong shape.
                     */
                    'max_discount_tiyin' => 100_000 * self::SOM,
                    'starts_at' => null,
                    // Open-ended: a demo whose promo codes expired last month is
                    // a demo where the promo field never works again.
                    'ends_at' => null,
                    'max_uses' => null,
                    'per_customer_limit' => 1,
                    'is_active' => true,
                ],
            );
        }
    }

    private function seedCoupons(): void
    {
        $coupons = [
            [
                'key' => 'pickup-5',
                'name' => ['uz' => 'Olib ketishga 5%', 'ru' => '5% на самовывоз', 'en' => '5% off pickup'],
                'note' => ['uz' => 'Har qanday buyurtmada', 'ru' => 'На любой заказ', 'en' => 'On any order'],
                'points_cost' => 500,
                'kind' => 'percent',
                'value' => 5,
                'min_tiyin' => 0,
                'tone' => 'accent',
            ],
            [
                'key' => 'free-delivery',
                'name' => [
                    'uz' => 'Bepul yetkazib berish',
                    'ru' => 'Бесплатная доставка',
                    'en' => 'Free delivery',
                ],
                'note' => ['uz' => "150 000 so'mdan", 'ru' => 'от 150 000 сум', 'en' => "from 150 000 so'm"],
                'points_cost' => 1_200,
                'kind' => 'free_delivery',
                'value' => 0,
                // The note says "from 150 000", so the floor says it too. A
                // condition written only in the note is a condition the server
                // does not enforce.
                'min_tiyin' => 150_000 * self::SOM,
                'tone' => 'brand',
            ],
            [
                'key' => 'second-lavash',
                'name' => [
                    'uz' => "Ikkinchi lavash sovg'a",
                    'ru' => 'Второй лаваш в подарок',
                    'en' => 'Second lavash free',
                ],
                'note' => ['uz' => 'Faqat 11:00–15:00', 'ru' => 'Только 11:00–15:00', 'en' => '11:00–15:00 only'],
                'points_cost' => 1_500,
                'kind' => 'fixed',
                // A lavash is 32 000 so'm on the seeded menu; this takes the
                // cheaper of two off.
                'value' => 32_000 * self::SOM,
                'min_tiyin' => 64_000 * self::SOM,
                'tone' => 'warning',
            ],
        ];

        foreach ($coupons as $index => $coupon) {
            Coupon::query()->updateOrCreate(
                ['key' => $coupon['key']],
                [
                    ...$coupon,
                    'sort_order' => $index,
                    'starts_at' => null,
                    'ends_at' => null,
                    'is_active' => true,
                ],
            );
        }
    }
}
