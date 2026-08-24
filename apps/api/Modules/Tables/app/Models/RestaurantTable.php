<?php

declare(strict_types=1);

namespace Modules\Tables\Models;

use App\Models\Activity;
use App\Models\Branch;
use App\Models\Concerns\BelongsToBranch;
use App\Models\Concerns\BelongsToTenant;
use App\Models\Tenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Carbon;
use Modules\Tables\Database\Factories\RestaurantTableFactory;
use Modules\Tables\Events\TableStateChanged;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;

/**
 * One table on the floor.
 *
 * Named RestaurantTable rather than Table because "tables" is far too generic
 * a class name to import next to Eloquent's own schema vocabulary.
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property int $hall_id
 * @property string $label What the guests and waiters call it, e.g. A-7
 * @property int $seats
 * @property string $kind regular
 * @property int $position Where the tile sits within its hall; 0 means unplaced
 * @property string $status free
 * @property string|null $qr_token Opens the public QR menu for this table
 * @property bool $is_active
 * @property int|null $claimed_by_user_id The waiter looking after this table
 * @property Carbon|null $claimed_at
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property Carbon|null $deleted_at
 * @property int|null $branch_id
 * @property-read Collection<int, Activity> $activities
 * @property-read int|null $activities_count
 * @property-read Branch|null $branch
 * @property-read Hall|null $hall
 * @property-read Collection<int, Reservation> $reservations
 * @property-read int|null $reservations_count
 * @property-read Tenant|null $tenant
 *
 * @method static Builder<static>|RestaurantTable active()
 * @method static \Modules\Tables\Database\Factories\RestaurantTableFactory factory($count = null, $state = [])
 * @method static Builder<static>|RestaurantTable free()
 * @method static Builder<static>|RestaurantTable newModelQuery()
 * @method static Builder<static>|RestaurantTable newQuery()
 * @method static Builder<static>|RestaurantTable ofHall(int $hallId)
 * @method static Builder<static>|RestaurantTable onlyTrashed()
 * @method static Builder<static>|RestaurantTable query()
 * @method static Builder<static>|RestaurantTable whereBranchId($value)
 * @method static Builder<static>|RestaurantTable whereCreatedAt($value)
 * @method static Builder<static>|RestaurantTable whereDeletedAt($value)
 * @method static Builder<static>|RestaurantTable whereHallId($value)
 * @method static Builder<static>|RestaurantTable whereId($value)
 * @method static Builder<static>|RestaurantTable whereIsActive($value)
 * @method static Builder<static>|RestaurantTable whereKind($value)
 * @method static Builder<static>|RestaurantTable whereLabel($value)
 * @method static Builder<static>|RestaurantTable whereQrToken($value)
 * @method static Builder<static>|RestaurantTable whereSeats($value)
 * @method static Builder<static>|RestaurantTable whereStatus($value)
 * @method static Builder<static>|RestaurantTable whereTenantId($value)
 * @method static Builder<static>|RestaurantTable whereUpdatedAt($value)
 * @method static Builder<static>|RestaurantTable withTrashed(bool $withTrashed = true)
 * @method static Builder<static>|RestaurantTable withoutTrashed()
 *
 * @mixin \Eloquent
 */
final class RestaurantTable extends Model
{
    use BelongsToBranch;
    use BelongsToTenant;

    /** @use HasFactory<RestaurantTableFactory> */
    use HasFactory;

    use LogsActivity;
    use SoftDeletes;

    protected $table = 'tables.restaurant_tables';

    public const KINDS = ['regular', 'vip', 'terrace', 'bar'];

    public const STATUSES = ['free', 'occupied', 'reserved', 'cleaning'];

    protected $fillable = [
        'tenant_id',
        'hall_id',
        'label',
        'seats',
        'kind',
        'position',
        'status',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'seats' => 'integer',
            'position' => 'integer',
            'claimed_by_user_id' => 'integer',
            'claimed_at' => 'datetime',
        ];
    }

    protected static function newFactory(): RestaurantTableFactory
    {
        return RestaurantTableFactory::new();
    }

    /**
     * The alphabet a QR token is drawn from, and why it is this one.
     *
     * Base62 rather than hex: 22 characters of base62 carry ~131 bits, which is
     * the same unguessability as a UUID in two thirds of the length. Length
     * matters here in a way it rarely does — the token is the tail of a URL
     * printed on a sticker, and every character is a module more of QR that has
     * to survive being scanned across a table in low light.
     *
     * Case-sensitive, and that is a decision rather than an oversight: the token
     * is never read aloud or typed, only scanned or tapped, so the usual reason
     * to fold case away does not apply and folding it would cost a fifth of the
     * entropy.
     *
     * Tables that predate this carry 32 hex characters instead, backfilled by
     * `2026_08_21_101000`. Both are unique and both scan; nothing re-issues an
     * existing one, because a token is not an internal id — it is laminated and
     * stuck to a table, and re-minting it turns a physical object in a dining
     * room into a 404.
     */
    private const TOKEN_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

    private const TOKEN_LENGTH = 22;

    protected static function booted(): void
    {
        /*
         * Every table leaves here with a token.
         *
         * On the model rather than in the controller, because a table is created
         * from four places — the API, the seeder, a factory in a test, and an
         * import — and a table without a token is a table whose QR sticker
         * cannot be printed. The one that would have been missed is the import.
         *
         * `??=` so an explicit token survives: restoring a venue from a backup
         * has to keep the codes already stuck to its furniture.
         */
        self::creating(static function (self $table): void {
            $table->qr_token ??= self::newQrToken();
        });

        /*
         * The room hears about a table changing hands.
         *
         * On the model rather than in the controller, because a table's state is
         * moved from four places — the host's own button, seating a reservation,
         * an order opening, a bill closing — and three of them are in code that
         * has no idea a floor screen exists. A broadcast wired to the endpoint
         * would be right on the one path somebody remembered.
         */
        self::updated(static function (self $table): void {
            if (! $table->wasChanged('status')) {
                return;
            }

            TableStateChanged::announce($table, (string) $table->getOriginal('status'));
        });
    }

    /**
     * A fresh token for a table's QR sticker.
     *
     * `random_int` rather than `rand`: this is a bearer credential in a URL, and
     * a guessable one would let somebody outside the building open a table's
     * bill. It is unguessable rather than secret — it is printed on a sticker in
     * a public room — which is exactly the property a table code needs.
     */
    public static function newQrToken(): string
    {
        $alphabet = self::TOKEN_ALPHABET;
        $last = strlen($alphabet) - 1;
        $token = '';

        for ($i = 0; $i < self::TOKEN_LENGTH; $i++) {
            $token .= $alphabet[random_int(0, $last)];
        }

        return $token;
    }

    /**
     * The table a scanned sticker names, or null.
     *
     * Tenant-scoped by the global scope it inherits, which is the guarantee that
     * matters: a token from one restaurant cannot resolve inside another even
     * though the index that enforces uniqueness is platform-wide. A guest
     * request carries `X-Tenant` from the URL's restaurant segment, so the two
     * halves of the sticker have to agree before anything is found.
     *
     * Null rather than a throw. A token comes off a camera pointed at a printed
     * square: a peeling sticker, a photograph of a photograph and an old table
     * that was retired all arrive here, and every one of them is "no such
     * table" rather than a 500.
     */
    public static function findByQrToken(string $token): ?self
    {
        $token = trim($token);

        if ($token === '') {
            return null;
        }

        return self::query()->where('qr_token', $token)->first();
    }

    // ============ Relationships ============

    public function hall(): BelongsTo
    {
        return $this->belongsTo(Hall::class, 'hall_id');
    }

    public function reservations(): HasMany
    {
        return $this->hasMany(Reservation::class, 'restaurant_table_id');
    }

    // ============ Domain behaviour ============

    /**
     * Seat guests at this table.
     *
     * Returns false rather than throwing when the table is not seatable, so a
     * waiter tapping a busy table gets a plain "no" instead of a 500.
     */
    public function occupy(): bool
    {
        if (! in_array($this->status, ['free', 'reserved'], true)) {
            return false;
        }

        return $this->update(['status' => 'occupied']);
    }

    /**
     * A waiter has taken this table.
     *
     * Seats it and stamps whose section it is, in one write. Deliberately NOT
     * two calls — `occupy()` then a save — because the pair can half-happen and
     * a table that is occupied by nobody is exactly the state the floor screen
     * cannot draw.
     *
     * Idempotent for the same person and refuses for anybody else: two waiters
     * both told "yes" is two waiters walking to the same six covers. A table
     * that is already `occupied` with no claimer on it is claimable — that is
     * the ordinary case of somebody seating guests at a table the host had
     * already marked busy.
     *
     * `forceFill` because neither column is fillable: a claim is set by this
     * method or not at all, so no request body can ever hand a table to
     * somebody else.
     */
    public function claimBy(int $userId): bool
    {
        if ($this->claimed_by_user_id !== null && $this->claimed_by_user_id !== $userId) {
            return false;
        }

        if (! in_array($this->status, ['free', 'reserved', 'occupied'], true)) {
            return false;
        }

        return $this->forceFill([
            'status' => 'occupied',
            'claimed_by_user_id' => $userId,
            // Kept from the first claim on a retry: the queue drains at seven
            // the next morning, and the fact worth storing is when the waiter
            // took the table, not when their phone found a signal.
            'claimed_at' => $this->claimed_at ?? now(),
        ])->save();
    }

    /** Guests left — the table needs clearing before it can be sold again. */
    public function release(): bool
    {
        return $this->update(['status' => 'cleaning']);
    }

    /**
     * Clear and claimable again.
     *
     * The claim goes with it. A free table still carrying last night's waiter
     * would refuse the next person to seat it, and the refusal would look like
     * a bug rather than like a table somebody forgot to hand back.
     */
    public function markFree(): bool
    {
        return $this->forceFill([
            'status' => 'free',
            'claimed_by_user_id' => null,
            'claimed_at' => null,
        ])->save();
    }

    // ============ Scopes ============

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }

    public function scopeFree(Builder $query): Builder
    {
        return $query->where('status', 'free')->where('is_active', true);
    }

    public function scopeOfHall(Builder $query, int $hallId): Builder
    {
        return $query->where('hall_id', $hallId);
    }

    // ============ Spatie ActivityLog ============

    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            ->logOnly(['tenant_id', 'hall_id', 'label', 'seats', 'kind', 'position', 'status', 'is_active'])
            ->logOnlyDirty()
            ->dontSubmitEmptyLogs()
            ->useLogName('tables.table');
    }
}
