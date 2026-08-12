<?php

declare(strict_types=1);

namespace Modules\Finance\Providers;

use App\Contracts\Finance\TillLedger;
use Modules\Finance\Services\EloquentTillLedger;
use Nwidart\Modules\Support\ModuleServiceProvider;

class FinanceServiceProvider extends ModuleServiceProvider
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
    }
}
