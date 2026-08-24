<?php

declare(strict_types=1);

namespace Modules\Tables\Models;

use App\Models\Activity;
use App\Models\Branch;
use App\Models\Concerns\BelongsToBranch;
use App\Models\Concerns\BelongsToTenant;
use App\Models\Tenant;
use App\Support\Tenancy\BusinessDay;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Carbon;
use Modules\Tables\Database\Factories\ReservationFactory;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;

/**
 * A booked table. A no-show costs the same as an empty table, so status matters.
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property int|null $restaurant_table_id
 * @property string $guest_name
 * @property string $guest_phone
 * @property int $guests_count
 * @property Carbon $starts_at
 * @property Carbon|null $ends_at
 * @property string $status pending|confirmed|seated|completed|cancelled|no_show
 * @property string $source phone
 * @property string|null $note
 * @property string|null $code What the guest quotes to read, confirm or cancel their own booking
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property Carbon|null $deleted_at
 * @property int|null $branch_id
 * @property-read Collection<int, Activity> $activities
 * @property-read int|null $activities_count
 * @property-read Branch|null $branch
 * @property-read bool $is_upcoming
 * @property-read RestaurantTable|null $restaurantTable
 * @property-read Tenant|null $tenant
 *
 * @method static \Modules\Tables\Database\Factories\ReservationFactory factory($count = null, $state = [])
 * @method static Builder<static>|Reservation forDay(string $date)
 * @method static Builder<static>|Reservation newModelQuery()
 * @method static Builder<static>|Reservation newQuery()
 * @method static Builder<static>|Reservation onlyTrashed()
 * @method static Builder<static>|Reservation query()
 * @method static Builder<static>|Reservation upcoming()
 * @method static Builder<static>|Reservation whereBranchId($value)
 * @method static Builder<static>|Reservation whereCreatedAt($value)
 * @method static Builder<static>|Reservation whereDeletedAt($value)
 * @method static Builder<static>|Reservation whereEndsAt($value)
 * @method static Builder<static>|Reservation whereGuestName($value)
 * @method static Builder<static>|Reservation whereGuestPhone($value)
 * @method static Builder<static>|Reservation whereGuestsCount($value)
 * @method static Builder<static>|Reservation whereId($value)
 * @method static Builder<static>|Reservation whereNote($value)
 * @method static Builder<static>|Reservation whereRestaurantTableId($value)
 * @method static Builder<static>|Reservation whereSource($value)
 * @method static Builder<static>|Reservation whereStartsAt($value)
 * @method static Builder<static>|Reservation whereStatus($value)
 * @method static Builder<static>|Reservation whereTenantId($value)
 * @method static Builder<static>|Reservation whereUpdatedAt($value)
 * @method static Builder<static>|Reservation withTrashed(bool $withTrashed = true)
 * @method static Builder<static>|Reservation withoutTrashed()
 *
 * @mixin \Eloquent
 */
final class Reservation extends Model
{
    use BelongsToBranch;
    use BelongsToTenant;

    /** @use HasFactory<ReservationFactory> */
    use HasFactory;

    use LogsActivity;
    use SoftDeletes;

    protected $table = 'tables.reservations';

    /**
     * The whole life of a booking: pending → confirmed → seated → completed,
     * with `no_show` and `cancelled` as the two ways out.
     *
     * `completed` was missing and its absence had a cost. Without it a party who
     * came, ate and left stays `seated` for ever — so "who is sitting at a held
     * table right now" and "who came tonight" are the same query, the diary
     * never empties, and the only way to close a booking was to cancel it,
     * which files an honoured reservation under the same word as one the guest
     * called off.
     */
    public const STATUSES = ['pending', 'confirmed', 'seated', 'completed', 'cancelled', 'no_show'];

    /** Nothing follows these — a booking that reached one is history. */
    public const CLOSED_STATUSES = ['completed', 'cancelled', 'no_show'];

    public const SOURCES = ['phone', 'web', 'bot', 'walk_in'];

    /**
     * The alphabet a guest's code is drawn from, and what is missing from it.
     *
     * No `0`, `O`, `1`, `I` or `L`. This code is read aloud down a telephone
     * and typed by somebody standing outside a restaurant in the dark, and the
     * pairs above are the ones people get wrong — a booking that cannot be found
     * because a guest read an O as a zero is a guest arguing at a door.
     *
     * Ten characters of a 31-letter alphabet is roughly 49 bits, which is not a
     * password and does not need to be: what it has to survive is somebody
     * typing the next code along, not an offline attack. See the migration.
     */
    private const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

    private const CODE_LENGTH = 10;

    protected $fillable = [
        'tenant_id',
        /*
         * A booking happens at an address.
         *
         * `BelongsToBranch` fills this from `X-Branch` on create, which is right
         * for a host booking from the venue they are standing in and wrong for
         * the one case that actually needs the column: an owner reading the whole
         * business, whose requests carry no branch, taking a booking for
         * Chilonzor over the phone. Fillable so they can say which.
         */
        'branch_id',
        'restaurant_table_id',
        'guest_name',
        'guest_phone',
        'guests_count',
        'starts_at',
        'ends_at',
        'status',
        'source',
        'note',
        /*
         * Fillable so a staff-side import or a fixture can carry one, but never
         * required: `booted()` mints it when nobody did. A booking with no code
         * is a booking whose guest can never be sent a link.
         */
        'code',
    ];

    protected function casts(): array
    {
        return [
            'starts_at' => 'datetime',
            'ends_at' => 'datetime',
            'guests_count' => 'integer',
        ];
    }

    protected static function newFactory(): ReservationFactory
    {
        return ReservationFactory::new();
    }

    protected static function booted(): void
    {
        // Minted on the way in, exactly as a table's QR token is: the guest has
        // to be told something the moment the booking is taken, and a code
        // written later is a code the confirmation email did not carry.
        self::creating(static function (self $reservation): void {
            $reservation->code ??= self::newCode();
        });
    }

    /**
     * A fresh code for a guest to quote.
     *
     * `random_int` rather than `rand`, because this is a bearer credential: it
     * is the only thing standing between a stranger and somebody else's name,
     * telephone number and evening. Unguessable rather than secret — it travels
     * by SMS and gets read aloud — which is the same property a table's sticker
     * needs and the same reasoning `RestaurantTable::newQrToken()` gives.
     */
    public static function newCode(): string
    {
        $last = strlen(self::CODE_ALPHABET) - 1;
        $code = '';

        for ($i = 0; $i < self::CODE_LENGTH; $i++) {
            $code .= self::CODE_ALPHABET[random_int(0, $last)];
        }

        return $code;
    }

    /**
     * The booking a code names, or null.
     *
     * Upper-cased and trimmed first: the code is printed in capitals and typed
     * by a guest whose keyboard is not, and a lookup that failed on case would
     * be a booking that "does not exist" in front of a person holding it.
     *
     * Tenant-scoped by the global scope it inherits, which is the guarantee that
     * matters: a code from one restaurant cannot resolve inside another even
     * though the uniqueness index is platform-wide. The request carries
     * `X-Tenant` from the restaurant's own URL segment, so both halves have to
     * agree before anything is found.
     */
    public static function findByCode(string $code): ?self
    {
        $code = strtoupper(trim($code));

        if ($code === '') {
            return null;
        }

        return self::query()->where('code', $code)->first();
    }

    // ============ Relationships ============

    /**
     * NOT named table(): Eloquent already owns $table (the DB table name), so
     * $reservation->table would return the string "reservations", not a model.
     */
    public function restaurantTable(): BelongsTo
    {
        return $this->belongsTo(RestaurantTable::class, 'restaurant_table_id');
    }

    // ============ Accessors ============

    /** Bron hali kutilyaptimi — o'tib ketgan bron zal xaritasini band qilib turmasligi kerak. */
    protected function isUpcoming(): Attribute
    {
        return Attribute::get(fn (): bool => in_array($this->status, ['pending', 'confirmed'], true)
            && $this->starts_at !== null
            && $this->starts_at->isFuture());
    }

    // ============ Domain behaviour ============

    public function confirm(): bool
    {
        if (! in_array($this->status, ['pending', 'confirmed'], true)) {
            return false;
        }

        return $this->update(['status' => 'confirmed']);
    }

    /**
     * Seat the guests: the reservation closes and the table goes to occupied in
     * the same call, because a host who does one and forgets the other leaves
     * the floor map lying.
     */
    public function seat(): bool
    {
        if (! in_array($this->status, ['pending', 'confirmed'], true)) {
            return false;
        }

        $this->restaurantTable?->occupy();

        return $this->update(['status' => 'seated']);
    }

    /**
     * They came, they ate, they left.
     *
     * Only from `seated`, because that is the only state it can honestly follow:
     * a booking that was never sat is either a no-show or a cancellation, and
     * letting a host mark a `pending` booking complete would put parties in
     * tonight's numbers who never walked through the door.
     *
     * The table is not touched. Guests leaving means the table needs clearing,
     * which is `release()` and belongs to whoever is looking at the floor — and
     * frequently the party has already moved to the bar while the table is being
     * turned. Doing both here would have this method lie about one of them.
     */
    public function complete(): bool
    {
        if ($this->status !== 'seated') {
            return false;
        }

        return $this->update(['status' => 'completed']);
    }

    public function cancel(): bool
    {
        return $this->update(['status' => 'cancelled']);
    }

    /**
     * Nobody came.
     *
     * Refused once the party is seated or the booking is already closed: a
     * no-show is a fact about a table that stayed empty, and marking a party who
     * ate as one is how a restaurant ends up with a regular on a blacklist.
     */
    public function markNoShow(): bool
    {
        if (! in_array($this->status, ['pending', 'confirmed'], true)) {
            return false;
        }

        return $this->update(['status' => 'no_show']);
    }

    // ============ Scopes ============

    public function scopeUpcoming(Builder $query): Builder
    {
        return $query->whereIn('status', ['pending', 'confirmed'])->where('starts_at', '>=', now());
    }

    /**
     * The reservation diary for one calendar day, in the restaurant's timezone.
     *
     * A calendar day rather than a trading day: a host looking at "the 11th"
     * means the 11th as printed on the wall, and a 00:30 booking is shown on the
     * date the guest chose. A range on the raw column keeps the
     * `(tenant_id, restaurant_table_id, starts_at)` index usable.
     */
    public function scopeForDay(Builder $query, string $date): Builder
    {
        $businessDay = app(BusinessDay::class);

        return $businessDay->constrain($query, 'starts_at', $businessDay->calendarDay($date));
    }

    // ============ Spatie ActivityLog ============

    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            ->logOnly(['tenant_id', 'restaurant_table_id', 'guest_name', 'guest_phone', 'guests_count', 'starts_at', 'status'])
            ->logOnlyDirty()
            ->dontSubmitEmptyLogs()
            ->useLogName('tables.reservation');
    }
}
