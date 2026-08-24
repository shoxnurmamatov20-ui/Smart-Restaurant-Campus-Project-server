<?php

declare(strict_types=1);

namespace Modules\Marketplace\Providers;

use App\Support\Errors\ApiError;
use App\Support\Errors\ErrorCatalogue;
use App\Support\Modules\ApiModuleServiceProvider;
use Illuminate\Console\Scheduling\Schedule;
use Modules\Marketplace\Console\SettleMerchants;
use Modules\Marketplace\Http\Middleware\RequireConsumerToken;
use Symfony\Component\HttpFoundation\Response;

class MarketplaceServiceProvider extends ApiModuleServiceProvider
{
    protected string $name = 'Marketplace';

    protected string $nameLower = 'marketplace';

    /**
     * @var string[]
     */
    protected array $providers = [
        EventServiceProvider::class,
        RouteServiceProvider::class,
    ];

    /** @var array<int, class-string> */
    protected array $commands = [
        SettleMerchants::class,
    ];

    /**
     * The weekly payout run.
     *
     * Monday at 05:20, and every part of that is an argument. Monday, because a
     * Sunday order delivered at half past midnight belongs to Sunday's trading
     * day and a run at midnight on Sunday would miss it. 05:20, because the
     * backup window is 02:40–03:10 and Analytics rolls up at 04:10 — this reads
     * the same orders those two are walking, and three jobs reading a chain's
     * whole week at once is a database nobody can serve breakfast off.
     *
     * `withoutOverlapping` because a large chain's pass can outlive its hour,
     * and two runs racing on the same week would both try to claim the same
     * orders — the unique index would refuse the loser, which is safe and is
     * still an alert somebody has to read at five in the morning.
     */
    protected function configureSchedules(Schedule $schedule): void
    {
        $schedule->command('marketplace:settle')
            ->weeklyOn(Schedule::MONDAY, '05:20')
            ->withoutOverlapping()
            ->runInBackground();
    }

    public function register(): void
    {
        parent::register();

        /*
         * The customer's own door.
         *
         * An alias applied AFTER `auth:sanctum` rather than instead of it,
         * which is the opposite of what CRM had to do one module over. There,
         * `crm.customers` sits behind row-level security and Laravel sorts the
         * framework's `Authenticate` above `ResolveTenant`, so Sanctum would
         * read a guarded table with no tenant set and find nothing.
         *
         * `marketplace.consumers` carries no `tenant_id` and therefore no
         * policy — a marketplace customer belongs to the platform, not to a
         * restaurant — so Sanctum reads it perfectly well. What is left for this
         * middleware is the check Sanctum does not make: that the token belongs
         * to a Consumer and carries the `mp-consumer` ability. A waiter's token
         * is a valid Sanctum token and must not reach "your orders".
         */
        $this->app['router']->aliasMiddleware('mp.consumer', RequireConsumerToken::class);

        ErrorCatalogue::register(...self::refusals());
    }

    /**
     * Every way this module says no.
     *
     * Registered rather than left to the catalogue's fallback, and the
     * difference is not cosmetic: an unknown code answers 500 with "something
     * went wrong". A hungry person told that after pressing "buyurtma berish"
     * presses it again — which is the one response that must never look like a
     * fault, because the second press is a second dinner.
     *
     * @return array<int, ApiError>
     */
    private static function refusals(): array
    {
        return [
            // ---- Signing in ----
            /*
             * The same four shapes CRM's door has, under this module's own
             * codes. Deliberately not shared: the client screens are different,
             * and a marketplace app branching on `crm.otp_wrong` would be reading
             * another surface's vocabulary.
             */
            new ApiError(
                'marketplace.otp_too_soon',
                Response::HTTP_TOO_MANY_REQUESTS,
                'Kod hozirgina yuborildi. Biroz kuting.',
                'Код уже отправлен. Подождите немного.',
                'A code was just sent. Please wait a moment.',
                retryable: true,
            ),
            new ApiError(
                'marketplace.otp_undeliverable',
                Response::HTTP_BAD_GATEWAY,
                'SMS yuborilmadi. Keyinroq urinib ko\'ring.',
                'SMS не отправлено. Попробуйте позже.',
                'The code could not be sent. Try again shortly.',
                retryable: true,
            ),
            new ApiError(
                'marketplace.otp_wrong',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Kod noto\'g\'ri.',
                'Неверный код.',
                'That code is not right.',
            ),
            new ApiError(
                'marketplace.otp_expired',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Kod muddati tugadi. Yangisini so\'rang.',
                'Срок действия кода истёк. Запросите новый.',
                'That code has expired. Ask for a new one.',
            ),
            new ApiError(
                'marketplace.otp_locked',
                Response::HTTP_TOO_MANY_REQUESTS,
                'Juda ko\'p urinish. Biroz kuting.',
                'Слишком много попыток. Подождите.',
                'Too many attempts. Please wait.',
                retryable: true,
            ),

            // ---- Being somebody ----
            new ApiError(
                'marketplace.consumer_token_required',
                Response::HTTP_UNAUTHORIZED,
                'Bu amal uchun kirish kerak.',
                'Для этого действия нужно войти.',
                'This needs a signed-in customer.',
            ),
            new ApiError(
                'marketplace.consumer_blocked',
                Response::HTTP_FORBIDDEN,
                'Hisobingiz bloklangan. Qo\'llab-quvvatlashga murojaat qiling.',
                'Ваш аккаунт заблокирован. Обратитесь в поддержку.',
                'This account is blocked. Please contact support.',
            ),

            // ---- The shop window ----
            new ApiError(
                'marketplace.store_not_found',
                Response::HTTP_NOT_FOUND,
                'Bunday do\'kon topilmadi.',
                'Такой магазин не найден.',
                'No such store.',
            ),
            new ApiError(
                'marketplace.store_closed',
                Response::HTTP_CONFLICT,
                'Do\'kon hozir yopiq.',
                'Магазин сейчас закрыт.',
                'This store is closed right now.',
            ),
            new ApiError(
                'marketplace.no_storefront',
                Response::HTTP_NOT_FOUND,
                'Bu restoran hali bozorda emas.',
                'Этот ресторан ещё не на маркетплейсе.',
                'This restaurant has no storefront yet.',
            ),

            // ---- The basket ----
            new ApiError(
                'marketplace.basket_empty',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Savat bo\'sh.',
                'Корзина пуста.',
                'The basket is empty.',
            ),
            /*
             * Named down to the dish, and the `meta` is why. "Something in your
             * basket is unavailable" makes a guest empty the whole thing and
             * start again; the id lets the screen cross out one line.
             */
            new ApiError(
                'marketplace.dish_unavailable',
                Response::HTTP_CONFLICT,
                'Bu taom hozir sotuvda yo\'q.',
                'Этого блюда сейчас нет.',
                'That dish is not on sale right now.',
            ),
            new ApiError(
                'marketplace.below_minimum',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Buyurtma summasi eng kam summadan kam.',
                'Сумма заказа меньше минимальной.',
                'The basket is below this store\'s minimum.',
            ),

            // ---- The ladder ----
            new ApiError(
                'marketplace.invalid_transition',
                Response::HTTP_CONFLICT,
                'Buyurtmani bu holatga o\'tkazib bo\'lmaydi.',
                'Заказ нельзя перевести в это состояние.',
                'The order cannot move to that state.',
            ),
            new ApiError(
                'marketplace.too_late_to_cancel',
                Response::HTTP_CONFLICT,
                'Buyurtma tayyorlanmoqda — bekor qilib bo\'lmaydi.',
                'Заказ уже готовится — отменить нельзя.',
                'The kitchen has already started; this can no longer be cancelled.',
            ),
            new ApiError(
                'marketplace.not_delivered_yet',
                Response::HTTP_CONFLICT,
                'Buyurtma hali yetkazilmadi.',
                'Заказ ещё не доставлен.',
                'This order has not been delivered yet.',
            ),
            new ApiError(
                'marketplace.already_rated',
                Response::HTTP_CONFLICT,
                'Bu buyurtmaga baho berilgan.',
                'Этот заказ уже оценён.',
                'You have already rated this order.',
            ),

            // ---- Complaints ----
            new ApiError(
                'marketplace.nothing_to_dispute',
                Response::HTTP_CONFLICT,
                'Buyurtma hali yo\'lga chiqmadi.',
                'Заказ ещё не в пути.',
                'Nothing has arrived yet — cancel it instead.',
            ),
            new ApiError(
                'marketplace.dispute_already_open',
                Response::HTTP_CONFLICT,
                'Bu buyurtma bo\'yicha murojaat allaqachon ochilgan.',
                'По этому заказу уже открыто обращение.',
                'A complaint is already open on this order.',
            ),
            // ---- Offers, banners and money out ----
            new ApiError(
                'marketplace.promotion_transition',
                Response::HTTP_CONFLICT,
                'Aksiyani bu holatga o\'tkazib bo\'lmaydi.',
                'Акцию нельзя перевести в это состояние.',
                'That offer cannot move to that state.',
            ),
            new ApiError(
                'marketplace.budget_below_spend',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Byudjet allaqachon sarflangan summadan kam bo\'lishi mumkin emas.',
                'Бюджет не может быть меньше уже потраченного.',
                'The budget cannot be less than what has already been spent.',
            ),
            new ApiError(
                'marketplace.placement_already_booked',
                Response::HTTP_CONFLICT,
                'Bu kun uchun joylashuv allaqachon band qilingan.',
                'Размещение на этот день уже забронировано.',
                'This slot is already booked from that date.',
            ),
            new ApiError(
                'marketplace.placement_not_live',
                Response::HTTP_CONFLICT,
                'Bu joylashuv allaqachon bekor qilingan.',
                'Это размещение уже отменено.',
                'That placement has already been cancelled.',
            ),
            new ApiError(
                'marketplace.payout_missing',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'To\'lov rekvizitlari kiritilmagan.',
                'Платёжные реквизиты не заполнены.',
                'No payout details have been entered.',
            ),

            // ---- The subscription ----
            new ApiError(
                'marketplace.plus_already_active',
                Response::HTTP_CONFLICT,
                'Plus obunasi allaqachon faol.',
                'Подписка Plus уже активна.',
                'Plus is already active on this account.',
            ),
            new ApiError(
                'marketplace.plus_not_active',
                Response::HTTP_CONFLICT,
                'Faol Plus obunasi yo\'q.',
                'Активной подписки Plus нет.',
                'There is no active Plus subscription.',
            ),
            new ApiError(
                'marketplace.plus_rail_unknown',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Bunday to\'lov usuli yo\'q.',
                'Такого способа оплаты нет.',
                'That payment rail does not exist.',
            ),

            // ---- How far a courier will ride ----
            /*
             * 422 rather than 409, and the difference matters to the screen: a
             * conflict invites a retry, and retrying this address will never
             * work. The meta carries the distance so the checkout can say how
             * far outside they are instead of "no".
             */
            new ApiError(
                'marketplace.outside_delivery_zone',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Bu manzil yetkazib berish hududidan tashqarida.',
                'Этот адрес вне зоны доставки.',
                'That address is outside this store\'s delivery area.',
            ),

            new ApiError(
                'marketplace.dispute_closed',
                Response::HTTP_CONFLICT,
                'Bu murojaat allaqachon hal qilingan.',
                'Это обращение уже закрыто.',
                'That complaint has already been answered.',
            ),
        ];
    }
}
