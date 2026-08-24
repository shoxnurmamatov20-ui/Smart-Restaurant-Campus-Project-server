<?php

declare(strict_types=1);

namespace Modules\Marketplace\Models;

use Illuminate\Auth\Authenticatable;
use Illuminate\Contracts\Auth\Authenticatable as AuthenticatableContract;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\HasApiTokens;
use Modules\Marketplace\Database\Factories\ConsumerFactory;

/**
 * Somebody who orders food on MyPOS, from whichever restaurant they like.
 *
 * ---------------------------------------------------------------------------
 * This model has no `BelongsToTenant`, and that is the decision
 *
 * Every other model in every other module carries it, and the architecture
 * suite refuses one that does not — so this class is named in
 * `ModuleBoundaryTest` with the reason, the same way `public.users` is.
 *
 * A marketplace customer belongs to the platform. Stamping them with the first
 * restaurant they ordered from would give them a second account at the second
 * restaurant, split their address book and their points down the middle, and
 * make "one basket, one account, forty restaurants" — the entire consumer
 * proposition — a thing the schema forbids.
 *
 * `crm.customers` is the other model and stays tenanted: that is a
 * restaurant's own guest list, its own loyalty scheme, and its own tab. The
 * same person may be both, and they are deliberately not the same row.
 *
 * ---------------------------------------------------------------------------
 * What stands in for the policy
 *
 * The token, and nothing else — so the token is checked hard. `RequireConsumerToken`
 * refuses anything that is not a live token of the `mp-consumer` ability owned
 * by a Consumer, and every controller behind it reads rows by
 * `$consumer->id` rather than by an id out of a URL. A tenant-free table with
 * one careless `find($request->id)` in front of it is the whole platform's
 * customer list on an endpoint with no login.
 *
 * ---------------------------------------------------------------------------
 * Sanctum on a guest
 *
 * Same reasoning as `Crm\Customer`: a customer is not a `User`, holds no Spatie
 * role and appears in no roster. The token carries one ability and expires; a
 * marketplace account can be signed into from a phone that is then sold.
 *
 * @property int $id
 * @property string $phone
 * @property string|null $name
 * @property string $locale
 * @property bool $is_active
 * @property Carbon|null $plus_until
 * @property int $points
 * @property Carbon|null $last_seen_at
 * @property array<array-key, mixed>|null $notification_prefs
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property Carbon|null $deleted_at
 * @property-read Collection<int, ConsumerAddress> $addresses
 *
 * @method static \Modules\Marketplace\Database\Factories\ConsumerFactory factory($count = null, $state = [])
 * @method static \Illuminate\Database\Eloquent\Builder<static>|Consumer newModelQuery()
 * @method static \Illuminate\Database\Eloquent\Builder<static>|Consumer newQuery()
 * @method static \Illuminate\Database\Eloquent\Builder<static>|Consumer query()
 *
 * @mixin \Eloquent
 */
final class Consumer extends Model implements AuthenticatableContract
{
    /**
     * Authenticatable, because `auth:sanctum` resolves this model directly.
     *
     * The contract is what the guard hands to `$request->user()`, and without it
     * the first thing the framework asks for — `getAuthIdentifier()` — does not
     * exist. `Crm\Customer` avoids the trait because it never goes through the
     * guard at all: its middleware reads the token by hand, for a row-level
     * security reason that does not apply here. See `RequireConsumerToken`.
     *
     * Nothing about it makes this a `User`. There is no password column, no
     * remember token and no Spatie role; a marketplace customer signs in with a
     * phone and an SMS code and holds one ability.
     */
    /** @use HasFactory<ConsumerFactory> */
    use Authenticatable, HasApiTokens, HasFactory, SoftDeletes;

    protected $table = 'marketplace.consumers';

    /** The one thing a marketplace token is for. */
    public const ABILITY = 'mp-consumer';

    /** MyPOS Plus, per month, in tiyin — `PLUS_MONTHLY` on the consumer side. */
    public const PLUS_MONTHLY_TIYIN = 3_900_000;

    /** @var list<string> */
    protected $fillable = [
        'phone', 'name', 'locale', 'is_active', 'plus_until', 'points', 'last_seen_at',
        'notification_prefs',
    ];

    /**
     * Which of the platform's messages this person wants, and the defaults.
     *
     * Order and delivery notices default ON because they are what the guest
     * asked for by ordering — a courier at the door with the phone silent is
     * the failure this exists to avoid. Marketing defaults OFF, which is what
     * the law in most of the markets this ships to requires and what a person
     * would choose anyway.
     *
     * A missing key means the default rather than false, which is why this is
     * jsonb and not four NOT NULL boolean columns: a preference nobody has
     * expressed is not the same as one somebody turned off.
     */
    public const NOTIFICATION_DEFAULTS = [
        'orders' => true,
        'delivery' => true,
        'promos' => true,
        'newsletter' => false,
    ];

    /** @var list<string> */
    protected $hidden = ['phone'];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'plus_until' => 'datetime',
            'last_seen_at' => 'datetime',
            'points' => 'integer',
            'notification_prefs' => 'array',
        ];
    }

    /** @return HasMany<ConsumerAddress, $this> */
    public function addresses(): HasMany
    {
        return $this->hasMany(ConsumerAddress::class, 'consumer_id')->orderBy('sort_order');
    }

    /**
     * Every subscription this person has ever held, newest first.
     *
     * @return HasMany<Subscription, $this>
     */
    public function subscriptions(): HasMany
    {
        return $this->hasMany(Subscription::class, 'consumer_id')->orderByDesc('started_at');
    }

    /** The live one, or none. */
    public function subscription(): ?Subscription
    {
        return $this->subscriptions()->active()->first();
    }

    /**
     * The four switches, with the ones nobody has touched filled in.
     *
     * @return array<string, bool>
     */
    public function notificationPrefs(): array
    {
        $stored = is_array($this->notification_prefs) ? $this->notification_prefs : [];

        $answer = [];

        foreach (self::NOTIFICATION_DEFAULTS as $key => $default) {
            $answer[$key] = array_key_exists($key, $stored) ? (bool) $stored[$key] : $default;
        }

        return $answer;
    }

    /**
     * Subscribed right now.
     *
     * Asked of the date rather than of a flag, because "is this person a
     * subscriber" is a question about this moment and a boolean makes last
     * month's answer permanent — which is a month of free delivery nobody paid
     * for.
     */
    public function hasPlus(): bool
    {
        return $this->plus_until !== null && $this->plus_until->isFuture();
    }

    /**
     * Digits a person typed, as E.164.
     *
     * Deliberately identical to `Crm\Customer::normalisePhone()` and
     * deliberately not shared with it: a module may not import another module,
     * and a nine-digit Uzbek number is a fact about the country rather than
     * about either module. If a third caller appears, this belongs in
     * `App\Support` — two is not yet enough to move it.
     */
    public static function normalisePhone(string $phone): string
    {
        $digits = preg_replace('/\D/', '', $phone) ?? '';

        if (mb_strlen($digits) === 9) {
            $digits = '998'.$digits;
        }

        return '+'.$digits;
    }

    /**
     * Named explicitly, because Laravel guesses `Database\Factories\…`
     * from the model's namespace and a module's factories are not there.
     */
    protected static function newFactory(): ConsumerFactory
    {
        return ConsumerFactory::new();
    }
}
