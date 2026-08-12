<?php

declare(strict_types=1);

namespace App\Support\Modules;

use App\Models\Tenant;
use Illuminate\Support\Collection;
use Nwidart\Modules\Contracts\RepositoryInterface;

/**
 * What the platform can do, and what this particular restaurant has switched on.
 *
 * Two independent switches decide whether a module is live:
 *
 *   - the platform flag (`config('menu.enabled')`, backed by an env var) — the
 *     operator's kill switch, e.g. while a module is being upgraded
 *   - the restaurant's own flag (`tenants.settings.modules.menu`) — a coffee
 *     stand has no use for table reservations and should not be shown them
 *
 * Both must be on. The restaurant flag defaults to on, so a newly released
 * module appears everywhere without a data migration; a restaurant opts *out*,
 * never in.
 *
 * The core owns this class but knows nothing module-specific: every value comes
 * from the module's own `module.json` and `config/config.php`, so adding a
 * twelfth module needs no edit here.
 */
final class ModuleRegistry
{
    /** Verbs the RBAC seeder issues for every module. */
    private const ACTIONS = ['view', 'create', 'update', 'delete', 'manage'];

    /** @var Collection<string, ModuleDescriptor>|null */
    private ?Collection $descriptors = null;

    public function __construct(private readonly RepositoryInterface $modules) {}

    /**
     * Every module the platform ships, ordered the way a sidebar should show
     * them. Includes modules the operator has switched off — a client that asks
     * for the manifest is entitled to know they exist.
     *
     * @return Collection<string, ModuleDescriptor>
     */
    public function all(): Collection
    {
        return $this->descriptors ??= collect($this->modules->all())
            ->map(fn ($module): ModuleDescriptor => $this->describe($module))
            // Single sort key rather than a multi-sort: Collection::sortBy reads
            // an array of callables as comparators, not as key extractors.
            ->sortBy(static fn (ModuleDescriptor $d): string => sprintf('%03d-%s', $d->order, $d->name))
            ->keyBy(static fn (ModuleDescriptor $d): string => $d->key);
    }

    public function find(string $key): ?ModuleDescriptor
    {
        return $this->all()->get(strtolower($key));
    }

    /**
     * Resolve a module from a class living inside it.
     *
     * `Modules\Menu\Http\Controllers\MenuItemController` → the Menu descriptor.
     * Used by the route guard so no module has to remember to declare which
     * module it belongs to.
     */
    public function findByClass(string $class): ?ModuleDescriptor
    {
        if (preg_match('/^Modules\\\\([A-Za-z0-9_]+)\\\\/', $class, $matches) !== 1) {
            return null;
        }

        $name = strtolower($matches[1]);

        return $this->all()->first(
            static fn (ModuleDescriptor $d): bool => strtolower($d->name) === $name,
        );
    }

    /**
     * Has this restaurant switched the module off?
     *
     * Absent from settings means on: opting out is a deliberate act.
     */
    public function enabledForTenant(ModuleDescriptor $module, ?Tenant $tenant): bool
    {
        if ($module->required) {
            return true;
        }

        if ($tenant === null) {
            return true;
        }

        return (bool) $tenant->setting("modules.{$module->key}", true);
    }

    /** Live for this restaurant: the operator allows it and the restaurant wants it. */
    public function isAvailable(ModuleDescriptor $module, ?Tenant $tenant): bool
    {
        return $module->enabled && $this->enabledForTenant($module, $tenant);
    }

    /**
     * Switch a module on or off for one restaurant.
     *
     * Writes back the whole settings array because `settings` is a JSON column:
     * `data_set` on a copy keeps any unrelated keys intact.
     */
    public function setForTenant(ModuleDescriptor $module, Tenant $tenant, bool $enabled): void
    {
        $settings = $tenant->settings ?? [];
        data_set($settings, "modules.{$module->key}", $enabled);

        $tenant->settings = $settings;
        $tenant->save();
    }

    private function describe(mixed $module): ModuleDescriptor
    {
        /** @var string $name */
        $name = $module->getName();
        $lower = strtolower($name);

        /** @var string $key */
        $key = config("{$lower}.alias", $lower);

        /** @var array<string, string> $labels */
        $labels = config("{$lower}.labels", []);

        $prefix = (string) config("{$lower}.permission_prefix", $key);

        return new ModuleDescriptor(
            key: $key,
            name: $name,
            labels: $labels,
            description: $this->description($module, $lower),
            icon: (string) config("{$lower}.icon", 'square'),
            group: (string) config("{$lower}.group", 'other'),
            route: 'api/'.ltrim((string) config("{$lower}.route", "v1/{$key}"), '/'),
            // Display position, deliberately separate from module.json's
            // `priority`, which nwidart uses for provider boot order.
            order: (int) config("{$lower}.order", $module->get('priority') ?? 99),
            permissionPrefix: $prefix,
            permissions: array_map(static fn (string $a): string => "{$prefix}.{$a}", self::ACTIONS),
            // Both switches the operator controls: the module.json status file
            // that `php artisan module:disable` writes, and the env-backed flag.
            enabled: $module->isEnabled() && (bool) config("{$lower}.enabled", true),
            required: (bool) config("{$lower}.required", false),
        );
    }

    private function description(mixed $module, string $lower): ?string
    {
        $description = config("{$lower}.description") ?? $module->get('description');

        return is_string($description) && $description !== '' ? $description : null;
    }
}
