<?php

declare(strict_types=1);

namespace Modules\Inventory\Providers;

use App\Support\Errors\ApiError;
use App\Support\Errors\ErrorCatalogue;
use Nwidart\Modules\Support\ModuleServiceProvider;
use Symfony\Component\HttpFoundation\Response;

class InventoryServiceProvider extends ModuleServiceProvider
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
        );
    }
}
