<?php

declare(strict_types=1);

namespace Modules\Board\Providers;

use App\Support\Modules\ApiModuleServiceProvider;

class BoardServiceProvider extends ApiModuleServiceProvider
{
    protected string $name = 'Board';

    protected string $nameLower = 'board';

    /**
     * @var string[]
     */
    protected array $providers = [
        EventServiceProvider::class,
        RouteServiceProvider::class,
    ];
}
