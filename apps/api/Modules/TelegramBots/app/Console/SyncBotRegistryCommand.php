<?php

declare(strict_types=1);

namespace Modules\TelegramBots\Console;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;
use Modules\TelegramBots\Models\Bot;

/**
 * Pulls the bot catalog from the Python telegram-bots service (GET /bots)
 * and upserts every entry into the `tg_bots` table.
 *
 *   php artisan telegram:sync
 */
final class SyncBotRegistryCommand extends Command
{
    protected $signature = 'telegram:sync {--url= : Override telegram-bots service URL}';

    protected $description = 'Sync the Python bot registry into the tg_bots table';

    public function handle(): int
    {
        $url = (string) ($this->option('url') ?: config('telegrambots.bots_service_url'));
        $endpoint = rtrim($url, '/').'/bots';

        $this->info("Fetching bot catalog from {$endpoint}");

        try {
            $resp = Http::timeout(15)->get($endpoint);
        } catch (\Throwable $e) {
            $this->error("Connection failed: {$e->getMessage()}");

            return Command::FAILURE;
        }

        if (! $resp->successful()) {
            $this->error("HTTP {$resp->status()}: {$resp->body()}");

            return Command::FAILURE;
        }

        $bots = $resp->json();
        $upserted = 0;

        foreach ($bots as $entry) {
            Bot::updateOrCreate(
                ['key' => $entry['key']],
                [
                    'name_uz' => $entry['name_uz'],
                    'name_ru' => $entry['name_ru'],
                    'name_en' => $entry['name_en'],
                    'purpose' => $entry['purpose'],
                    'audience' => $entry['audience'],
                    'module' => $entry['module'],
                    'phase' => $entry['phase'],
                    'commands' => $entry['commands'],
                    'enabled' => $entry['enabled'],
                    'requires_phone' => $entry['requires_phone'],
                    'requires_login' => $entry['requires_login'],
                    'last_synced_at' => now(),
                ]
            );
            $upserted++;
        }

        $this->info("Upserted {$upserted} bots into tg_bots.");
        $this->table(
            ['key', 'name', 'enabled', 'audience'],
            collect($bots)->take(15)->map(fn ($b) => [
                $b['key'], $b['name_en'], $b['enabled'] ? '✅' : '⏸', $b['audience'],
            ])->all()
        );

        return Command::SUCCESS;
    }
}
