<?php

declare(strict_types=1);

namespace Modules\Staff\Providers;

use App\Contracts\Staff\Roster;
use App\Support\Errors\ApiError;
use App\Support\Errors\ErrorCatalogue;
use App\Support\Modules\ApiModuleServiceProvider;
use Modules\Staff\Services\EloquentRoster;
use Symfony\Component\HttpFoundation\Response;

class StaffServiceProvider extends ApiModuleServiceProvider
{
    /**
     * The name of the module.
     */
    protected string $name = 'Staff';

    /**
     * The lowercase version of the module name.
     */
    protected string $nameLower = 'staff';

    /**
     * Provider classes to register.
     *
     * @var string[]
     */
    protected array $providers = [
        EventServiceProvider::class,
        RouteServiceProvider::class,
    ];

    /**
     * Attendance's one cross-module read — how many people are in the
     * building. Overrides the zero-answering fallback once Staff is installed.
     */
    public function register(): void
    {
        parent::register();

        $this->app->bind(Roster::class, EloquentRoster::class);

        /*
         * ---- The staff app's front door ----
         *
         * Codes rather than sentences, for the reason every other refusal in
         * this platform has one: a client branches on the code and renders the
         * message in the reader's own language. A hand-written Uzbek string
         * reaches a Russian waiter in Uzbek.
         *
         * `staff.pin_invalid` deliberately covers a wrong PIN, a deleted account
         * and an employee who has moved restaurants. Three codes would be three
         * ways to ask whether somebody still works here, from a keypad anybody
         * holding the phone can reach.
         */
        ErrorCatalogue::register(
            new ApiError(
                'staff.pin_invalid',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'PIN noto\'g\'ri.',
                'Неверный PIN.',
                'That PIN is not correct.',
            ),
            new ApiError(
                'staff.pin_locked',
                Response::HTTP_TOO_MANY_REQUESTS,
                'Juda ko\'p urinish. Biroz kuting yoki menejerga murojaat qiling.',
                'Слишком много попыток. Подождите или обратитесь к менеджеру.',
                'Too many attempts. Wait a little, or speak to a manager.',
            ),
            new ApiError(
                'staff.device_required',
                /*
                 * 403 and not 401. The problem is not that nobody is
                 * authenticated — it is that the caller is not an enrolled
                 * phone. A 401 would send a working device back through
                 * pairing; a 403 says what is actually wrong.
                 */
                Response::HTTP_FORBIDDEN,
                'Bu amal uchun ro\'yxatdan o\'tgan telefon kerak.',
                'Для этого действия нужен зарегистрированный телефон.',
                'This needs a phone that has been enrolled.',
            ),
            new ApiError(
                'staff.employee_unknown',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Bunday xodim topilmadi.',
                'Такой сотрудник не найден.',
                'No such employee.',
            ),
            new ApiError(
                'staff.not_a_desk_position',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Bu lavozim konsolda ishlamaydi — unga parol emas, PIN kerak.',
                'Эта должность не работает в консоли — ей нужен PIN, а не пароль.',
                'This position does not work at the console — it needs a PIN, not a password.',
            ),

            /*
             * ---- Swapping out of a shift ----
             *
             * Codes rather than sentences, for the reason the block above gives:
             * the console renders the message in the reader's own language, and
             * a hand-written Uzbek string reaches a Russian manager in Uzbek.
             */
            new ApiError(
                'shift.unknown',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Bunday smena topilmadi.',
                'Такая смена не найдена.',
                'No such shift.',
            ),
            new ApiError(
                'shift.not_swappable',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Bekor qilingan smenani almashtirib bo\'lmaydi.',
                'Отменённую смену обменять нельзя.',
                'A cancelled shift cannot be swapped.',
            ),
            new ApiError(
                'shift.already_over',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Bu smena allaqachon tugagan.',
                'Эта смена уже закончилась.',
                'That shift is already over.',
            ),
            new ApiError(
                'shift.swap_to_self',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Smenani o\'ziga berib bo\'lmaydi.',
                'Нельзя передать смену самому себе.',
                'A shift cannot be handed to the person already on it.',
            ),
            new ApiError(
                'shift.swap_already_pending',
                /*
                 * 409 and not 422. The request is not wrong — somebody else got
                 * there first, or this is the second of two taps on a slow
                 * connection. The client re-reads and shows the request that
                 * already exists; it does not highlight a field.
                 */
                Response::HTTP_CONFLICT,
                'Bu smena uchun so\'rov allaqachon yuborilgan.',
                'По этой смене уже есть заявка.',
                'There is already an open request for that shift.',
            ),
            new ApiError(
                'shift.swap_already_decided',
                Response::HTTP_CONFLICT,
                'Bu so\'rov bo\'yicha qaror allaqachon chiqarilgan.',
                'По этой заявке уже принято решение.',
                'That request has already been decided.',
            ),
            new ApiError(
                'shift.swap_needs_a_taker',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Smenani kim olishini ko\'rsating.',
                'Укажите, кто возьмёт смену.',
                'Say who is taking the shift.',
            ),

            /*
             * ---- Payroll ----
             *
             * Three languages for the reason the blocks above give, and one more
             * that is specific to wages: the person reading a payroll refusal is
             * often not the person who built the run, and "this is frozen" has
             * to arrive in their own language or it reads as the screen being
             * broken.
             */
            new ApiError(
                'staff.payroll_finalised',
                /*
                 * 409 and not 422. Nothing about the request is malformed — the
                 * month simply stopped accepting changes, and a client's correct
                 * response is to re-read the run and show it as signed off
                 * rather than to highlight a field. It is the same shape of
                 * answer `finance.shift_already_closed` gives about a till.
                 */
                Response::HTTP_CONFLICT,
                'Bu oy yopilgan — o\'zgartirib bo\'lmaydi. Tuzatish keyingi oyga yoziladi.',
                'Этот месяц закрыт — изменить нельзя. Правку внесите в следующий период.',
                'This run has been signed off and cannot be changed. Correct it in the next one.',
            ),
            new ApiError(
                'staff.payroll_empty',
                /*
                 * 422: the run genuinely cannot be signed in this state, and the
                 * fix is an action the caller can take — build it against the
                 * right venue, or wait for the attendance to be entered.
                 */
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Bu oyda hisoblangan qator yo\'q — avval hisoblang.',
                'В этом периоде нет ни одной строки — сначала рассчитайте.',
                'This run has no lines yet — build it first.',
            ),
            new ApiError(
                'staff.payroll_line_unknown',
                /*
                 * 404, unlike `staff.employee_unknown` and `shift.unknown` above,
                 * which answer 422 because they name a value inside a request
                 * body. This one names a row addressed by the URL, and the URL is
                 * wrong: the line exists but belongs to a different month.
                 */
                Response::HTTP_NOT_FOUND,
                'Bu qator boshqa oyga tegishli.',
                'Эта строка относится к другому периоду.',
                'That line belongs to a different payroll run.',
            ),
        );
    }
}
