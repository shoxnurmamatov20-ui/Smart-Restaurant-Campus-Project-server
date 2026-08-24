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

    /**
     * A module's own translations, under its own namespace.
     *
     * nwidart calls `loadTranslationsFrom($path)` with no second argument, so the
     * lines land in the global namespace and `__('kitchen::print.receipt.total')`
     * resolves to nothing. Laravel's answer to a missing key is the key itself —
     * silently, by design — so nothing raises and nothing logs.
     *
     * Harmless while every module answered in JSON, because the API sends codes and
     * the client owns the wording. Printing was the first thing to need translated
     * copy on the server, and the symptom was the string
     * `kitchen::print.receipt.total` printed on a real roll of paper where the total
     * should be, in front of a guest, with the drawer open.
     *
     * Kitchen found it and fixed it in its own provider. It is here now because the
     * next module to print, mail or send an SMS would have discovered it again the
     * same way — and one of those goes to a customer.
     */
    protected function registerTranslations(): void
    {
        $path = module_path($this->name, 'lang');

        if (! is_dir($path)) {
            return;
        }

        // Namespaced, so `module::file.key` resolves; and the JSON pass beside it
        // for the short-form `__('Total')` lines a module may also carry.
        $this->loadTranslationsFrom($path, $this->nameLower);
        $this->loadJsonTranslationsFrom($path);
    }
}
