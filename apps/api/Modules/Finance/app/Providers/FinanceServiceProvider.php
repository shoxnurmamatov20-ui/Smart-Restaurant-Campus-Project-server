<?php

declare(strict_types=1);

namespace Modules\Finance\Providers;

use App\Contracts\Finance\DayBook;
use App\Contracts\Finance\PaymentGateways;
use App\Contracts\Finance\TillLedger;
use App\Support\Errors\ApiError;
use App\Support\Errors\ErrorCatalogue;
use App\Support\Modules\ApiModuleServiceProvider;
use Illuminate\Console\Scheduling\Schedule;
use Modules\Finance\Console\RelayFiscalReceipts;
use Modules\Finance\Fiscal\DemoFiscalDriver;
use Modules\Finance\Fiscal\FiscalDriver;
use Modules\Finance\Fiscal\HttpOfdDriver;
use Modules\Finance\Fiscal\UnavailableFiscalDriver;
use Modules\Finance\Models\CashMovement;
use Modules\Finance\Models\Expense;
use Modules\Finance\Models\Payment;
use Modules\Finance\Observers\ClosedPeriodObserver;
use Modules\Finance\Payments\GatewayRegistry;
use Modules\Finance\Services\EloquentDayBook;
use Modules\Finance\Services\EloquentTillLedger;
use Modules\Finance\Services\PeriodLock;
use Symfony\Component\HttpFoundation\Response;

class FinanceServiceProvider extends ApiModuleServiceProvider
{
    /**
     * The name of the module.
     */
    protected string $name = 'Finance';

    /**
     * The lowercase version of the module name.
     */
    protected string $nameLower = 'finance';

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
        RelayFiscalReceipts::class,
    ];

    /**
     * Finance answers the platform's write contract for money.
     *
     * The till asks for a payment; this module decides whether it gets one. A
     * second payments table living in the POS would guarantee two answers to
     * "what did we take today".
     */
    public function register(): void
    {
        parent::register();

        $this->app->bind(TillLedger::class, EloquentTillLedger::class);

        // The day's takings for surfaces that are not the cash desk — the POS
        // idle screen first. Same override-the-fallback shape as the ledger.
        $this->app->bind(DayBook::class, EloquentDayBook::class);

        $this->app->singleton(FiscalDriver::class, static fn (): FiscalDriver => self::fiscalDriver());

        /*
         * The online rails, and why this is a singleton.
         *
         * `available()` is asked once per provider on every checkout render, and
         * it reads configuration that cannot change inside one request. Built
         * per-resolution it would construct four drivers on every question; built
         * once it constructs them on the first.
         *
         * `singleton` rather than `bindIf`, unlike the read contracts above:
         * Finance IS the module that owns payments, so when it is installed its
         * registry is the answer, and the empty-list fallback in
         * AppServiceProvider is for installations where it is not.
         */
        $this->app->singleton(PaymentGateways::class, GatewayRegistry::class);

        /*
         * One lock per request, and only one.
         *
         * It caches which months are closed for the length of a request — see
         * `PeriodLock` for why caching any longer would be worse than not
         * caching at all. A singleton is what makes that cache mean anything:
         * bound per-resolution, a night's drain of three hundred payments would
         * ask the database three hundred times and the cache would never hit.
         */
        $this->app->singleton(PeriodLock::class);

        ErrorCatalogue::register(...self::refusals());
    }

    /**
     * The gate on every money row this module writes.
     *
     * On the models rather than in the controllers, because the controllers are
     * not where money is written: the till, the offline queue, a refund and a
     * collection all reach these tables through `TillLedger` and never touch an
     * HTTP handler in this module. A check per controller would have covered two
     * doors out of six, and the four it missed run unattended.
     *
     * `amendClosedShift()` is deliberately NOT exempt — see the
     * `accounting_periods` migration for the argument.
     */
    public function boot(): void
    {
        parent::boot();

        Payment::observe(ClosedPeriodObserver::class);
        Expense::observe(ClosedPeriodObserver::class);
        CashMovement::observe(ClosedPeriodObserver::class);
    }

    /**
     * The fiscal queue's safety net.
     *
     * `FiscalRegistrar` files straight after a sale commits, so on a healthy
     * evening this finds nothing. It runs for the unhealthy ones — the tax
     * service down for an hour, a worker killed mid-request, a restaurant that
     * traded all day before its OFD was configured — and it is what closes a
     * window that passed while a document was waiting for its next retry.
     *
     * `withoutOverlapping` for the same reason `events:relay` has it: two passes
     * running together would file the same declaration twice, and a duplicate
     * declaration is a meal the restaurant is taxed on and never sold.
     */
    protected function configureSchedules(Schedule $schedule): void
    {
        $schedule->command('fiscal:relay')
            ->everyMinute()
            ->withoutOverlapping()
            ->runInBackground();
    }

    /**
     * Which fiscal provider this installation talks to.
     *
     * `none` is the default and a working state rather than an error: a
     * restaurant sets its OFD up on the day it goes live and is still cooking
     * before that. Receipts queue against `UnavailableFiscalDriver` and file
     * themselves the moment a provider appears — as long as that happens inside
     * the window, which is exactly the fact a restaurant trading without a
     * fiscal module should be confronted with.
     *
     * An unknown name falls back to `none` rather than throwing. A typo in an
     * environment variable must not stop a till from booting, and the probe
     * endpoint says plainly that nothing is configured.
     */
    private static function fiscalDriver(): FiscalDriver
    {
        return match ((string) config('finance.fiscal.driver', 'none')) {
            'demo' => new DemoFiscalDriver(
                moduleNo: (string) (config('finance.fiscal.module_no') ?? '00000000'),
                // The driver refuses to construct in production, which is where
                // this argument earns its place: a manufactured fiscal sign on a
                // live server is a restaurant that believes it is compliant.
                production: app()->environment('production'),
            ),
            /*
             * The two real operators, and one class behind both.
             *
             * What differs between Uzbekistan's OFDs is two endpoint paths and
             * four field names, all of which are configuration — see
             * `finance.fiscal.ofd`. The name is passed through because it lands
             * on every receipt row, and "which operator filed this" is a question
             * an accountant asks six months later about a venue that has since
             * changed provider.
             */
            'soliq', 'multibank' => new HttpOfdDriver(
                provider: (string) config('finance.fiscal.driver'),
                baseUrl: (string) config('finance.fiscal.ofd.url', ''),
                token: self::stringOrNull(config('finance.fiscal.ofd.token')),
                moduleNo: self::stringOrNull(config('finance.fiscal.module_no')),
                fields: (array) config('finance.fiscal.ofd.fields', []),
                registerPath: (string) config('finance.fiscal.ofd.register_path', '/receipts'),
                statusPath: (string) config('finance.fiscal.ofd.status_path', '/status'),
            ),
            default => new UnavailableFiscalDriver,
        };
    }

    /**
     * A configuration value that is only useful when it is a non-empty string.
     *
     * `env()` answers `''` for a variable that is present and blank, and a blank
     * OFD token is exactly as unusable as a missing one — but truthy enough to
     * pass a careless check and produce an `Authorization: Bearer ` header that
     * the tax service refuses with a message nobody can act on.
     */
    private static function stringOrNull(mixed $value): ?string
    {
        return is_string($value) && trim($value) !== '' ? trim($value) : null;
    }

    /**
     * Every way this module says no.
     *
     * Almost all of them belong to closing a till, and that is not an accident:
     * the count at the end of a service is the one moment in a restaurant's day
     * when the software has to refuse a person holding money, out loud, with a
     * reason they can act on. "422" is not a reason. Each of these is written so
     * that a cashier reading it in their own language knows what to do next —
     * fetch the manager, recount, or say why.
     *
     * Three languages in the response rather than one, because fourteen surfaces
     * read this API and none of them can translate a hardcoded Uzbek sentence.
     *
     * @return list<ApiError>
     */
    private static function refusals(): array
    {
        return [
            // ---- The shift itself ----
            new ApiError(
                'finance.shift_already_closed',
                Response::HTTP_CONFLICT,
                'Bu smena allaqachon yopilgan.',
                'Эта смена уже закрыта.',
                'This shift has already been closed.',
            ),
            new ApiError(
                'finance.shift_counting',
                Response::HTTP_CONFLICT,
                'Smena sanalmoqda — sanoq tugagunicha kutib turing.',
                'Смена пересчитывается — дождитесь окончания подсчёта.',
                'The drawer is being counted — wait until the count is finished.',
            ),
            new ApiError(
                'finance.shift_refused',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Kassa amalini bajarib bo\'lmadi.',
                'Не удалось выполнить кассовую операцию.',
                'The till could not carry out that operation.',
            ),

            // ---- Counting the drawer ----
            new ApiError(
                'finance.count_missing',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Yashikdagi pulni sanang — nominal bo\'yicha yoki jami summa bilan.',
                'Пересчитайте деньги в ящике — по номиналам или общей суммой.',
                'Count the drawer — by denomination, or as a total.',
            ),
            new ApiError(
                'finance.count_mismatch',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Sanalgan banknotlar jami kiritilgan summaga to\'g\'ri kelmadi. Qaytadan sanang.',
                'Сумма по номиналам не совпадает с введённой суммой. Пересчитайте.',
                'The notes do not add up to the total entered. Count again.',
            ),
            new ApiError(
                'finance.count_negative',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Sanalgan naqd manfiy bo\'la olmaydi.',
                'Пересчитанная наличность не может быть отрицательной.',
                'A counted drawer cannot be negative.',
            ),
            new ApiError(
                'finance.unknown_denomination',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Bunday nominal yo\'q. Muomaladagi banknotlarni kiriting.',
                'Такого номинала нет. Введите банкноты, которые в обращении.',
                'That is not a note in circulation. Use the denominations listed.',
            ),
            new ApiError(
                'finance.negative_note_count',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Banknotlar soni manfiy bo\'la olmaydi.',
                'Количество банкнот не может быть отрицательным.',
                'A note count cannot be negative.',
            ),

            // ---- The difference, and who may sign for it ----
            new ApiError(
                'finance.variance_needs_reason',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Farq bor — sababini yozing.',
                'Есть расхождение — укажите причину.',
                'The drawer does not agree — give the reason.',
            ),
            new ApiError(
                'finance.variance_needs_approval',
                Response::HTTP_FORBIDDEN,
                'Bu farq menejer tasdig\'isiz yopilmaydi.',
                'Такое расхождение нельзя закрыть без подтверждения менеджера.',
                'A difference this size needs a manager to authorise it.',
            ),
            new ApiError(
                'finance.variance_approver_unknown',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Tasdiqlovchi xodim topilmadi.',
                'Подтверждающий сотрудник не найден.',
                'That approver was not found.',
            ),
            new ApiError(
                'finance.variance_approver_not_permitted',
                Response::HTTP_FORBIDDEN,
                'Bu xodim kassa farqini tasdiqlay olmaydi.',
                'Этот сотрудник не может подтверждать кассовое расхождение.',
                'That member of staff cannot authorise a till difference.',
            ),
            new ApiError(
                'finance.variance_self_approved',
                Response::HTTP_FORBIDDEN,
                'O\'z farqingizni o\'zingiz tasdiqlay olmaysiz — boshqa mas\'ul kerak.',
                'Нельзя подтвердить собственное расхождение — нужен другой ответственный.',
                'You cannot authorise your own difference — it needs somebody else.',
            ),

            /*
             * ---- The tax authority ----
             *
             * The only fiscal refusal in the catalogue, and it is deliberately
             * the only one: everywhere else a dead fiscal module stays silent and
             * lets the sale through. Here it has to speak, because a duplicate of
             * a document that was never accepted is a second piece of paper that
             * verifies nothing while carrying a stamp that says it does.
             */
            new ApiError(
                'finance.fiscal_not_registered',
                Response::HTTP_CONFLICT,
                'Bu chek hali fiskallashtirilmagan — nusxa chiqarib bo\'lmaydi.',
                'Этот чек ещё не фискализирован — копию распечатать нельзя.',
                'This receipt has not been fiscalised yet — there is nothing to copy.',
            ),

            // ---- Handing the till over ----
            /*
             * ---- Paying online ----
             *
             * Read by a guest's phone rather than by a cashier, which changes
             * what a good message is: nobody here can fetch a manager or recount
             * a drawer. Each one says what the guest should do instead — pick
             * another button, ask the waiter, or stop trying because the meal is
             * already paid for.
             */
            new ApiError(
                'finance.payment_provider_unavailable',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Bu to\'lov usuli hozir ishlamayapti — boshqasini tanlang.',
                'Этот способ оплаты сейчас недоступен — выберите другой.',
                'That payment method is not available — choose another one.',
            ),
            new ApiError(
                'finance.payment_order_unknown',
                Response::HTTP_NOT_FOUND,
                'Bunday hisob topilmadi. Chekdagi raqamni tekshiring.',
                'Такой счёт не найден. Проверьте номер на чеке.',
                'No such bill. Check the number on your receipt.',
            ),
            new ApiError(
                'finance.payment_order_settled',
                Response::HTTP_CONFLICT,
                'Bu hisob allaqachon yopilgan — qayta to\'lash shart emas.',
                'Этот счёт уже закрыт — платить повторно не нужно.',
                'This bill is already settled — there is nothing left to pay.',
            ),
            new ApiError(
                'finance.payment_invoice_unknown',
                Response::HTTP_NOT_FOUND,
                'To\'lov hujjati topilmadi.',
                'Платёжный документ не найден.',
                'That payment could not be found.',
            ),
            /*
             * Retryable, and it is the only refusal in this module that is.
             *
             * The bank said no to opening the invoice — a rotated key, a
             * merchant account briefly suspended, a checkout host that timed
             * out. None of that is anything the guest did, and all of it can
             * come right in a minute, so an offline queue may replay it. Every
             * other refusal here is a fact about the drawer or the bill and
             * will fail identically forever.
             */
            new ApiError(
                'finance.payment_provider_refused',
                Response::HTTP_BAD_GATEWAY,
                'To\'lov tizimi javob bermadi. Birozdan keyin qayta urining.',
                'Платёжная система не ответила. Попробуйте ещё раз позже.',
                'The payment provider did not answer. Try again in a moment.',
                retryable: true,
            ),

            new ApiError(
                'finance.handover_cashier_busy',
                Response::HTTP_CONFLICT,
                'Bu xodimda allaqachon ochiq smena bor.',
                'У этого сотрудника уже есть открытая смена.',
                'That member of staff already has a shift open.',
            ),

            /*
            |------------------------------------------------------------------
            | Closing the month
            |------------------------------------------------------------------
            | `period_closed` is thrown by `PeriodLock` from a model observer, so
            | it can surface on ANY money write in this module — a POS capture, an
            | offline batch, an expense typed into the console. That is why its
            | sentence names the month rather than the screen: the person reading
            | it is looking at a date field they got wrong, and "the period is
            | closed" alone sends them to check today's date, which is not the one
            | that was refused. The throw site fills the month in — see
            | `PeriodLock::assertOpen()`.
            |
            | 422 rather than 409. A conflict is a race two callers could resolve
            | by retrying; this is a fact about the document that will be just as
            | true tomorrow.
            */
            new ApiError(
                'finance.period_closed',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Bu davr yopilgan — unga yangi yozuv kiritib bo\'lmaydi.',
                'Этот период закрыт — новые записи в него невозможны.',
                'That period is closed — nothing new can be booked into it.',
            ),
            new ApiError(
                'finance.period_still_running',
                Response::HTTP_CONFLICT,
                'Davr hali tugamagan — joriy oyni yopib bo\'lmaydi.',
                'Период ещё не закончился — текущий месяц закрыть нельзя.',
                'The period has not ended yet — a running month cannot be closed.',
            ),
            new ApiError(
                'finance.period_already_closed',
                Response::HTTP_CONFLICT,
                'Bu davr allaqachon yopilgan.',
                'Этот период уже закрыт.',
                'That period is already closed.',
            ),
            new ApiError(
                'finance.period_not_closed',
                Response::HTTP_CONFLICT,
                'Bu davr yopilmagan — ochish uchun avval yopilgan bo\'lishi kerak.',
                'Этот период не закрыт — открывать нечего.',
                'That period is not closed, so there is nothing to reopen.',
            ),
            new ApiError(
                'finance.unknown_period',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Davr YYYY-MM ko\'rinishida bo\'lishi kerak.',
                'Период должен быть в формате YYYY-MM.',
                'A period is written as YYYY-MM.',
            ),

            /*
            |------------------------------------------------------------------
            | Configuration: tenders and headings
            |------------------------------------------------------------------
            | Both `is_system` refusals are about the same thing from two ends: the
            | till writes `refund` and `payroll` by name, at closing time, in the
            | room. A restaurant that archived either would find that out at
            | midnight with the drawer open.
            */
            new ApiError(
                'finance.unknown_payment_method',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Bunday to\'lov turi yo\'q.',
                'Такого способа оплаты нет.',
                'That is not a payment method this platform can take money through.',
            ),
            new ApiError(
                'finance.unknown_expense_category',
                Response::HTTP_NOT_FOUND,
                'Bunday xarajat toifasi yo\'q.',
                'Такой категории расходов нет.',
                'There is no such category.',
            ),
            new ApiError(
                'finance.category_is_system',
                Response::HTTP_CONFLICT,
                'Bu toifani kassa o\'zi yozadi — o\'chirib ham, arxivlab ham bo\'lmaydi.',
                'Эту категорию пишет касса — её нельзя удалить или архивировать.',
                'The till writes this category itself — it cannot be removed or archived.',
            ),
            new ApiError(
                'finance.category_in_use',
                Response::HTTP_CONFLICT,
                'Bu toifada yozuvlar bor — o\'chirish o\'rniga arxivlang.',
                'В этой категории есть записи — заархивируйте вместо удаления.',
                'There are entries under this heading — archive it instead of deleting it.',
            ),

            /*
            |------------------------------------------------------------------
            | The cash book
            |------------------------------------------------------------------
            | A transfer is two legs. `transfer_incomplete` is the one that
            | matters: a destination that was silently null is exactly the
            | one-legged write this endpoint replaced, and it made a night that
            | earned money read as a loss.
            */
            new ApiError(
                'finance.transfer_incomplete',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Pul qayerdan qayerga ko\'chgani ko\'rsatilmagan.',
                'Не указано, откуда и куда переведены деньги.',
                'A transfer has to say where the money left and where it arrived.',
            ),
            new ApiError(
                'finance.transfer_same_place',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Pul o\'sha joyning o\'ziga ko\'chirilmaydi.',
                'Деньги нельзя перевести туда же, откуда они взяты.',
                'Money cannot be moved to where it already is.',
            ),
            new ApiError(
                'finance.transfer_not_positive',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Ko\'chiriladigan summa noldan katta bo\'lishi kerak.',
                'Сумма перевода должна быть больше нуля.',
                'A transfer has to be for more than nothing.',
            ),
            new ApiError(
                'finance.window_backwards',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Boshlanish sanasi tugash sanasidan keyin bo\'lolmaydi.',
                'Начальная дата не может быть позже конечной.',
                'The window starts after it ends.',
            ),
            new ApiError(
                'finance.window_too_wide',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Kassa daftari bir marta eng ko\'pi bilan bir chorakni ko\'rsatadi.',
                'Кассовая книга показывает не больше квартала за раз.',
                'The cash book answers at most one quarter at a time.',
            ),
        ];
    }
}
