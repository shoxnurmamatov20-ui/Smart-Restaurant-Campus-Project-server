<?php

declare(strict_types=1);

namespace Modules\Orders\Providers;

use App\Contracts\Orders\BillRegistry;
use App\Support\Errors\ApiError;
use App\Support\Errors\ErrorCatalogue;
use App\Support\Modules\ApiModuleServiceProvider;
use Modules\Orders\Services\EloquentBillRegistry;
use Symfony\Component\HttpFoundation\Response;

class OrdersServiceProvider extends ApiModuleServiceProvider
{
    /**
     * The name of the module.
     */
    protected string $name = 'Orders';

    /**
     * The lowercase version of the module name.
     */
    protected string $nameLower = 'orders';

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
     * Orders answers the platform's write contract for bills.
     *
     * This is how the POS opens, splits and settles a bill without importing
     * anything from this module. The core binds a refusing implementation as a
     * fallback, so a platform without Orders fails loudly rather than taking
     * money for orders nobody recorded.
     */
    public function register(): void
    {
        parent::register();

        $this->app->bind(BillRegistry::class, EloquentBillRegistry::class);

        $this->registerErrors();
    }

    /**
     * The refusals this module can issue.
     *
     * `order.invalid_transition` is 409, not the 422 the controller used to
     * abort with. The distinction matters to a till: 422 says the request was
     * wrong and editing it might help, while 409 says the server's state moved
     * underneath you — which is exactly what happened when a second terminal
     * paid the bill you were still adding lines to. An offline queue replays
     * on 422 and stops to ask on 409.
     *
     * `stop_list.item_unavailable` keeps the name API.md §4 gave it rather
     * than an orders-flavoured one, because five other surfaces raise the same
     * refusal and a guest app should not have to know which module answered.
     */
    private function registerErrors(): void
    {
        ErrorCatalogue::register(
            /*
             * The kitchen is buried and the restaurant asked us to stop.
             *
             * 409 rather than 422: nothing about the request is wrong, and a
             * 422 sends a client looking for a bad field. What changed is the
             * line, and the answer carries how many dockets are open so the
             * site can say something a guest can act on — *"come back in a few
             * minutes"* rather than *"declined"*.
             */
            new ApiError(
                'order.kitchen_at_capacity',
                Response::HTTP_CONFLICT,
                'Oshxona hozir band — biroz keyinroq urinib ko\'ring.',
                'Кухня сейчас загружена — попробуйте чуть позже.',
                'The kitchen is at capacity — please try again shortly.',
                retryable: true,
            ),
            /*
             * Dispatch's three refusals.
             *
             * `not_deliverable` and `order_closed` are 409 rather than 422: the
             * request was well formed and the dispatcher's screen offered the
             * button — what changed is the order, usually because somebody else
             * settled it while the board was open. A 422 would send the console
             * looking for a bad field.
             */
            new ApiError(
                'delivery.not_deliverable',
                Response::HTTP_CONFLICT,
                'Bu buyurtma yetkazib berilmaydi.',
                'Этот заказ не доставляется.',
                'This order is not a delivery.',
            ),
            new ApiError(
                'delivery.order_closed',
                Response::HTTP_CONFLICT,
                'Buyurtma yopilgan — kuryer biriktirib bo\'lmaydi.',
                'Заказ закрыт — курьера назначить нельзя.',
                'The order is closed, so no courier can be assigned.',
            ),
            new ApiError(
                'delivery.courier_unknown',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Bunday kuryer topilmadi.',
                'Такой курьер не найден.',
                'No such courier.',
            ),
            new ApiError(
                'order.closed',
                Response::HTTP_CONFLICT,
                'Bu hisob yopilgan — uni o\'zgartirib bo\'lmaydi.',
                'Этот счёт закрыт — изменить его нельзя.',
                'This bill is closed and cannot be changed.',
            ),
            new ApiError(
                'order.invalid_transition',
                Response::HTTP_CONFLICT,
                'Buyurtmani bu holatga o\'tkazib bo\'lmaydi.',
                'Заказ нельзя перевести в это состояние.',
                'The order cannot move to that state.',
            ),
            new ApiError(
                'order.item_not_found',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Bunday taom menyuda yo\'q.',
                'Такого блюда нет в меню.',
                'That dish is not on the menu.',
            ),
            new ApiError(
                'stop_list.item_unavailable',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Bu taom tugagan.',
                'Это блюдо закончилось.',
                'This dish is sold out.',
            ),

            /*
             * The four a guest ordering from their own phone can hit.
             *
             * Codes rather than sentences for the same reason as everything
             * above, and with one extra: these reach a phone with no staff
             * member beside it. Nobody can translate for the reader and nobody
             * can explain what to do next, so the wording has to carry both —
             * what happened, and the one action that helps.
             */
            new ApiError(
                'order.branch_unavailable',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Bu filial hozir buyurtma qabul qilmayapti. Boshqasini tanlang.',
                'Этот филиал сейчас не принимает заказы. Выберите другой.',
                'That venue is not taking orders right now. Choose another.',
            ),
            /*
             * A door the restaurant has shut, not a venue that is closed.
             *
             * 409 rather than 422: nothing about the request is wrong, and a
             * guest who resends the identical basket in forty minutes will be
             * served. The refusal carries `until` and the operator's own reason
             * on `meta`, so a client can say when rather than only that.
             */
            new ApiError(
                'order.channel_paused',
                Response::HTTP_CONFLICT,
                'Bu kanal orqali buyurtma vaqtincha qabul qilinmayapti.',
                'Через этот канал заказы временно не принимаются.',
                'Orders are not being taken through this channel right now.',
                retryable: true,
            ),
            /*
             * 409, not 429.
             *
             * A rate limit says "you are going too fast, wait"; this says "the
             * server's state does not allow it, and waiting will not help — one
             * of your orders has to finish first." A client that retried on 429
             * would retry this forever.
             */
            new ApiError(
                'order.too_many_open',
                Response::HTTP_CONFLICT,
                'Bu raqamda hali yakunlanmagan buyurtmalar bor. Avvalgisi yetib borsin.',
                'На этом номере есть незавершённые заказы. Дождитесь предыдущего.',
                'This number already has orders in progress. Wait for one to arrive.',
            ),
            /*
             * A pre-order for an hour the kitchen is dark.
             *
             * 422 rather than 409: the field IS wrong, and the app can fix it
             * without asking anybody — the meta carries the venue's own opening
             * and closing times so the chooser can redraw itself around them.
             */
            new ApiError(
                'order.outside_hours',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Bu filial o\'sha vaqtda ishlamaydi. Boshqa vaqtni tanlang.',
                'В это время филиал не работает. Выберите другое время.',
                'That venue is closed at that time. Choose another.',
            ),
            /*
             * A back-office write that needs somebody else's signature.
             *
             * Its own code rather than the till's `pos.approval_required`,
             * because the two say different things to a client: the till's
             * carries an `approval_id` to poll and a manager to fetch across the
             * room, and this one cannot — a console has no terminal session to
             * raise a request against. What it means is "this has to be done at
             * a till", and a screen that treated it as a pollable request would
             * spin forever.
             */
            new ApiError(
                'order.approval_required',
                Response::HTTP_FORBIDDEN,
                'Bu amal uchun menejer tasdig\'i kerak — kassadan bajaring.',
                'Для этого нужна подпись менеджера — выполните на кассе.',
                'This needs a manager\'s signature — do it at the till.',
            ),
            /*
             * A bill refused a split, a discount or a transfer.
             *
             * One code for the family because they share a shape: the request
             * was well formed and the console offered the button, and what
             * refused is the bill's own state — closed, already divided, a
             * discount larger than the food. The detail is in the meta, in the
             * words Orders itself used.
             */
            new ApiError(
                'order.refused',
                Response::HTTP_CONFLICT,
                'Bu hisobda bu amalni bajarib bo\'lmaydi.',
                'С этим счётом такое действие невозможно.',
                'That cannot be done to this bill.',
            ),
            new ApiError(
                'order.below_minimum',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Buyurtma summasi eng kam summadan kam. Yana biror narsa qo\'shing.',
                'Сумма заказа меньше минимальной. Добавьте что-нибудь ещё.',
                'The basket is below this venue\'s minimum. Add something else.',
            ),
            /*
             * A stale menu bundle in somebody's pocket, almost always: the
             * client offered a choice the catalogue no longer allows for that
             * dish. Retryable is deliberately false — the same request will be
             * refused again, and the fix is to reload the menu.
             */
            new ApiError(
                'order.modifier_invalid',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Tanlangan qo\'shimcha bu taomga to\'g\'ri kelmaydi. Menyuni yangilang.',
                'Выбранная опция не подходит к этому блюду. Обновите меню.',
                'That option is not offered for this dish. Reload the menu.',
            ),
            /*
             * "Your orders" needs a "your", and a phone with no token has none.
             *
             * 401 rather than 403: the guest is not forbidden from their own
             * history, they simply have not said who they are yet, and the
             * client's move is the SMS screen rather than an apology. Its own
             * code rather than CRM's `crm.customer_token_required` because this
             * route is not behind CRM's middleware — Orders must keep answering
             * at a venue that runs no loyalty scheme at all, and there the
             * honest answer is the same one: sign in first.
             */
            new ApiError(
                'order.sign_in_required',
                Response::HTTP_UNAUTHORIZED,
                'Buyurtmalaringizni ko\'rish uchun avval kiring.',
                'Чтобы увидеть свои заказы, сначала войдите.',
                'Sign in to see your own orders.',
            ),
        );
    }
}
