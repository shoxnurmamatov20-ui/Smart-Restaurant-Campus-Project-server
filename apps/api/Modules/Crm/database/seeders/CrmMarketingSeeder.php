<?php

declare(strict_types=1);

namespace Modules\Crm\Database\Seeders;

use Illuminate\Database\Seeder;
use Modules\Crm\Models\Campaign;
use Modules\Crm\Models\Promotion;
use Modules\Crm\Models\Trigger;
use Modules\Crm\Services\SmsCost;

/**
 * The marketing screen's own rows, so the four tabs draw the design.
 *
 * Not invented here. Every promotion, trigger and campaign below is the one the
 * design file already draws — `marketing-data.ts` carries them as fixtures with
 * the same names, the same rules and the same figures, and the fixture ids
 * (`bday`, `back`, `first`, `sleep`) become the trigger keys the console
 * addresses rows by. Its own comment asked for exactly that: "a real row would
 * be addressed by key".
 *
 * Deterministic, like every seeder here — the same seed gives the same rows, so
 * a screenshot from Tuesday matches the database on Thursday. Dates are offsets
 * from today for the same reason.
 */
final class CrmMarketingSeeder extends Seeder
{
    /** 1 so'm = 100 tiyin. Written this way so the figures read as the design writes them. */
    private const SOM = 100;

    public function run(): void
    {
        $this->seedPromotions();
        $this->seedTriggers();
        $this->seedCampaigns();

        $this->command?->info('✅ CRM: 4 aksiya, 4 avtomatik xabar va 5 kampaniya yaratildi.');
    }

    private function seedPromotions(): void
    {
        $rows = [
            [
                'key' => 'business-lunch',
                'name' => ['uz' => 'Biznes-lanch 12:00–15:00', 'ru' => 'Бизнес-ланч 12:00–15:00', 'en' => 'Business lunch 12:00–15:00'],
                'rule_text' => [
                    'uz' => "Birinchi taom + asosiy taom + choy — 48 000 so'm",
                    'ru' => 'Первое + основное + чай — 48 000 сум',
                    'en' => "Starter + main + tea — 48 000 so'm",
                ],
                'kind' => 'bundle',
                'value' => 48_000 * self::SOM,
                'days' => [1, 2, 3, 4, 5],
                'starts_minute' => 12 * 60,
                'ends_minute' => 15 * 60,
                'channels' => ['dine_in'],
                'is_active' => true,
                'used_count' => 1_284,
                'revenue_tiyin' => 61_632_000 * self::SOM,
                'discount_tiyin' => 36_240_000 * self::SOM,
            ],
            [
                'key' => 'second-pizza',
                'name' => ['uz' => 'Ikkinchi pitsa 50%', 'ru' => 'Вторая пицца 50%', 'en' => 'Second pizza 50%'],
                'rule_text' => [
                    'uz' => "Ikkita pitsa buyurtma qilinganda arzonrog'iga 50% chegirma",
                    'ru' => 'При заказе двух пицц скидка 50% на меньшую',
                    'en' => 'Buy two pizzas, 50% off the cheaper one',
                ],
                'kind' => 'nth_off',
                'value' => 50,
                'quantity' => 2,
                'starts_minute' => 18 * 60,
                'ends_minute' => 23 * 60 + 59,
                'channels' => ['dine_in', 'takeaway'],
                'is_active' => true,
                'used_count' => 462,
                'revenue_tiyin' => 18_018_000 * self::SOM,
                /*
                 * The margin the design warns about, made arithmetic rather than
                 * copy. 22.8% left means 77.2% given away, and the resource
                 * computes the percentage from these two columns — so the
                 * warning strip on the card lights for a reason a reader can
                 * check instead of because a fixture said so.
                 */
                'discount_tiyin' => 13_909_896 * self::SOM,
            ],
            [
                'key' => 'birthday-dessert',
                'name' => ['uz' => "Tug'ilgan kun deserti", 'ru' => 'Десерт в день рождения', 'en' => 'Birthday dessert'],
                'rule_text' => [
                    'uz' => "Tug'ilgan kunda bepul desert, hisob 100 000 dan yuqori bo'lsa",
                    'ru' => 'Бесплатный десерт в день рождения при чеке от 100 000',
                    'en' => 'Free dessert on your birthday when the bill is over 100 000',
                ],
                'kind' => 'gift',
                'value' => 0,
                'min_tiyin' => 100_000 * self::SOM,
                'channels' => ['dine_in'],
                'is_active' => true,
                'used_count' => 38,
                'revenue_tiyin' => 8_664_000 * self::SOM,
                'discount_tiyin' => 3_604_224 * self::SOM,
            ],
            [
                'key' => 'delivery-salad',
                'name' => ['uz' => 'Yetkazishda bepul salat', 'ru' => 'Бесплатный салат при доставке', 'en' => 'Free salad on delivery'],
                'rule_text' => [
                    'uz' => '150 000 dan yuqori yetkazish buyurtmalariga',
                    'ru' => 'При заказе доставки от 150 000',
                    'en' => 'On delivery orders over 150 000',
                ],
                'kind' => 'gift',
                'value' => 0,
                'min_tiyin' => 150_000 * self::SOM,
                'channels' => ['delivery'],
                // Paused, so the screen has one of each state to draw.
                'is_active' => false,
                'used_count' => 96,
                'revenue_tiyin' => 19_584_000 * self::SOM,
                'discount_tiyin' => 13_395_456 * self::SOM,
            ],
        ];

        foreach ($rows as $row) {
            $key = $row['key'];
            unset($row['key']);

            $counters = [
                'used_count' => $row['used_count'],
                'revenue_tiyin' => $row['revenue_tiyin'],
                'discount_tiyin' => $row['discount_tiyin'],
            ];
            unset($row['used_count'], $row['revenue_tiyin'], $row['discount_tiyin']);

            /*
             * Matched on the Uzbek name rather than on a key column, because a
             * promotion has no natural key — the console addresses it by id.
             * Reseeding a demo database must not produce a fifth business lunch.
             */
            $promotion = Promotion::query()->updateOrCreate(
                ['name->uz' => $row['name']['uz']],
                $row,
            );

            // Counters are not fillable — they are what the till writes — so they
            // are stamped rather than mass-assigned.
            $promotion->forceFill($counters)->save();

            unset($key);
        }
    }

    private function seedTriggers(): void
    {
        $rows = [
            [
                'key' => 'bday',
                'kind' => 'birthday',
                'name' => ['uz' => "Tug'ilgan kun tabrigi", 'ru' => 'Поздравление с днём рождения', 'en' => 'Birthday message'],
                'rule_text' => [
                    'uz' => "Tug'ilgan kundan 3 kun oldin yuboriladi. Kupon 14 kun amal qiladi.",
                    'ru' => 'Отправляется за 3 дня до дня рождения. Купон действует 14 дней.',
                    'en' => 'Sent three days before the birthday. The coupon is valid for fourteen days.',
                ],
                'body' => "Tug'ilgan kuningiz bilan! Sizni kutamiz — bepul desert sizni kutmoqda.",
                'offset_days' => 3,
                'cooldown_days' => 300,
                'is_active' => true,
            ],
            [
                'key' => 'back',
                'kind' => 'win_back',
                'name' => ['uz' => 'Qaytarish xabari', 'ru' => 'Возврат клиента', 'en' => 'Win-back'],
                'rule_text' => [
                    'uz' => '60 kun kelmagan mijozga bir marta yuboriladi. Uch oyda takrorlanmaydi.',
                    'ru' => 'Отправляется один раз клиенту, не приходившему 60 дней. Не повторяется три месяца.',
                    'en' => 'Sent once to a customer who has not visited for sixty days. Not repeated for three months.',
                ],
                'body' => "Sizni sog'indik. Keyingi tashrifingizga 15% chegirma.",
                'offset_days' => 60,
                // "Uch oyda takrorlanmaydi" — the rule the card prints, as a number.
                'cooldown_days' => 90,
                'is_active' => true,
            ],
            [
                'key' => 'first',
                'kind' => 'first_visit',
                'name' => ['uz' => 'Birinchi tashrifdan keyin', 'ru' => 'После первого визита', 'en' => 'After the first visit'],
                'rule_text' => [
                    'uz' => "Birinchi tashrifdan 2 soat keyin. Baho so'raladi, chegirma taklif qilinmaydi.",
                    'ru' => 'Через 2 часа после первого визита. Просим оценку, скидку не предлагаем.',
                    'en' => 'Two hours after the first visit. Asks for a rating; offers no discount.',
                ],
                'body' => 'Tashrifingiz uchun rahmat. Bir daqiqada baho qoldirasizmi?',
                'offset_days' => 0,
                'offset_hours' => 2,
                'cooldown_days' => 365,
                'is_active' => true,
            ],
            [
                'key' => 'sleep',
                'kind' => 'points_expiry',
                'name' => ['uz' => 'Sodiqlik balli muddati', 'ru' => 'Срок действия баллов', 'en' => 'Points expiring'],
                'rule_text' => [
                    'uz' => 'Ballar muddati tugashiga 14 kun qolganda. Faqat 50 000 dan yuqori balli mijozlarga.',
                    'ru' => 'За 14 дней до сгорания баллов. Только клиентам с балансом свыше 50 000.',
                    'en' => 'Fourteen days before points expire. Only for balances over 50 000.',
                ],
                'body' => 'Sizda ballaringiz bor va ular tez orada muddati tugaydi.',
                'offset_days' => 14,
                'min_tiyin' => 50_000 * self::SOM,
                // Off, as the design draws it — the fourth card is the "what a
                // switched-off automation looks like" one.
                'is_active' => false,
            ],
        ];

        foreach ($rows as $row) {
            Trigger::query()->updateOrCreate(['key' => $row['key']], $row);
        }
    }

    private function seedCampaigns(): void
    {
        /*
         * Annotated because the shapes are not identical: a draft has no send
         * date. Without it static analysis correlates the literal rows and
         * decides the null branch below can never be taken.
         *
         * @var list<array{name: string, segment: string, status: string, days: int|null, to: int, redeemed: int, revenue: int}> $rows
         */
        $rows = [
            ['name' => 'Payshanba lavash aksiyasi', 'segment' => 'regular', 'status' => 'sent', 'days' => 16, 'to' => 312, 'redeemed' => 47, 'revenue' => 7_896_000],
            ['name' => 'Yangi mavsum menyusi', 'segment' => 'all', 'status' => 'sent', 'days' => 21, 'to' => 2_148, 'redeemed' => 164, 'revenue' => 27_552_000],
            ['name' => 'Qaytib keling — 15% chegirma', 'segment' => 'at_risk', 'status' => 'sent', 'days' => 25, 'to' => 41, 'redeemed' => 9, 'revenue' => 1_512_000],
            ['name' => 'Bayram taklifi', 'segment' => 'all', 'status' => 'scheduled', 'days' => -4, 'to' => 2_148, 'redeemed' => 0, 'revenue' => 0],
            ['name' => 'VIP degustatsiya kechasi', 'segment' => 'corporate', 'status' => 'draft', 'days' => null, 'to' => 24, 'redeemed' => 0, 'revenue' => 0],
        ];

        $body = 'Salom! Bugun barcha lavashlarga 20% chegirma. Kechqurun 22:00 gacha.';

        foreach ($rows as $row) {
            /*
             * The moment, computed once and nullable: a draft has no send date
             * and the two branches below both need to be able to say so.
             */
            $days = $row['days'];
            $when = is_int($days) ? now()->subDays($days)->setTime(10, 0) : null;
            $left = $row['status'] === 'sent';

            $campaign = Campaign::query()->updateOrCreate(
                ['name' => $row['name']],
                [
                    'body' => $body,
                    'segment' => $row['segment'],
                    'status' => $row['status'],
                    'scheduled_for' => $row['status'] === 'scheduled' ? $when : null,
                    'estimated_cost_tiyin' => SmsCost::tiyin($body, (int) $row['to']),
                ],
            );

            /*
             * The counters are stamped rather than filled, and the cost is the
             * estimate for a campaign that has been sent — which is the honest
             * demo figure: with a log driver nothing was ever billed, and a
             * fabricated invoice would be the exact thing the two cost columns
             * exist to catch.
             */
            $campaign->forceFill([
                'recipients' => $left ? (int) $row['to'] : 0,
                'delivered' => $left ? (int) $row['to'] : 0,
                'failed' => 0,
                'cost_tiyin' => $left ? SmsCost::tiyin($body, (int) $row['to']) : 0,
                'redeemed' => (int) $row['redeemed'],
                'revenue_tiyin' => (int) $row['revenue'] * self::SOM,
                'started_at' => $left ? $when : null,
                'finished_at' => $left && $when !== null ? $when->copy()->addMinutes(18) : null,
            ])->save();
        }
    }
}
