<?php

declare(strict_types=1);

namespace Modules\TelegramBots\Console;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;

/**
 * Verifies that the Laravel TelegramBots module is configured to talk to the
 * Python apps/telegram-bots service.
 *
 *   php artisan telegram:check-config
 *
 * Checks:
 *   - TELEGRAM_INTERNAL_TOKEN is set (Laravel side)
 *   - TELEGRAM_BOTS_SERVICE_URL is reachable
 *   - The Python service has matching LARAVEL_INTERNAL_TOKEN (probed via /health)
 *     If the token mismatches, /internal/send/{bot} returns 401 which we surface.
 */
final class CheckConfigCommand extends Command
{
    protected $signature = 'telegram:check-config {--probe : Also probe /internal/send for a 401 (token verification)}';

    protected $description = 'Verify TelegramBots Laravel ↔ Python configuration is in sync';

    public function handle(): int
    {
        $internalToken = (string) config('telegrambots.internal_token');
        $serviceUrl = (string) config('telegrambots.bots_service_url');

        $rows = [];
        $ok = true;

        // Internal token
        if ($internalToken === '') {
            $rows[] = ['❌ FAIL', 'TELEGRAM_INTERNAL_TOKEN', '(empty)', 'Generate via `telegram:rotate-token`'];
            $ok = false;
        } else {
            $rows[] = ['✅ OK', 'TELEGRAM_INTERNAL_TOKEN', $this->mask($internalToken), strlen($internalToken).' chars'];
        }

        // Service URL
        if ($serviceUrl === '') {
            $rows[] = ['❌ FAIL', 'TELEGRAM_BOTS_SERVICE_URL', '(empty)', 'Set to http://localhost:8002 for local dev'];
            $ok = false;
        } else {
            $rows[] = ['✅ OK', 'TELEGRAM_BOTS_SERVICE_URL', $serviceUrl, ''];
        }

        // Reachability
        $reachable = false;
        if ($serviceUrl !== '') {
            try {
                $resp = Http::timeout(3)->get(rtrim($serviceUrl, '/').'/health');
                $reachable = $resp->successful();
                $rows[] = [
                    $reachable ? '✅ OK' : '⚠️  WARN',
                    'Python /health',
                    $reachable ? "HTTP {$resp->status()}" : "HTTP {$resp->status()}",
                    $reachable ? '' : 'Python service not reachable',
                ];
            } catch (\Throwable $e) {
                $rows[] = ['⚠️  WARN', 'Python /health', 'unreachable', $e->getMessage()];
            }
        }

        // Token-match probe (optional)
        if ($this->option('probe') && $reachable && $internalToken !== '') {
            try {
                $resp = Http::timeout(3)
                    ->withToken($internalToken)
                    ->asJson()
                    ->post(rtrim($serviceUrl, '/').'/internal/send/__check__', ['chat_id' => 0, 'text' => 'probe']);

                // We expect 404 (bot key __check__ doesn't exist) IF token is correct.
                // We expect 401 IF token mismatch.
                if ($resp->status() === 401) {
                    $rows[] = ['❌ FAIL', 'Token match probe', '401 Unauthorized', 'Python LARAVEL_INTERNAL_TOKEN differs'];
                    $ok = false;
                } elseif ($resp->status() === 404) {
                    $rows[] = ['✅ OK', 'Token match probe', '404 (expected)', 'Token matches'];
                } else {
                    $rows[] = ['⚠️  WARN', 'Token match probe', "HTTP {$resp->status()}", 'Unexpected response'];
                }
            } catch (\Throwable $e) {
                $rows[] = ['⚠️  WARN', 'Token match probe', 'error', $e->getMessage()];
            }
        }

        $this->table(['Status', 'Key', 'Value', 'Notes'], $rows);

        if (! $ok) {
            $this->newLine();
            $this->error('Configuration has errors. See above.');

            return self::FAILURE;
        }

        $this->newLine();
        $this->info('All checks passed.');

        return self::SUCCESS;
    }

    private function mask(string $token): string
    {
        if (strlen($token) <= 8) {
            return str_repeat('*', strlen($token));
        }

        return substr($token, 0, 4).'…'.substr($token, -4);
    }
}
