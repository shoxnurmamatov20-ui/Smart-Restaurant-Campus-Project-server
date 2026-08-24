<?php

declare(strict_types=1);

namespace Modules\Suppliers\Providers;

use App\Contracts\Suppliers\Purchasing;
use App\Contracts\Suppliers\Receiving;
use App\Support\Errors\ApiError;
use App\Support\Errors\ErrorCatalogue;
use App\Support\Modules\ApiModuleServiceProvider;
use Modules\Suppliers\Services\EloquentPurchasing;
use Modules\Suppliers\Services\EloquentReceiving;
use Symfony\Component\HttpFoundation\Response;

class SuppliersServiceProvider extends ApiModuleServiceProvider
{
    /**
     * The name of the module.
     */
    protected string $name = 'Suppliers';

    /**
     * The lowercase version of the module name.
     */
    protected string $nameLower = 'suppliers';

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
     * How purchasing says no.
     *
     * These four replaced hand-written `abort_if(..., 422, 'Bu ariza allaqachon
     * qabul qilingan.')` calls. Each was one sentence, in one language, with a
     * status chosen at the throw site — so a Russian buyer read Uzbek and a
     * client had nothing to branch on. The three refusals a purchase screen
     * actually has to handle differently are "already there", "not from here"
     * and "this document is closed", and now it can tell them apart.
     */
    public function register(): void
    {
        parent::register();

        /*
         * Confirming a delivery, for the phone at the service entrance.
         *
         * `bind` overrides the Unavailable fallback in AppServiceProvider the
         * moment this module is installed. The purchasing screen reaches the
         * same class directly; the contract is what lets Staff reach it without
         * importing this module.
         */
        $this->app->bind(Receiving::class, EloquentReceiving::class);

        /*
         * The read half, for the two dashboards that draw this ledger.
         *
         * Bound beside `Receiving` rather than resolved through it: the two
         * have nothing in common but the module they live in — one is a
         * three-write transaction off a phone at the service entrance, the
         * other is a capped select behind a home screen.
         */
        $this->app->bind(Purchasing::class, EloquentPurchasing::class);

        ErrorCatalogue::register(
            new ApiError(
                'purchase_order.already_received',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Bu buyurtma allaqachon qabul qilingan.',
                'Этот заказ уже принят.',
                'This order has already been received.',
            ),
            new ApiError(
                'purchase_order.invalid_transition',
                /*
                 * 409 rather than 422, and the same status `order.invalid_transition`
                 * carries in the Orders module. The body is not wrong — the
                 * order simply is not where the caller thought it was, usually
                 * because somebody else moved it a second earlier. A client
                 * re-reads and shows the new state; it does not highlight a
                 * field.
                 */
                Response::HTTP_CONFLICT,
                'Buyurtmani bu holatga o\'tkazib bo\'lmaydi.',
                'Заказ нельзя перевести в это состояние.',
                'The order cannot move to that state.',
            ),
            new ApiError(
                'purchase_order.locked',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Yopilgan buyurtmani o\'zgartirib bo\'lmaydi.',
                'Закрытый заказ изменить нельзя.',
                'A closed order cannot be changed.',
            ),
            new ApiError(
                'purchase_order.no_lines',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Buyurtmada birorta ham qator yo\'q — yuborib bo\'lmaydi.',
                'В заказе нет ни одной позиции — отправить нельзя.',
                'The order has no lines, so it cannot be sent.',
                // The buyer adds a line and tries again; nothing is broken.
                retryable: true,
            ),

            /*
             * Paying an invoice. Both refusals exist because the two people who
             * press the button — a buyer at a desk and an accountant on the
             * ledger screen — are looking at different copies of the same row.
             *
             * `already_paid` is a conflict rather than a validation failure: the
             * body was fine, somebody else settled it first, and the client
             * should re-read rather than highlight a field. `overpaid` IS about
             * the body — a figure larger than what is owed — so it names the
             * amount and answers 422.
             */
            new ApiError(
                'purchase_order.already_paid',
                Response::HTTP_CONFLICT,
                'Bu faktura allaqachon to\'langan.',
                'Этот счёт уже оплачен.',
                'This invoice has already been settled.',
            ),
            new ApiError(
                'purchase_order.overpaid',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'To\'lov summasi qarzdan katta.',
                'Сумма платежа больше остатка долга.',
                'That is more than is outstanding on this invoice.',
            ),
        );
    }
}
