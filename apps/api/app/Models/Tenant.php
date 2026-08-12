<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A tenant is one restaurant business on the platform.
 *
 * "Osh Markazi" with four branches is a single tenant; branch-level separation
 * happens inside the modules, not here. Everything a tenant owns carries
 * `tenant_id` and is filtered by App\Models\Concerns\BelongsToTenant.
 *
 * Modules must NOT be referenced from this class — the core never depends on a
 * module. Read the other direction instead: a module's model declares
 * `belongsTo(Tenant::class)` through the BelongsToTenant trait.
 *
 * @property int $id
 * @property string $name
 * @property string $slug
 * @property string $country_code
 * @property string $locale
 * @property string $timezone
 * @property string $status
 * @property array<string, mixed>|null $settings
 */
#[Fillable(['name', 'slug', 'country_code', 'locale', 'timezone', 'status', 'settings'])]
final class Tenant extends Model
{
    protected function casts(): array
    {
        return [
            'settings' => 'array',
        ];
    }

    public function users(): HasMany
    {
        return $this->hasMany(User::class);
    }

    /**
     * A per-restaurant setting with a platform default.
     *
     * Currency, service charge, VAT and the business-day boundary all differ
     * per venue, so they live in `settings` rather than in a migration.
     */
    public function setting(string $key, mixed $default = null): mixed
    {
        return data_get($this->settings, $key, $default);
    }

    public function isActive(): bool
    {
        return $this->status === 'active';
    }
}
