<?php

declare(strict_types=1);

namespace Modules\Pos\Providers;

use App\Support\Errors\ApiError;
use App\Support\Errors\ErrorCatalogue;
use Modules\Pos\Http\Middleware\RequireTerminalSession;
use Nwidart\Modules\Support\ModuleServiceProvider;
use Symfony\Component\HttpFoundation\Response;

class PosServiceProvider extends ModuleServiceProvider
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
                'pos.pin_forbidden',
                Response::HTTP_FORBIDDEN,
                'Sessiya yopildi.',
                'Сессия закрыта.',
                'The session was closed.',
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
                'pos.approval_closed',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Bu so\'rovga allaqachon javob berilgan yoki muddati o\'tgan.',
                'На этот запрос уже ответили или он истёк.',
                'That request was already answered or has expired.',
            ),
        );
    }
}
