<?php

declare(strict_types=1);

namespace Modules\TelegramBots\Providers;

use App\Contracts\Messaging\BotDirectory;
use App\Contracts\Messaging\ChatNotifier;
use App\Support\Errors\ApiError;
use App\Support\Errors\ErrorCatalogue;
use App\Support\Modules\ApiModuleServiceProvider;
use Illuminate\Console\Scheduling\Schedule;
use Modules\TelegramBots\Console\CheckConfigCommand;
use Modules\TelegramBots\Console\RotateInternalTokenCommand;
use Modules\TelegramBots\Console\SyncBotRegistryCommand;
use Modules\TelegramBots\Http\Middleware\InternalBotsAuth;
use Modules\TelegramBots\Http\Middleware\ResolveBotTenant;
use Modules\TelegramBots\Services\EloquentBotDirectory;
use Modules\TelegramBots\Services\TelegramChatNotifier;
use Symfony\Component\HttpFoundation\Response;

class TelegramBotsServiceProvider extends ApiModuleServiceProvider
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

        // The bot key names the restaurant — see the class for why that has to
        // be a middleware rather than a lookup repeated in every controller.
        $router->aliasMiddleware('bots.tenant', ResolveBotTenant::class);
    }

    /**
     * Define module schedules.
     */
    // protected function configureSchedules(Schedule $schedule): void
    // {
    //     $schedule->command('inspire')->hourly();
    // }

    public function register(): void
    {
        parent::register();

        /*
         * The one write another module may make into this one: putting a
         * message and a file into a restaurant's own chat. Bound here so a
         * scheduled report can reach a manager's Telegram without Analytics
         * importing this module — `ModuleBoundaryTest` records three edges out
         * of Analytics and all three are reads.
         */
        $this->app->bind(BotDirectory::class, EloquentBotDirectory::class);
        $this->app->bind(ChatNotifier::class, TelegramChatNotifier::class);

        ErrorCatalogue::register(
            new ApiError(
                'bots.token_not_configured',
                Response::HTTP_INTERNAL_SERVER_ERROR,
                'Botlar uchun ichki token sozlanmagan.',
                'Внутренний токен для ботов не настроен.',
                'The internal bot token is not configured.',
            ),
            new ApiError(
                'bots.feature_not_implemented',
                Response::HTTP_NOT_IMPLEMENTED,
                'Bu funksiya hozircha yo\'q.',
                'Эта функция пока недоступна.',
                'This is not built yet.',
            ),
            new ApiError(
                'bots.invalid_token',
                Response::HTTP_UNAUTHORIZED,
                'Ichki token noto\'g\'ri.',
                'Неверный внутренний токен.',
                'That internal token is not valid.',
            ),
            new ApiError(
                'bots.unknown_key',
                Response::HTTP_NOT_FOUND,
                'Bunday bot kaliti yo\'q yoki restoran faol emas.',
                'Такого ключа бота нет, или ресторан неактивен.',
                'No such bot key, or its restaurant is not active.',
            ),
        );
    }
}
