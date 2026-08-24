<?php

declare(strict_types=1);

namespace App\Models;

use App\Support\Auth\TenantRoleOverlay;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\DatabaseNotification;
use Illuminate\Notifications\DatabaseNotificationCollection;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\HasApiTokens;
use Laravel\Sanctum\PersonalAccessToken;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
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
 * @property string $name
 * @property string $email
 * @property Carbon|null $email_verified_at
 * @property string $password
 * @property string|null $issued_password The value the platform handed over, encrypted — null once anybody else changes the password
 * @property Carbon|null $issued_password_at
 * @property string|null $remember_token
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property int|null $tenant_id
 * @property string|null $phone E.164, e.g. +998901234567 — how Telegram and SMS find this account
 * @property string|null $locale uz | ru | en — null means follow the restaurant
 * @property bool $is_active A suspended employee keeps their history but cannot sign in
 * @property Carbon|null $last_login_at
 * @property int|null $branch_id
 * @property string|null $two_factor_secret
 * @property Carbon|null $two_factor_confirmed_at
 * @property int|null $two_factor_last_window
 * @property-read Collection<int, Activity> $activities
 * @property-read int|null $activities_count
 * @property-read Branch|null $branch
 * @property-read DatabaseNotificationCollection<int, DatabaseNotification> $notifications
 * @property-read int|null $notifications_count
 * @property-read Collection<int, Permission> $permissions
 * @property-read int|null $permissions_count
 * @property-read Collection<int, Role> $roles
 * @property-read int|null $roles_count
 * @property-read Tenant|null $tenant
 * @property-read Collection<int, PersonalAccessToken> $tokens
 * @property-read int|null $tokens_count
 *
 * @method static Builder<static>|User active()
 * @method static Builder<static>|User byPhone(string $phone)
 * @method static \Database\Factories\UserFactory factory($count = null, $state = [])
 * @method static Builder<static>|User newModelQuery()
 * @method static Builder<static>|User newQuery()
 * @method static Builder<static>|User permission($permissions, $without = false)
 * @method static Builder<static>|User query()
 * @method static Builder<static>|User role($roles, $guard = null, $without = false)
 * @method static Builder<static>|User whereBranchId($value)
 * @method static Builder<static>|User whereCreatedAt($value)
 * @method static Builder<static>|User whereEmail($value)
 * @method static Builder<static>|User whereEmailVerifiedAt($value)
 * @method static Builder<static>|User whereId($value)
 * @method static Builder<static>|User whereIsActive($value)
 * @method static Builder<static>|User whereLastLoginAt($value)
 * @method static Builder<static>|User whereLocale($value)
 * @method static Builder<static>|User whereName($value)
 * @method static Builder<static>|User wherePassword($value)
 * @method static Builder<static>|User wherePhone($value)
 * @method static Builder<static>|User whereRememberToken($value)
 * @method static Builder<static>|User whereTenantId($value)
 * @method static Builder<static>|User whereTwoFactorConfirmedAt($value)
 * @method static Builder<static>|User whereTwoFactorLastWindow($value)
 * @method static Builder<static>|User whereTwoFactorSecret($value)
 * @method static Builder<static>|User whereUpdatedAt($value)
 * @method static Builder<static>|User withoutPermission($permissions)
 * @method static Builder<static>|User withoutRole($roles, $guard = null)
 *
 * @mixin \Eloquent
 */
#[Fillable(['tenant_id', 'branch_id', 'name', 'email', 'phone', 'password', 'locale', 'is_active'])]
// `two_factor_secret` is deliberately not fillable: it is written by the
// enrolment path alone, never by mass assignment from a request body.
#[Hidden(['password', 'issued_password', 'remember_token', 'two_factor_secret', 'two_factor_last_window'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, LogsActivity, Notifiable;

    /*
     * `HasRoles` with its permission check aliased, so the override below can
     * still reach it.
     *
     * `parent::checkPermissionTo()` cannot: the method comes from a TRAIT
     * (`HasPermissions`, which `HasRoles` composes), and a trait is flattened
     * into this class rather than sitting above it. `parent` therefore resolves
     * to Authenticatable, which has no such method, and every permission check
     * on the platform died in `Model::__call` with
     * "Call to undefined method App\Models\User::checkPermissionTo()" — a
     * failure that reaches every guarded route at once and looks like the
     * permission system being broken rather than like one missing alias.
     */
    use HasRoles {
        checkPermissionTo as protected spatieCheckPermissionTo;
    }

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
            /*
             * The password the platform issued, kept readable on purpose.
             *
             * `password` above is a one-way hash and stays one — this is the
             * separate fact that an operator handed this value over, so it can
             * be read back to a restaurant that rings up having lost it. The
             * migration says why that is worth storing and what keeps it safe;
             * `booted()` below is what keeps it *true*.
             */
            'issued_password' => 'encrypted',
            'issued_password_at' => 'datetime',
        ];
    }

    /**
     * A password changed by anybody else clears the copy the operator can read.
     *
     * The failure this prevents is the whole reason the column is defensible. An
     * owner changes their own password; the platform card goes on showing the
     * one it issued in March; an operator reads it down the phone and it does
     * not work — and now nobody trusts the screen, including for the restaurant
     * where it *was* right.
     *
     * So the rule is: this column is only ever true immediately after the
     * platform wrote it. `TenantController` sets both fields in one save, which
     * is why the guard below lets that pass; every other route to a new password
     * — the owner's own profile, a reset from anywhere — nulls it.
     *
     * Written here rather than in the controller because "everywhere else" is
     * not a list anybody can keep up to date, and a stale credential shown as
     * current is worse than no credential shown at all.
     */
    protected static function booted(): void
    {
        parent::booted();

        static::updating(function (self $user): void {
            if (! $user->isDirty('password')) {
                return;
            }

            // The platform's own write sets the copy in the same save. Anything
            // else that touched `password` did not, and its copy is now a lie.
            if ($user->isDirty('issued_password')) {
                return;
            }

            $user->issued_password = null;
            $user->issued_password_at = null;
        });
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

    /** Every phone this person can be reached on. */
    public function pushTokens(): HasMany
    {
        return $this->hasMany(PushToken::class);
    }

    /**
     * The one place a permission question is answered, with this restaurant's
     * own edits to the shared roles laid over Spatie's answer.
     *
     * Spatie routes `can()`, `canAny()` and `PermissionMiddleware` through this
     * method — see PermissionRegistrar::registerPermissions — which makes it the
     * only hook that catches every caller. A `Gate::before` would not: Spatie
     * registers its own when the Gate is first resolved, before-callbacks stop
     * at the first non-null answer, and a callback registered afterwards can
     * therefore add a permission but never take one away. Half an enforcement
     * point is worse than none, because the console would draw a denial the
     * server does not honour.
     *
     * `TenantRoleOverlay` returns null for a restaurant that has never edited
     * its matrix, which is almost every request, and the baseline answers as it
     * always did.
     *
     * The two parameters stay untyped to match the trait method this stands in
     * front of: Spatie passes a name, an id, a Permission model or a backed
     * enum depending on the caller, and narrowing the signature here would
     * refuse three of the four at the one place every permission question goes
     * through.
     *
     * @param \Spatie\Permission\Contracts\Permission|\BackedEnum|string|int $permission
     * @param string|null $guardName
     */
    public function checkPermissionTo($permission, $guardName = null): bool
    {
        if (is_string($permission)) {
            $verdict = TenantRoleOverlay::verdict($this, $permission);

            if ($verdict !== null) {
                return $verdict;
            }
        }

        return $this->spatieCheckPermissionTo($permission, $guardName);
    }
}
