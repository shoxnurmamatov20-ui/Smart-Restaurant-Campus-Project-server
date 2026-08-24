<?php

declare(strict_types=1);

namespace Modules\Inventory\Providers;

use App\Contracts\Inventory\ShelfCosts;
use App\Contracts\Inventory\StockLedger;
use App\Contracts\Inventory\StockReport;
use App\Support\Errors\ApiError;
use App\Support\Errors\ErrorCatalogue;
use App\Support\Modules\ApiModuleServiceProvider;
use Modules\Inventory\Services\EloquentShelfCosts;
use Modules\Inventory\Services\EloquentStockLedger;
use Modules\Inventory\Services\EloquentStockReport;
use Symfony\Component\HttpFoundation\Response;

class InventoryServiceProvider extends ApiModuleServiceProvider
{
    /**
     * The name of the module.
     */
    protected string $name = 'Inventory';

    /**
     * The lowercase version of the module name.
     */
    protected string $nameLower = 'inventory';

    /**
     * Provider classes to register.
     *
     * @var string[]
     */
    protected array $providers = [
        EventServiceProvider::class,
        RouteServiceProvider::class,
    ];

    public function register(): void
    {
        parent::register();

        /*
         * The two writes another module may make into this one: a write-off
         * and a count. Bound here so the staff app's offline queue can drain
         * `waste_log` and `count_submit` without Staff importing Inventory —
         * ModuleBoundaryTest allows exactly one edge into this module, from
         * Suppliers, and a second would make the two one program.
         */
        $this->app->bind(StockLedger::class, EloquentStockLedger::class);

        /*
         * The read half. Two interfaces rather than one because they have
         * opposite blast radii — see App\Contracts\Inventory\StockReport. The
         * caller is Analytics, which may not read this module's tables.
         */
        $this->app->bind(StockReport::class, EloquentStockReport::class);

        /*
         * The narrowest read of the three: name, unit and cost per base unit
         * for a set of ids. Menu costs a dish's technical card with it —
         * `menu.recipe_lines` holds bare ids precisely so the catalogue never
         * has to import the warehouse.
         */
        $this->app->bind(ShelfCosts::class, EloquentShelfCosts::class);

        ErrorCatalogue::register(
            // Negative stock is refused today. DECISIONS and API.md §8 both
            // say it should be allowed and surfaced instead — a depletion
            // driven by a wrong recipe must not stop a guest being served.
            // The code stays 422 until slice P9 flips it to a warning, so
            // that the change is one commit with one test rather than a
            // silent behaviour drift.
            new ApiError(
                'stock.insufficient',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Ombor qoldig\'idan ko\'p chiqim qilib bo\'lmaydi.',
                'Нельзя списать больше, чем есть на складе.',
                'You cannot deplete more than the stock on hand.',
            ),

            /*
             * The two refusals a transfer's status ladder makes, and both are
             * 409 rather than 422: nothing about the request is malformed, the
             * van is simply not where the caller thinks it is. Sending twice
             * would empty the origin's shelf twice off one load; receiving
             * twice would fill the destination's twice — and a stock-take three
             * weeks later is where either would be found.
             */
            new ApiError(
                'stock.transfer_not_pending',
                Response::HTTP_CONFLICT,
                'Bu ko\'chirish allaqachon yuborilgan.',
                'Это перемещение уже отправлено.',
                'This transfer has already been sent.',
            ),
            new ApiError(
                'stock.transfer_not_in_transit',
                Response::HTTP_CONFLICT,
                'Bu ko\'chirish yo\'lda emas — qabul qilib bo\'lmaydi.',
                'Это перемещение не в пути — принять нельзя.',
                'This transfer is not in transit, so it cannot be received.',
            ),

            /*
             * A prep card with no components. Refused rather than made: a batch
             * of nothing raises `on_hand` out of thin air, and the dish costed
             * against it would report a food cost of zero — the one figure on
             * the analytics screen an owner is least able to sanity-check.
             */
            new ApiError(
                'stock.prep_card_empty',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Bu yarim tayyor mahsulotning retsepti bo\'sh.',
                'У этого полуфабриката пустая рецептура.',
                'This prep item has no recipe lines.',
            ),
        );
    }
}
