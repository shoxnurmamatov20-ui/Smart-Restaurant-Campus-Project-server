<?php

declare(strict_types=1);

namespace Modules\TelegramBots\Providers;

use Illuminate\Console\Scheduling\Schedule;
use Modules\TelegramBots\Console\CheckConfigCommand;
use Modules\TelegramBots\Console\RotateInternalTokenCommand;
use Modules\TelegramBots\Console\SyncBotRegistryCommand;
use Modules\TelegramBots\Http\Middleware\InternalBotsAuth;
use Nwidart\Modules\Support\ModuleServiceProvider;

class TelegramBotsServiceProvider extends ModuleServiceProvider
{
    /**
     * The name of the module.
     */
    protected string $name = 'TelegramBots';

    /**
     * The lowercase version of the module name.
     */
    protected string $nameLower = 'telegrambots';

    /**
     * Command classes to register.
     *
     * @var string[]
     */
    protected array $commands = [
        SyncBotRegistryCommand::class,
        RotateInternalTokenCommand::class,
        CheckConfigCommand::class,
    ];

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

        // Register internal-bots auth middleware
        $router = $this->app['router'];
        $router->aliasMiddleware('internal.bots', InternalBotsAuth::class);
    }

    /**
     * Define module schedules.
     */
    // protected function configureSchedules(Schedule $schedule): void
    // {
    //     $schedule->command('inspire')->hourly();
    // }
}
