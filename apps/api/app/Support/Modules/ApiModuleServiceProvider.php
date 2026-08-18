<?php

declare(strict_types=1);

namespace App\Support\Modules;

use Nwidart\Modules\Support\ModuleServiceProvider;

/**
 * The base every module here extends: an API module, with no Blade.
 *
 * nwidart's provider registers a views directory unconditionally — it calls
 * `loadViewsFrom()` on `Modules/X/resources/views` whether or not that path
 * exists. Every module in this application is JSON-only, their generated view
 * scaffolding was deleted as dead weight, and nothing noticed because
 * `artisan serve` never resolves a view.
 *
 * `view:cache` does. It walks every registered path and fails on the first one
 * that is not there:
 *
 *     The "…/Modules/TelegramBots/resources/views" directory does not exist.
 *
 * Which meant `artisan optimize` failed, and so did the deploy — the release
 * script caches config, events, routes and views, and stopped on the fourth.
 * The platform kept running only because the old deployment never ran that
 * step at all.
 *
 * Registering a directory that exists is the fix. If a module ever grows a
 * view, creating the directory is all it takes for this to start working
 * again — no provider changes.
 */
abstract class ApiModuleServiceProvider extends ModuleServiceProvider
{
    protected function registerViews(): void
    {
        $source = module_path($this->name, (string) config('modules.paths.generator.views.path'));

        if (! is_dir($source)) {
            return;
        }

        parent::registerViews();
    }
}
