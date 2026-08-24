<?php

declare(strict_types=1);

namespace Modules\Crm\Providers;

use App\Contracts\Crm\CaseDesk;
use App\Contracts\Crm\GuestAccounts;
use App\Contracts\Crm\Promotions;
use App\Support\Errors\ApiError;
use App\Support\Errors\ErrorCatalogue;
use App\Support\Modules\ApiModuleServiceProvider;
use Illuminate\Console\Scheduling\Schedule;
use Modules\Crm\Console\RunTriggers;
use Modules\Crm\Console\SegmentCustomers;
use Modules\Crm\Http\Middleware\RequireCustomerToken;
use Modules\Crm\Services\EloquentCaseDesk;
use Modules\Crm\Services\EloquentGuestAccounts;
use Modules\Crm\Services\EloquentPromotions;
use Symfony\Component\HttpFoundation\Response;

class CrmServiceProvider extends ApiModuleServiceProvider
{
    /**
     * The name of the module.
     */
    protected string $name = 'Crm';

    /**
     * The lowercase version of the module name.
     */
    protected string $nameLower = 'crm';

    /**
     * Provider classes to register.
     *
     * @var string[]
     */
    protected array $providers = [
        EventServiceProvider::class,
        RouteServiceProvider::class,
    ];

    /** @var array<int, class-string> */
    protected array $commands = [
        SegmentCustomers::class,
        RunTriggers::class,
    ];

    /**
     * The two nightly passes, and why they are not one.
     *
     * `crm:segment` runs at 03:50 and `crm:triggers` at 09:05, four hours later
     * on purpose. Segmentation decides who is at risk; the win-back trigger
     * sends to exactly those people. Running them together would mean a guest
     * crossed the thirty-day line one night and was written to the following
     * morning, which is right — but running triggers FIRST would send yesterday's
     * answer, one day late, every day.
     *
     * The hours themselves are the restaurant's day rather than the clock's.
     * 03:50 is before `analytics:rollup` at 04:10 and after the backup window,
     * with nothing else touching `crm.customers`. 09:05 is the first minute a
     * marketing SMS may legally go out — `crm.campaigns.quiet_hours` opens at
     * nine — so a birthday message lands with the morning rather than waiting in
     * the queue behind the quiet-hours delay.
     */
    protected function configureSchedules(Schedule $schedule): void
    {
        $schedule->command('crm:segment')
            ->dailyAt('03:50')
            ->withoutOverlapping()
            ->runInBackground();

        $schedule->command('crm:triggers')
            ->dailyAt('09:05')
            ->withoutOverlapping()
            ->runInBackground();
    }

    public function register(): void
    {
        parent::register();

        /*
         * CRM answers the platform's tab contract.
         *
         * This is how the till puts a meal on a regular's account without importing
         * a CRM model — and how it keeps working when CRM is switched off, because
         * the core binds a fallback that refuses rather than pretending.
         */
        $this->app->bind(GuestAccounts::class, EloquentGuestAccounts::class);
        $this->app->bind(CaseDesk::class, EloquentCaseDesk::class);

        /*
         * And CRM answers the platform's promotions contract.
         *
         * The reason it has to exist at all is written on `PublicOrderRequest`:
         * a guest's promo code was "recorded, never trusted", because Orders had
         * nothing to ask. A cart that subtracted fifteen percent and a bill that
         * charged full price is the drift this closes.
         */
        $this->app->bind(Promotions::class, EloquentPromotions::class);

        /*
         * The guest's own door.
         *
         * An alias rather than `auth:sanctum`, and the reason is a
         * row-level-security one rather than a stylistic one: Laravel sorts the
         * framework's `Authenticate` middleware ABOVE `ResolveTenant`, so
         * Sanctum would try to read `crm.customers` before any restaurant is
         * known and with the connection fail-closed. `public.users`,
         * `pos.terminals` and `staff.devices` are exempt from the policies for
         * exactly that reason; the guest table holds names, phone numbers,
         * addresses and loyalty balances for every restaurant on the platform
         * and must not join that list. See RequireCustomerToken.
         */
        $this->app['router']->aliasMiddleware('customer.token', RequireCustomerToken::class);

        ErrorCatalogue::register(...self::refusals());
    }

    /**
     * Every way this module says no about a tab.
     *
     * Registered rather than left to the catalogue's fallback, and the difference
     * is not cosmetic: an unknown code answers 500 with "something went wrong".
     * A cashier reading that after typing an amount the guest cannot sign for
     * concludes the till is broken and starts the sale again — the one response
     * that must never look like a fault is the one that means "ask a manager".
     *
     * @return array<int, ApiError>
     */
    private static function refusals(): array
    {
        return [
            // ---- Who may run a tab at all ----
            new ApiError(
                'crm.customer_not_found',
                Response::HTTP_NOT_FOUND,
                'Bunday mijoz topilmadi.',
                'Такой клиент не найден.',
                'No such guest on file.',
            ),
            new ApiError(
                'crm.customer_inactive',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Mijoz faol emas — uning balansiga yozib bo\'lmaydi.',
                'Клиент неактивен — записать на его счёт нельзя.',
                'The guest is not active — nothing can go on their tab.',
            ),
            new ApiError(
                'crm.no_credit_account',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Bu mijozga qarzga sotish ochilmagan. Limitni menejer qo\'yadi.',
                'Этому клиенту счёт не открыт. Лимит устанавливает менеджер.',
                'This guest has no tab. A manager sets the limit.',
            ),

            /*
             * ---- The ceiling ----
             *
             * 403 rather than 422, matching `finance.variance_needs_approval`:
             * nothing about the request is malformed, the person sending it simply
             * lacks the authority. That is also what tells the till to raise a
             * `credit_sale` approval instead of asking the cashier to retype.
             */
            new ApiError(
                'crm.credit_limit_exceeded',
                Response::HTTP_FORBIDDEN,
                'Kredit limitidan oshadi — menejer tasdig\'i kerak.',
                'Превышен кредитный лимит — нужно подтверждение менеджера.',
                'Over the credit limit — a manager has to approve it.',
            ),

            // ---- Amounts that cannot be what they say ----
            new ApiError(
                'crm.amount_invalid',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Summa noto\'g\'ri.',
                'Неверная сумма.',
                'That is not a usable amount.',
            ),
            new ApiError(
                'crm.settlement_exceeds_balance',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Qabul qilinayotgan pul qarzdan ko\'p.',
                'Принимаемая сумма больше долга.',
                'The money offered is more than the guest owes.',
            ),
            new ApiError(
                'crm.reversal_exceeds_charge',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Bu hisobda qarzdan qaytariladigan summa yetarli emas.',
                'По этому счёту к возврату столько не осталось.',
                'There is not that much of this bill left on the tab.',
            ),
            new ApiError(
                'crm.nothing_owed',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Mijozning qarzi yo\'q.',
                'У клиента нет долга.',
                'The guest owes nothing.',
            ),
            new ApiError(
                'crm.writeoff_exceeds_debt',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Qarzdan ko\'proq summani hisobdan chiqarib bo\'lmaydi.',
                'Списать больше, чем должен клиент, нельзя.',
                'More than the guest owes cannot be written off.',
            ),

            /*
             * ---- The same bill, twice ----
             *
             * 409, because both requests are individually valid and the second one
             * lost a race it could not have known about — an offline queue replaying
             * a batch, a tablet retrying a settlement. The client's move is to read
             * the state, not to fix its request.
             */
            new ApiError(
                'crm.charge_conflict',
                Response::HTTP_CONFLICT,
                'Bu hisob allaqachon boshqa summaga qarzga yozilgan.',
                'Этот счёт уже записан в долг на другую сумму.',
                'This bill is already on the tab for a different amount.',
            ),

            /*
             * ---- Signing in by phone ----
             *
             * Four refusals and four different screens. A guest who reads "wrong
             * code" when the code has simply expired types it again and is told
             * the same thing; a guest who reads "too many attempts" when they
             * have used their five sends for the hour goes looking for a bug.
             * Distinguishing them is the difference between a screen a person
             * can act on and one that just says no.
             */
            new ApiError(
                'crm.otp_too_soon',
                Response::HTTP_TOO_MANY_REQUESTS,
                'Kod yaqinda yuborilgan. Biroz kutib, qaytadan urining.',
                'Код был отправлен недавно. Подождите немного и повторите.',
                'A code was sent recently. Wait a moment and try again.',
                retryable: true,
            ),
            new ApiError(
                'crm.otp_undeliverable',
                Response::HTTP_SERVICE_UNAVAILABLE,
                'SMS yuborib bo\'lmadi. Biroz o\'tgach qaytadan urining.',
                'Не удалось отправить SMS. Попробуйте немного позже.',
                'The SMS could not be sent. Please try again shortly.',
                retryable: true,
            ),
            new ApiError(
                'crm.otp_wrong',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Kod noto\'g\'ri.',
                'Неверный код.',
                'That code is not right.',
            ),
            new ApiError(
                'crm.otp_expired',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Kodning muddati tugagan. Yangisini so\'rang.',
                'Срок действия кода истёк. Запросите новый.',
                'That code has expired. Ask for a new one.',
            ),
            new ApiError(
                'crm.otp_locked',
                Response::HTTP_TOO_MANY_REQUESTS,
                'Juda ko\'p noto\'g\'ri urinish. Raqam vaqtincha bloklandi.',
                'Слишком много неверных попыток. Номер временно заблокирован.',
                'Too many wrong attempts. This number is locked for a while.',
                retryable: true,
            ),

            /*
             * ---- The token the code buys ----
             *
             * 401 for both, because both mean "sign in again" — but with
             * different codes, so the app can tell a guest whose session simply
             * ran out (ninety days) from one whose request carried nothing.
             */
            new ApiError(
                'crm.customer_token_required',
                Response::HTTP_UNAUTHORIZED,
                'Bu amal uchun hisobga kirish kerak.',
                'Для этого действия нужно войти в аккаунт.',
                'You need to be signed in for this.',
            ),
            new ApiError(
                'crm.customer_token_expired',
                Response::HTTP_UNAUTHORIZED,
                'Sessiya tugagan. Qaytadan kiring.',
                'Сессия истекла. Войдите снова.',
                'Your session has ended. Please sign in again.',
            ),
            new ApiError(
                'crm.customer_blocked',
                Response::HTTP_FORBIDDEN,
                'Bu hisob to\'xtatilgan. Restoran bilan bog\'laning.',
                'Этот аккаунт заблокирован. Свяжитесь с рестораном.',
                'This account is blocked. Please contact the restaurant.',
            ),

            /*
             * ---- Signing in from inside Telegram ----
             *
             * Two refusals and they are deliberately different: one is the
             * restaurant's setup (no bot connected — the owner can fix it in a
             * minute), the other is the payload (forged, edited or a day old —
             * nothing the guest can fix except opening the mini app again).
             * A single code would send both people to the wrong place.
             */
            new ApiError(
                'telegram.not_configured',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Bu restoran hali Telegram botini ulamagan.',
                'Этот ресторан ещё не подключил Telegram-бота.',
                'This restaurant has not connected a Telegram bot yet.',
            ),
            new ApiError(
                'telegram.invalid_init_data',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Telegram ma\'lumoti tasdiqlanmadi. Mini ilovani qaytadan oching.',
                'Данные Telegram не подтверждены. Откройте мини-приложение заново.',
                'Telegram could not be verified. Open the mini app again.',
            ),

            // ---- Addresses ----
            new ApiError(
                'crm.address_not_found',
                Response::HTTP_NOT_FOUND,
                'Bunday manzil topilmadi.',
                'Такой адрес не найден.',
                'No such address.',
            ),
            new ApiError(
                'crm.address_limit_reached',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Manzillar soni chegarasiga yetdingiz. Bittasini o\'chiring.',
                'Достигнут предел числа адресов. Удалите один.',
                'You have reached the address limit. Delete one first.',
            ),

            // ---- Loyalty coupons ----
            new ApiError(
                'crm.coupon_not_found',
                Response::HTTP_NOT_FOUND,
                'Bunday kupon yo\'q yoki muddati tugagan.',
                'Такого купона нет или срок его действия истёк.',
                'No such coupon, or it has ended.',
            ),
            new ApiError(
                'crm.not_enough_points',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Ballar yetarli emas.',
                'Недостаточно баллов.',
                'Not enough points.',
            ),
            new ApiError(
                // 409 rather than 422: nothing about the request is wrong, it
                // lost a race with its own retry. The client's move is to read
                // the coupon it already holds, not to fix its payload.
                'crm.coupon_already_held',
                Response::HTTP_CONFLICT,
                'Bu kupon sizda allaqachon bor.',
                'Этот купон у вас уже есть.',
                'You already hold this coupon.',
            ),

            /*
             * ---- Promo codes ----
             *
             * `promo.*` rather than `crm.*`, deliberately. The same word is
             * typed into a cart, into a till and one day into the marketplace,
             * and the code a client branches on should name the thing rather
             * than the module that owns the table this month — the same reason
             * `stop_list.item_unavailable` is not `menu.something`.
             *
             * Every one of these is a 422 a guest reads. The order they are
             * checked in matters more than the wording: see PromoCodes.
             */
            new ApiError(
                'promo.not_found',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Bunday promo-kod yo\'q.',
                'Такого промокода нет.',
                'That promo code does not exist.',
            ),
            new ApiError(
                'promo.inactive',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Bu promo-kod ishlamayapti.',
                'Этот промокод не действует.',
                'That promo code is not active.',
            ),
            new ApiError(
                'promo.not_started',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Bu aksiya hali boshlanmagan.',
                'Эта акция ещё не началась.',
                'That campaign has not started yet.',
            ),
            new ApiError(
                'promo.expired',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Bu promo-kodning muddati tugagan.',
                'Срок действия промокода истёк.',
                'That promo code has expired.',
            ),
            new ApiError(
                'promo.exhausted',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Bu promo-kod tugagan.',
                'Этот промокод исчерпан.',
                'That promo code has been used up.',
            ),
            new ApiError(
                'promo.used',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Siz bu promo-koddan allaqachon foydalangansiz.',
                'Вы уже использовали этот промокод.',
                'You have already used that promo code.',
            ),
            new ApiError(
                'promo.min_not_met',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Buyurtma summasi yetarli emas.',
                'Сумма заказа недостаточна.',
                'The basket is below this code\'s minimum.',
            ),
            new ApiError(
                'promo.code_taken',
                Response::HTTP_CONFLICT,
                'Bunday kod allaqachon mavjud.',
                'Такой код уже существует.',
                'That code already exists.',
            ),

            /*
             * ---- Campaigns ----
             *
             * Both are 409 rather than 422: nothing about the request is
             * malformed, it simply arrived after the fact. A marketer who
             * pressed send twice, or a scheduler that swept a campaign a person
             * had already sent by hand, should read the state rather than fix a
             * payload.
             */
            new ApiError(
                'crm.campaign_already_sent',
                Response::HTTP_CONFLICT,
                'Bu kampaniya allaqachon yuborilgan — uni o\'zgartirib bo\'lmaydi.',
                'Эта кампания уже отправлена — изменить её нельзя.',
                'This campaign has already gone out and cannot be changed.',
            ),
            new ApiError(
                'crm.campaign_no_recipients',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Bu segmentda telefon raqami bor birorta mijoz yo\'q.',
                'В этом сегменте нет ни одного клиента с номером телефона.',
                'Nobody in this segment has a phone number.',
            ),

            /*
             * ---- Complaints ----
             *
             * `case_needs_manager` is 403 and not 422, matching
             * `crm.credit_limit_exceeded` and `finance.variance_needs_approval`:
             * nothing about the request is wrong, the person sending it lacks
             * the authority. That is also what tells the screen to ask somebody
             * rather than to ask the operator to retype.
             */
            new ApiError(
                'crm.case_already_decided',
                Response::HTTP_CONFLICT,
                'Bu shikoyatga allaqachon javob berilgan.',
                'На эту жалобу уже дан ответ.',
                'This complaint has already been answered.',
            ),
            new ApiError(
                'crm.case_needs_manager',
                Response::HTTP_FORBIDDEN,
                'Bu summa uchun menejer tasdig\'i kerak.',
                'Для этой суммы нужно подтверждение менеджера.',
                'A manager has to approve an amount this size.',
            ),
        ];
    }
}
