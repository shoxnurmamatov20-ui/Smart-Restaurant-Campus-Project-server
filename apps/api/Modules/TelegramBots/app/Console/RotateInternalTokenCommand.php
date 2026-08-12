<?php

declare(strict_types=1);

namespace Modules\TelegramBots\Console;

use Illuminate\Console\Command;
use Illuminate\Support\Str;

/**
 * Generates a fresh internal token shared by Laravel and the Python telegram-bots service.
 *
 *   php artisan telegram:rotate-token         # prints the token
 *   php artisan telegram:rotate-token --copy  # also writes to apps/api/.env
 *
 * After running, copy the same value to apps/telegram-bots/.env::LARAVEL_INTERNAL_TOKEN.
 * The check-config command verifies both sides match.
 */
final class RotateInternalTokenCommand extends Command
{
    protected $signature = 'telegram:rotate-token
        {--copy : Update apps/api/.env in place with the new token}
        {--bytes=48 : Number of random bytes (base64-ish length)}';

    protected $description = 'Generate a new shared LARAVEL_INTERNAL_TOKEN for the telegram-bots service';

    public function handle(): int
    {
        $bytes = max(16, (int) $this->option('bytes'));
        $token = Str::random($bytes);

        $this->info('🔑 New TELEGRAM_INTERNAL_TOKEN:');
        $this->line($token);
        $this->newLine();

        if ($this->option('copy')) {
            $this->updateEnv($token);
        } else {
            $this->warn('Paste this value into BOTH:');
            $this->line('  1. apps/api/.env             → TELEGRAM_INTERNAL_TOKEN=...');
            $this->line('  2. apps/telegram-bots/.env   → LARAVEL_INTERNAL_TOKEN=...');
            $this->newLine();
            $this->comment('Or re-run with --copy to update apps/api/.env automatically.');
        }

        return self::SUCCESS;
    }

    private function updateEnv(string $token): void
    {
        $envPath = base_path('.env');
        if (! file_exists($envPath)) {
            $this->error("Cannot find {$envPath}; aborting --copy.");

            return;
        }

        $contents = (string) file_get_contents($envPath);
        $pattern = '/^TELEGRAM_INTERNAL_TOKEN=.*$/m';

        if (preg_match($pattern, $contents)) {
            $contents = (string) preg_replace($pattern, "TELEGRAM_INTERNAL_TOKEN={$token}", $contents);
        } else {
            $contents = rtrim($contents, "\n")."\nTELEGRAM_INTERNAL_TOKEN={$token}\n";
        }

        file_put_contents($envPath, $contents);
        $this->info("✅ Updated {$envPath}");
        $this->warn('⚠️  Still need to set LARAVEL_INTERNAL_TOKEN in apps/telegram-bots/.env manually.');
    }
}
