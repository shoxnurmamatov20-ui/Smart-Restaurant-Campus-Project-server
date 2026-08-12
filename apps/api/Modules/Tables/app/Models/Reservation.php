<?php

declare(strict_types=1);

namespace Modules\Tables\Models;

use App\Models\Concerns\BelongsToBranch;
use App\Models\Concerns\BelongsToTenant;
use App\Support\Tenancy\BusinessDay;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;
use Modules\Tables\Database\Factories\ReservationFactory;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;

/**
 * A booked table. A no-show costs the same as an empty table, so status matters.
 *
 * @method static ReservationFactory factory(int $count = null, array $state = [])
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

    public const STATUSES = ['pending', 'confirmed', 'seated', 'cancelled', 'no_show'];

    public const SOURCES = ['phone', 'web', 'bot', 'walk_in'];

    protected $fillable = [
        'tenant_id',
        'restaurant_table_id',
        'guest_name',
        'guest_phone',
        'guests_count',
        'starts_at',
        'ends_at',
        'status',
        'source',
        'note',
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

    public function cancel(): bool
    {
        return $this->update(['status' => 'cancelled']);
    }

    public function markNoShow(): bool
    {
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
