<?php

declare(strict_types=1);

namespace App\Models;

use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;
use Spatie\Permission\Traits\HasRoles;

/**
 * A person who signs in.
 *
 * Deliberately NOT `BelongsToTenant`: identity is what *discovers* the tenant,
 * so scoping users by the current tenant would make login impossible — there is
 * no context yet at the moment credentials are checked. Isolation is enforced
 * instead by App\Http\Middleware\ResolveTenant, which pins an authenticated user
 * to their own `tenant_id`.
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property int|null $branch_id Pinned venue; null spans every branch of the tenant
 * @property string $name
 * @property string $email
 * @property string|null $phone
 * @property ?string $locale
 * @property bool $is_active
 */
#[Fillable(['tenant_id', 'branch_id', 'name', 'email', 'phone', 'password', 'locale', 'is_active'])]
// `two_factor_secret` is deliberately not fillable: it is written by the
// enrolment path alone, never by mass assignment from a request body.
#[Hidden(['password', 'remember_token', 'two_factor_secret', 'two_factor_last_window'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, HasRoles, LogsActivity, Notifiable;

    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            ->logOnly(['tenant_id', 'name', 'email', 'phone', 'is_active'])
            ->logOnlyDirty()
            ->dontSubmitEmptyLogs()
            // Named like every module's log so /api/v1/audit can offer it as a
            // filter; the package's "default" says nothing in a dropdown.
            ->useLogName('identity.user');
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    /**
     * The venue this person works at, or null when they span all of them.
     *
     * A branch manager, a waiter, a cashier, a cook and a storekeeper each
     * belong to one address. An owner and an accountant do not, and their null
     * is the difference between a shift report and a group report.
     */
    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    /** True when this user reads across every venue of their restaurant. */
    public function spansAllBranches(): bool
    {
        return $this->branch_id === null;
    }

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'last_login_at' => 'datetime',
            'password' => 'hashed',
            'is_active' => 'boolean',
            // Encrypted at rest: a database dump must not hand over the second
            // factor along with the first. `encrypted` also keeps it out of
            // `toArray()` in readable form; `$hidden` below keeps it out
            // entirely.
            'two_factor_secret' => 'encrypted',
            'two_factor_confirmed_at' => 'datetime',
        ];
    }

    // ============ Scopes ============

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }

    /**
     * Find an account by phone, tolerating a missing leading plus.
     *
     * Telegram hands back `998901234567` for a shared contact while a person
     * typing it writes `+998901234567`; both must reach the same account.
     */
    public function scopeByPhone(Builder $query, string $phone): Builder
    {
        $bare = ltrim($phone, '+');

        return $query->whereIn('phone', ['+'.$bare, $bare]);
    }

    // ============ Helpers ============

    /** Someone with no tenant operates above them all (platform staff). */
    public function isPlatformLevel(): bool
    {
        return $this->tenant_id === null;
    }
}
