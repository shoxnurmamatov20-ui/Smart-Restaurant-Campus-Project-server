<?php

declare(strict_types=1);

namespace Modules\Crm\Models;

use App\Models\Activity;
use App\Models\Concerns\BelongsToTenant;
use App\Models\Tenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\HasApiTokens;
use Laravel\Sanctum\PersonalAccessToken;
use Modules\Crm\Database\Factories\CustomerFactory;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;

/**
 * A guest we know by phone.
 *
 * Loyalty points live on the customer rather than in a separate account table:
 * one restaurant, one balance, and every read of a guest needs it anyway.
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property string $phone
 * @property string|null $name
 * @property string|null $locale
 * @property Carbon|null $birthday
 * @property int $points
 * @property string $tier bronze
 * @property int $cashback Amount in tiyin (1 UZS = 100 tiyin)
 * @property int $visits_count
 * @property Carbon|null $last_visit_at
 * @property string|null $segment regular|corporate|occasional|at_risk
 * @property string|null $usual_order
 * @property int|null $usual_order_item_id
 * @property int $total_spent Amount in tiyin (1 UZS = 100 tiyin)
 * @property int $credit_limit Tiyin the guest may owe at once. 0 = no tab
 * @property int $account_balance Tiyin, signed. Positive = the guest owes us
 * @property array<array-key, mixed>|null $allergens
 * @property string|null $note
 * @property bool $is_active
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property Carbon|null $deleted_at
 * @property-read Collection<int, AccountEntry> $accountEntries
 * @property-read int|null $account_entries_count
 * @property-read Collection<int, CustomerAddress> $addresses
 * @property-read Collection<int, CustomerDish> $dishes
 * @property-read int|null $dishes_count
 * @property-read int|null $addresses_count
 * @property-read Collection<int, CouponReservation> $couponReservations
 * @property-read int|null $coupon_reservations_count
 * @property-read Collection<int, PersonalAccessToken> $tokens
 * @property-read int|null $tokens_count
 * @property-read Collection<int, Activity> $activities
 * @property-read int|null $activities_count
 * @property-read int $average_cheque
 * @property-read bool $birthday_is_today
 * @property-read int $credit_available
 * @property-read Collection<int, Feedback> $feedbacks
 * @property-read int|null $feedbacks_count
 * @property-read Collection<int, LoyaltyTransaction> $loyaltyTransactions
 * @property-read int|null $loyalty_transactions_count
 * @property-read bool $runs_a_tab
 * @property-read Tenant|null $tenant
 *
 * @method static Builder<static>|Customer active()
 * @method static Builder<static>|Customer birthdayToday()
 * @method static Builder<static>|Customer inSegment(string $segment)
 * @method static Builder<static>|Customer inDebt()
 * @method static \Modules\Crm\Database\Factories\CustomerFactory factory($count = null, $state = [])
 * @method static Builder<static>|Customer newModelQuery()
 * @method static Builder<static>|Customer newQuery()
 * @method static Builder<static>|Customer onlyTrashed()
 * @method static Builder<static>|Customer query()
 * @method static Builder<static>|Customer whereAccountBalance($value)
 * @method static Builder<static>|Customer whereAllergens($value)
 * @method static Builder<static>|Customer whereBirthday($value)
 * @method static Builder<static>|Customer whereCashback($value)
 * @method static Builder<static>|Customer whereCreatedAt($value)
 * @method static Builder<static>|Customer whereCreditLimit($value)
 * @method static Builder<static>|Customer whereDeletedAt($value)
 * @method static Builder<static>|Customer whereId($value)
 * @method static Builder<static>|Customer whereIsActive($value)
 * @method static Builder<static>|Customer whereName($value)
 * @method static Builder<static>|Customer whereNote($value)
 * @method static Builder<static>|Customer wherePhone($value)
 * @method static Builder<static>|Customer wherePoints($value)
 * @method static Builder<static>|Customer whereTenantId($value)
 * @method static Builder<static>|Customer whereTier($value)
 * @method static Builder<static>|Customer whereTotalSpent($value)
 * @method static Builder<static>|Customer whereUpdatedAt($value)
 * @method static Builder<static>|Customer whereVisitsCount($value)
 * @method static Builder<static>|Customer withTrashed(bool $withTrashed = true)
 * @method static Builder<static>|Customer withoutTrashed()
 *
 * @mixin \Eloquent
 */
final class Customer extends Model
{
    use BelongsToTenant;

    /**
     * Sanctum, on a guest rather than a member of staff.
     *
     * A customer is not a `User` and must never become one: they hold no Spatie
     * role, appear in no roster, and belong to a restaurant as a guest rather
     * than as an employee. What they do need is a bearer token for the customer
     * app, and Sanctum's tokenable is polymorphic precisely so a second kind of
     * identity does not have to be squeezed into the first one's table.
     *
     * The token carries one ability, `customer`, and is resolved by
     * `Modules\Crm\Http\Middleware\RequireCustomerToken` rather than by
     * `auth:sanctum` — see that class for why the order of the middleware stack
     * makes the difference, and why it is a row-level-security question rather
     * than a preference.
     */
    use HasApiTokens;

    /** @use HasFactory<CustomerFactory> */
    use HasFactory;

    use LogsActivity;
    use SoftDeletes;

    protected $table = 'crm.customers';

    public const TIERS = ['bronze', 'silver', 'gold'];

    /**
     * The four the console's guest list draws, and the design's own words.
     *
     * `corporate` is the odd one and the reason `segment` is a stored column
     * rather than an expression: it is somebody's decision about a company
     * account and cannot be derived from visits at all. `crm:segment` writes the
     * other three overnight and never touches this one.
     */
    public const SEGMENTS = ['regular', 'corporate', 'occasional', 'at_risk'];

    /** The one nobody computes. A nightly pass must leave it alone. */
    public const MANUAL_SEGMENT = 'corporate';

    protected $fillable = [
        'tenant_id',
        'phone',
        'telegram_user_id',
        'name',
        /*
         * Which language to write to this guest in — theirs to set, from the
         * profile screen. Distinct from the language a request is answered in,
         * which `RefineLocale` already decides per request: this one is for the
         * messages that are not requests, like the SMS that carries a sign-in
         * code.
         */
        'locale',
        'birthday',
        'points',
        'tier',
        'cashback',
        'visits_count',
        'total_spent',
        /*
         * `last_visit_at` is fillable and `segment` is fillable; `usual_order`
         * is not.
         *
         * The first two are written by things a person can be responsible for —
         * the visit listener, the nightly classifier, and an owner tagging a
         * company account `corporate` by hand. The third is the top row of
         * `crm.customer_dishes` and is meaningless on its own: a PATCH that set
         * it would put a dish on the caller card that the tally underneath
         * disagrees with, which is the drift the tally exists to prevent.
         */
        'last_visit_at',
        'segment',
        /*
         * `credit_limit` is fillable; `account_balance` deliberately is not.
         *
         * The limit is a decision somebody makes about a guest and it is written
         * through one endpoint that asks for `crm.manage`. The balance is not a
         * decision at all — it is the sum of `crm.account_entries`, and the only
         * thing allowed to move it is the service that writes a ledger line in
         * the same transaction. Mass assignment would let a PATCH on a customer
         * clear a debt with no line saying who cleared it, which is exactly the
         * thing a tab exists to prevent.
         */
        'credit_limit',
        'allergens',
        'note',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'birthday' => 'date',
            'last_visit_at' => 'datetime',
            'allergens' => 'array',
            'is_active' => 'boolean',
            'points' => 'integer',
            'cashback' => 'integer',
            'visits_count' => 'integer',
            'total_spent' => 'integer',
            'credit_limit' => 'integer',
            'account_balance' => 'integer',
        ];
    }

    protected static function newFactory(): CustomerFactory
    {
        return CustomerFactory::new();
    }

    // ============ Relationships ============

    public function loyaltyTransactions(): HasMany
    {
        return $this->hasMany(LoyaltyTransaction::class)->latest();
    }

    public function feedbacks(): HasMany
    {
        return $this->hasMany(Feedback::class);
    }

    /** The tab, newest line first — the working behind `account_balance`. */
    public function accountEntries(): HasMany
    {
        return $this->hasMany(AccountEntry::class)->latest('id');
    }

    /** Where a courier is sent, the default one first. */
    public function addresses(): HasMany
    {
        return $this->hasMany(CustomerAddress::class)
            ->orderByDesc('is_default')
            ->orderBy('id');
    }

    /** What they order, most often first — the working behind `usual_order`. */
    public function dishes(): HasMany
    {
        return $this->hasMany(CustomerDish::class)->orderByDesc('times')->orderByDesc('last_at');
    }

    /** Coupons this guest has spent points on, newest first. */
    public function couponReservations(): HasMany
    {
        return $this->hasMany(CouponReservation::class)->latest('id');
    }

    // ============ Identity ============

    /**
     * Digits and a leading plus, and nothing else.
     *
     * `+998 90 123 45 67`, `998901234567` and `+998-90-123-45-67` are one guest
     * ringing one number, and stored as written they are three rows — three
     * loyalty balances, three sets of addresses, and a sign-in that finds a
     * different account depending on how the keyboard felt that day. START-HERE
     * §4 makes the phone the only identity key on this platform, which only
     * works if there is exactly one spelling of it.
     *
     * Uzbek numbers are normalised to full E.164: nine digits are a national
     * number and get `+998`, and a twelve-digit number starting `998` gets the
     * plus it was typed without.
     */
    public static function normalisePhone(string $phone): string
    {
        $digits = preg_replace('/\D/', '', $phone) ?? '';

        if (mb_strlen($digits) === 9) {
            $digits = '998'.$digits;
        }

        return '+'.$digits;
    }

    // ============ Accessors ============

    protected function averageCheque(): Attribute
    {
        return Attribute::get(fn (): int => $this->visits_count > 0
            ? (int) round($this->total_spent / $this->visits_count)
            : 0);
    }

    /**
     * How much more this guest may sign for right now.
     *
     * Floored at zero, and the floor matters. A guest already over their limit —
     * because a manager authorised it once, or because the limit was lowered
     * afterwards — has negative headroom, and reporting that number to a till
     * would draw a screen offering to take money OFF the tab. Zero is the honest
     * answer to "how much can they still put on it": nothing.
     *
     * A negative balance is the other direction and is real credit: a guest who
     * left a deposit can sign for the deposit plus their limit.
     */
    protected function creditAvailable(): Attribute
    {
        return Attribute::get(fn (): int => max(0, $this->credit_limit - $this->account_balance));
    }

    /** Whether this guest is allowed a tab at all. Nobody is, until somebody says so. */
    protected function runsATab(): Attribute
    {
        return Attribute::get(fn (): bool => $this->credit_limit > 0);
    }

    protected function birthdayIsToday(): Attribute
    {
        return Attribute::get(fn (): bool => $this->birthday !== null
            && $this->birthday->format('m-d') === now()->format('m-d'));
    }

    // ============ Domain behaviour ============

    /**
     * Move the loyalty balance and leave a transaction behind.
     *
     * Redeeming more than the guest has is refused: a negative balance is a
     * refund the restaurant never agreed to.
     */
    public function adjustPoints(string $kind, int $points, ?int $orderId = null, ?string $note = null): ?LoyaltyTransaction
    {
        if ($kind === 'redeem' && $points > $this->points) {
            return null;
        }

        $delta = $kind === 'redeem' ? -abs($points) : abs($points);

        $transaction = $this->loyaltyTransactions()->create([
            'kind' => $kind,
            'points' => $delta,
            'balance_after' => $this->points + $delta,
            'order_id' => $orderId,
            'note' => $note,
        ]);

        $this->forceFill(['points' => $this->points + $delta])->save();
        $this->recalculateTier();

        return $transaction;
    }

    /** Tier follows lifetime spend, not the current point balance. */
    public function recalculateTier(): void
    {
        $tier = match (true) {
            $this->total_spent >= 500000000 => 'gold',    // 5 000 000 so'm
            $this->total_spent >= 100000000 => 'silver',  // 1 000 000 so'm
            default => 'bronze',
        };

        if ($tier !== $this->tier) {
            $this->forceFill(['tier' => $tier])->save();
        }
    }

    // ============ Scopes ============

    /** One of the four the console draws. `inSegment('all')` is not a filter at all. */
    public function scopeInSegment(Builder $query, string $segment): Builder
    {
        return $segment === 'all' || ! in_array($segment, self::SEGMENTS, true)
            ? $query
            : $query->where('segment', $segment);
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }

    /**
     * Guests who owe the restaurant money — the accountant's whole screen.
     *
     * Strictly greater than zero: a guest holding a deposit has a negative
     * balance and is not a debtor, and listing them under "who owes us" is how a
     * collections call gets made to somebody the restaurant owes.
     */
    public function scopeInDebt(Builder $query): Builder
    {
        return $query->where('account_balance', '>', 0);
    }

    /**
     * Guests whose birthday falls today, in the restaurant's own timezone.
     *
     * Compared month-and-day at a time rather than by formatting the column:
     * `extract` reads the stored date directly, so PostgreSQL can answer it from
     * an index on `(tenant_id, birthday)` instead of computing a string for
     * every guest on file. At a million guests that is the difference between a
     * morning marketing job and a table scan.
     */
    public function scopeBirthdayToday(Builder $query): Builder
    {
        $today = now();

        return $query->whereNotNull('birthday')
            ->whereRaw('extract(month from birthday) = ?', [$today->month])
            ->whereRaw('extract(day from birthday) = ?', [$today->day]);
    }

    // ============ Spatie ActivityLog ============

    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            ->logOnly([
                'tenant_id', 'phone', 'name', 'points', 'tier', 'cashback', 'is_active',
                // Both sides of the tab. Raising a limit is the decision an owner
                // asks about after a debt grows, and it has to have a name on it.
                'credit_limit', 'account_balance',
            ])
            ->logOnlyDirty()
            ->dontSubmitEmptyLogs()
            ->useLogName('crm.customer');
    }
}
