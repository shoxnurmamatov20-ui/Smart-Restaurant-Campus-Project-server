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
        );
    }
}
