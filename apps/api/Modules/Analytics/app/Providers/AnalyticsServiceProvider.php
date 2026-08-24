<?php

declare(strict_types=1);

namespace Modules\Analytics\Providers;

use App\Support\Errors\ApiError;
use App\Support\Errors\ErrorCatalogue;
use App\Support\Modules\ApiModuleServiceProvider;
use Illuminate\Console\Scheduling\Schedule;
use Modules\Analytics\Console\RollUpDailyFacts;
use Modules\Analytics\Console\SendScheduledReports;
use Symfony\Component\HttpFoundation\Response;

class AnalyticsServiceProvider extends ApiModuleServiceProvider
{
    /**
     * The name of the module.
     */
    protected string $name = 'Analytics';

    /**
     * The lowercase version of the module name.
     */
    protected string $nameLower = 'analytics';

    /**
     * Provider classes to register.
     *
     * @var string[]
     */
    protected array $providers = [
        EventServiceProvider::class,
        RouteServiceProvider::class,
    ];

    /** @var array<int, class-string> */
    protected array $commands = [
        RollUpDailyFacts::class,
        SendScheduledReports::class,
    ];

    public function register(): void
    {
        parent::register();

        ErrorCatalogue::register(...self::refusals());
    }

    /**
     * The two ways an export can fail to arrive.
     *
     * Named `report.*` rather than `analytics.*` on the same reading as the
     * core catalogue's `export.*` group: the domain a client branches on is the
     * thing being sent, not the module that happened to build it. A console
     * reading `report.no_destination` knows to open the notification settings;
     * `analytics.no_destination` would only say which team wrote the code.
     *
     * Registered rather than left to the catalogue's fallback, which answers
     * 500 and "something went wrong" — read after pressing *Telegramga*, that
     * is a platform that looks broken instead of a chat that was never set up.
     *
     * @return array<int, ApiError>
     */
    private static function refusals(): array
    {
        return [
            /*
             * Nowhere to send it: no chat configured for the restaurant, or an
             * account with no e-mail address on it. 422 rather than 409,
             * because the fix is a field somebody has to fill in.
             */
            new ApiError(
                'report.no_destination',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                "Hisobotni yuboradigan manzil yo'q — avval Telegram chat yoki pochta manzilini kiriting.",
                'Некуда отправить отчёт — сначала укажите Telegram-чат или почтовый адрес.',
                'There is nowhere to send this report — set a Telegram chat or an e-mail address first.',
            ),
            /*
             * The address existed and the send did not happen: a mail server
             * that refused it, a bot the chat has blocked, a token nobody has
             * pasted in yet. Retryable, because all three are usually temporary
             * and none of them is the reader's mistake.
             */
            new ApiError(
                'report.not_delivered',
                Response::HTTP_BAD_GATEWAY,
                'Hisobot yuborilmadi — manzil ishlamayapti yoki bot ulanmagan.',
                'Отчёт не отправлен — адрес недоступен или бот не подключён.',
                'The report was not delivered — the address is unreachable or the bot is not connected.',
                retryable: true,
            ),
        ];
    }

    /**
     * The nightly projection.
     *
     * 04:10, and the hour is the argument: a restaurant's trading day runs
     * 06:00 → 06:00, so at four in the morning yesterday's day is closed and
     * today's has barely started. Earlier and the command would summarise a
     * night that is still being cashed up; later and it would collide with the
     * backup window at 02:40–03:10 that already reads the whole database.
     *
     * `withoutOverlapping` because a chain's pass can outlive its own hour, and
     * two rollups writing the same day would race on the upsert — the partial
     * unique indexes would refuse the loser, which is safe and is still an
     * alert somebody has to read at four in the morning.
     */
    protected function configureSchedules(Schedule $schedule): void
    {
        $schedule->command('analytics:rollup')
            ->dailyAt('04:10')
            ->withoutOverlapping()
            ->runInBackground();

        /*
         * The schedules people set for themselves.
         *
         * 06:30 is the console's own daily slot (`reports-data.ts`: "06:30 ·
         * after the business day closes") and it is deliberately more than two
         * hours after the rollup: a daily report built at 04:15 would read a
         * projection that was still being written.
         *
         * Every five minutes and not once a day, because the weekly, monthly
         * and quarterly slots are 08:00 and 09:00 — a once-daily tick would
         * either miss them or fire them a day late. The command asks one
         * indexed question and returns; a tick with nothing due costs a query.
         *
         * `runInBackground` is what makes a month of cashflow not block the
         * backups behind it, which is what the schedule sheet's own note asked
         * a queue for.
         */
        $schedule->command('analytics:send-scheduled')
            ->everyFiveMinutes()
            ->withoutOverlapping()
            ->runInBackground();
    }
}
