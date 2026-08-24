<?php

declare(strict_types=1);

namespace Modules\Pos\Providers;

use App\Contracts\Pos\Approvals;
use App\Contracts\Pos\DiscountLimits;
use App\Contracts\Pos\TerminalRegistry;
use App\Support\Errors\ApiError;
use App\Support\Errors\ErrorCatalogue;
use App\Support\Modules\ApiModuleServiceProvider;
use Modules\Pos\Http\Middleware\RequireTerminalSession;
use Modules\Pos\Http\Middleware\RequireTerminalToken;
use Modules\Pos\Services\LedgerApprovals;
use Modules\Pos\Services\PlatformTerminalRegistry;
use Modules\Pos\Services\TerminalDiscountLimits;
use Symfony\Component\HttpFoundation\Response;

class PosServiceProvider extends ApiModuleServiceProvider
{
    /**
     * The name of the module.
     */
    protected string $name = 'Pos';

    /**
     * The lowercase version of the module name.
     */
    protected string $nameLower = 'pos';

    /**
     * Provider classes to register.
     *
     * @var string[]
     */
    protected array $providers = [
        EventServiceProvider::class,
        RouteServiceProvider::class,
    ];

    public function boot(): void
    {
        parent::boot();

        // Every till write needs to know which terminal and which person, and
        // neither may come from the request body. See the middleware.
        $this->app['router']->aliasMiddleware('pos.session', RequireTerminalSession::class);

        // The device-only gate: a paired, active terminal and no person yet.
        // Used by the heartbeat and the idle screen, which both answer before
        // anybody has typed a PIN.
        $this->app['router']->aliasMiddleware('pos.device', RequireTerminalToken::class);
    }

    /**
     * The refusals a till can issue.
     *
     * Statuses are carried over from the responses these replace, with one
     * exception worth naming: every `pos.session_*` code is 403 rather than
     * 401, because the device token IS valid — it is the human session behind
     * it that is missing or timed out. A 401 would send a paired terminal
     * back through pairing; a 403 sends the waiter back to the PIN pad, which
     * is what actually needs to happen.
     */
    public function register(): void
    {
        parent::register();

        /*
         * The discount ceiling, for the console's roles screen.
         *
         * Core must not import a module, and `settings/permissions` is core —
         * so the number the till already reads from
         * `Terminal.settings.discount_limits` is offered through a contract
         * rather than copied into a fifth place. See App\Contracts\Pos\DiscountLimits.
         */
        $this->app->bind(DiscountLimits::class, TerminalDiscountLimits::class);

        /*
         * The platform console's device wall. Cross-tenant by definition, so
         * core cannot own the query and cannot import this module to make it.
         */
        $this->app->bind(TerminalRegistry::class, PlatformTerminalRegistry::class);

        /*
         * The approval ledger, for the two callers that are not a till: the
         * staff app's handset and the console's own bill actions. Both need the
         * rule "the person who asks is never the person who agrees", and neither
         * may import this module to get it.
         */
        $this->app->bind(Approvals::class, LedgerApprovals::class);

        ErrorCatalogue::register(
            new ApiError(
                'pos.session_required',
                Response::HTTP_FORBIDDEN,
                'Kassa sessiyasi talab qilinadi.',
                'Требуется сессия кассы.',
                'A till session is required.',
            ),
            new ApiError(
                'pos.session_token_required',
                Response::HTTP_FORBIDDEN,
                'Bu token kassa sessiyasiga bog\'lanmagan.',
                'Этот токен не привязан к сессии кассы.',
                'This token is not bound to a till session.',
            ),
            new ApiError(
                'pos.session_closed',
                Response::HTTP_FORBIDDEN,
                'Kassa sessiyasi topilmadi yoki yopilgan.',
                'Сессия кассы не найдена или закрыта.',
                'The till session is missing or closed.',
            ),
            new ApiError(
                'pos.session_timeout',
                Response::HTTP_FORBIDDEN,
                'Sessiya harakatsizlikdan yopildi. PIN kiriting.',
                'Сессия закрыта из-за бездействия. Введите PIN.',
                'The session closed on inactivity. Enter your PIN.',
            ),
            new ApiError(
                'pos.terminal_inactive',
                Response::HTTP_FORBIDDEN,
                'Terminal faol emas.',
                'Терминал неактивен.',
                'This terminal is not active.',
            ),
            new ApiError(
                'pos.terminal_token_required',
                Response::HTTP_FORBIDDEN,
                'Terminal tokeni talab qilinadi.',
                'Требуется токен терминала.',
                'A terminal token is required.',
            ),
            new ApiError(
                'pos.terminal_disabled',
                Response::HTTP_FORBIDDEN,
                'Bu terminal o\'chirilgan — menejerga murojaat qiling.',
                'Этот терминал отключён — обратитесь к менеджеру.',
                'This terminal has been switched off — speak to a manager.',
            ),
            new ApiError(
                'pos.pin_forbidden',
                Response::HTTP_FORBIDDEN,
                'Sessiya yopildi.',
                'Сессия закрыта.',
                'The session was closed.',
            ),
            new ApiError(
                'pos.pin_invalid',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'PIN noto\'g\'ri.',
                'Неверный PIN.',
                'That PIN is not correct.',
            ),
            new ApiError(
                'pos.pin_locked',
                Response::HTTP_TOO_MANY_REQUESTS,
                'Juda ko\'p noto\'g\'ri urinish — PIN vaqtincha qulflandi.',
                'Слишком много неверных попыток — PIN временно заблокирован.',
                'Too many wrong attempts — this PIN is locked for now.',
                // Retryable: the same request will work once the lock expires,
                // which is exactly what `retryable` is for. `retry_after_minutes`
                // rides in the meta so a client can say how long rather than
                // parsing it out of a sentence.
                retryable: true,
            ),
            new ApiError(
                'pos.pin_no_till_permission',
                Response::HTTP_FORBIDDEN,
                'Sizda kassada ishlash huquqi yo\'q.',
                'У вас нет прав работать на кассе.',
                'You do not have permission to work a till.',
            ),
            new ApiError(
                'pos.pin_mismatch',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Joriy PIN noto\'g\'ri.',
                'Текущий PIN неверен.',
                'That current PIN is not correct.',
            ),
            new ApiError(
                'pos.user_not_found',
                Response::HTTP_NOT_FOUND,
                'Xodim topilmadi.',
                'Сотрудник не найден.',
                'That employee was not found.',
            ),
            new ApiError(
                'pos.bill_not_found',
                Response::HTTP_NOT_FOUND,
                'Hisob topilmadi.',
                'Счёт не найден.',
                'That bill was not found.',
            ),
            new ApiError(
                'pos.bill_refused',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Hisobni o\'zgartirib bo\'lmadi.',
                'Счёт изменить не удалось.',
                'The bill could not be changed.',
            ),
            new ApiError(
                'pos.no_open_shift',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Ochiq smena yo\'q. Avval smenani oching.',
                'Нет открытой смены. Сначала откройте смену.',
                'There is no open shift. Open one first.',
            ),
            new ApiError(
                'pos.shift_refused',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Smenani o\'zgartirib bo\'lmadi.',
                'Смену изменить не удалось.',
                'The shift could not be changed.',
            ),
            new ApiError(
                'pos.drawer_refused',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Kassa harakatini yozib bo\'lmadi.',
                'Движение по кассе записать не удалось.',
                'The drawer movement could not be recorded.',
            ),
            new ApiError(
                'pos.tender_refused',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'To\'lovni qabul qilib bo\'lmadi.',
                'Оплату принять не удалось.',
                'The payment could not be taken.',
            ),
            new ApiError(
                'pos.approval_required',
                Response::HTTP_FORBIDDEN,
                'Menejer tasdig\'i kerak.',
                'Нужно согласование менеджера.',
                'This needs a manager\'s approval.',
            ),
            new ApiError(
                'pos.approval_invalid',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Tasdiq kaliti yaroqsiz.',
                'Ключ согласования недействителен.',
                'That approval token is not valid.',
            ),
            new ApiError(
                'pos.approval_self',
                Response::HTTP_FORBIDDEN,
                'O\'z so\'rovingizni o\'zingiz tasdiqlay olmaysiz.',
                'Нельзя согласовать собственный запрос.',
                'You cannot approve your own request.',
            ),
            new ApiError(
                'pos.approval_no_permission',
                Response::HTTP_FORBIDDEN,
                'Bu xodim tasdiqlay olmaydi — menejer PIN\'ini kiriting.',
                'Этот сотрудник не может согласовывать — введите PIN менеджера.',
                'That employee cannot authorise this — enter a manager\'s PIN.',
            ),
            new ApiError(
                'pos.approval_closed',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Bu so\'rovga allaqachon javob berilgan yoki muddati o\'tgan.',
                'На этот запрос уже ответили или он истёк.',
                'That request was already answered or has expired.',
            ),

            /*
             * ---- P12: the six ways an offline queue disagrees ----
             *
             * All 409, and each with its own code rather than one
             * `pos.sync_conflict`, because a client branches on the code to pick
             * which question to ask. `conflict_kind` and `options[]` travel in the
             * meta alongside; see Modules\Pos\Sync\ConflictKind.
             *
             * None are retryable. That flag means "the same request might work if
             * you send it again", and none of these will: the world moved, and a
             * person has to say what to do about it. Marking them retryable is how
             * a till ends up looping on a queue that will never drain.
             */
            new ApiError(
                'pos.conflict_bill_settled',
                Response::HTTP_CONFLICT,
                'Bu hisob siz oflaynda ekaningizda yopilgan.',
                'Этот счёт закрыли, пока касса была офлайн.',
                'This bill was closed while the till was offline.',
            ),
            new ApiError(
                'pos.conflict_payment_duplicate',
                Response::HTTP_CONFLICT,
                'Bu hisob allaqachon to\'langan — bu to\'lov ikkinchi marta yozilardi.',
                'Счёт уже оплачен — этот платёж был бы вторым.',
                'This bill is already paid; recording this would charge twice.',
            ),
            new ApiError(
                'pos.conflict_item_unavailable',
                Response::HTTP_CONFLICT,
                'Bu taom siz oflaynda ekaningizda stop-listga tushdi.',
                'Это блюдо попало в стоп-лист, пока касса была офлайн.',
                'This dish went on the stop list while the till was offline.',
            ),
            new ApiError(
                'pos.conflict_price_moved',
                Response::HTTP_CONFLICT,
                'Mehmonga aytilgan narx hozirgi narxdan farq qiladi.',
                'Названная гостю цена отличается от текущей.',
                'The price quoted to the guest is not the price now.',
            ),
            new ApiError(
                'pos.conflict_table_taken',
                Response::HTTP_CONFLICT,
                'Bu stolda boshqa ochiq hisob bor.',
                'На этом столе уже есть открытый счёт.',
                'This table already has an open bill.',
            ),
            new ApiError(
                'pos.conflict_shift_closed',
                Response::HTTP_CONFLICT,
                'Bu pul allaqachon sanalgan smenaga tegishli.',
                'Эти деньги относятся к уже посчитанной смене.',
                'This money belongs to a shift that has already been counted.',
            ),

            /*
             * ---- and the two ways an ANSWER to one can be wrong ----
             *
             * 422, not 409. A conflict is the world having moved; these two are
             * a client sending something the contract does not allow, which is
             * the ordinary meaning of an unprocessable request. Sharing the 409
             * would make a till retry a resolve it can never get right.
             */
            new ApiError(
                'pos.conflict_option_unknown',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Bu javob bu ziddiyat uchun mavjud emas.',
                'Этот вариант недоступен для этого конфликта.',
                'That is not one of the answers this conflict offers.',
            ),
            new ApiError(
                'pos.conflict_option_incomplete',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Bu javob uchun qo\'shimcha ma\'lumot kerak.',
                'Для этого варианта нужны дополнительные данные.',
                'That answer needs something more before it can be applied.',
            ),

            /*
             * A verb in a queue that this person could not have done at the till.
             *
             * `POST sync/batch` is one route carrying eleven verbs, so the
             * per-verb permission the other routes declare has to be checked
             * again inside it. Without this a waiter could queue `bill.cancel`
             * offline and void a table's whole bill on replay, having been
             * refused it every time they tried it online — the queue would become
             * the way around every guard in the module.
             *
             * 403 and its own code rather than the generic Spatie refusal: the
             * till has to be able to say WHICH entry in a forty-long queue it may
             * not replay, and hand that one to somebody who can.
             */
            new ApiError(
                'pos.sync_action_forbidden',
                Response::HTTP_FORBIDDEN,
                'Sizda bu amalni bajarish huquqi yo\'q.',
                'У вас нет прав на это действие.',
                'You do not have permission for this action.',
            ),

            new ApiError(
                'pos.sync_batch_too_large',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Navbat juda katta — kichikroq bo\'laklarda yuboring.',
                'Очередь слишком большая — отправляйте меньшими частями.',
                'That queue is too large — send it in smaller batches.',
            ),
        );
    }
}
