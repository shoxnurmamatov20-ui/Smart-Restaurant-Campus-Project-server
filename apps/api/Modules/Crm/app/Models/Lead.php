<?php

declare(strict_types=1);

namespace Modules\Crm\Models;

use App\Models\Activity;
use App\Models\Concerns\BelongsToTenant;
use App\Models\Tenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Carbon;
use Modules\Crm\Database\Factories\LeadFactory;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;

/**
 * Somebody who filled in the contact form and expects a call back.
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property string $name
 * @property string $phone
 * @property string|null $email
 * @property string|null $restaurant
 * @property string|null $city
 * @property string|null $message
 * @property string $source
 * @property string $status
 * @property int|null $assigned_to_user_id
 * @property Carbon|null $contacted_at
 * @property string|null $note
 * @property Carbon $captured_on
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property Carbon|null $deleted_at
 * @property-read Collection<int, Activity> $activities
 * @property-read int|null $activities_count
 * @property-read Tenant|null $tenant
 *
 * @method static \Modules\Crm\Database\Factories\LeadFactory factory($count = null, $state = [])
 * @method static Builder<static>|Lead newModelQuery()
 * @method static Builder<static>|Lead newQuery()
 * @method static Builder<static>|Lead onlyTrashed()
 * @method static Builder<static>|Lead open()
 * @method static Builder<static>|Lead query()
 * @method static Builder<static>|Lead withTrashed(bool $withTrashed = true)
 * @method static Builder<static>|Lead withoutTrashed()
 *
 * @mixin \Eloquent
 */
final class Lead extends Model
{
    use BelongsToTenant;

    /** @use HasFactory<LeadFactory> */
    use HasFactory;

    use LogsActivity;
    use SoftDeletes;

    protected $table = 'crm.leads';

    public const STATUSES = ['new', 'contacted', 'qualified', 'won', 'lost'];

    public const SOURCES = ['site', 'telegram', 'call', 'referral'];

    protected $fillable = [
        'tenant_id',
        'name',
        'phone',
        'email',
        'restaurant',
        'city',
        'message',
        'source',
        'status',
        'assigned_to_user_id',
        'contacted_at',
        'note',
        'captured_on',
    ];

    protected function casts(): array
    {
        return [
            'contacted_at' => 'datetime',
            'captured_on' => 'date',
        ];
    }

    protected static function newFactory(): LeadFactory
    {
        return LeadFactory::new();
    }

    /** Still worth a phone call: nobody has won or lost it yet. */
    public function scopeOpen(Builder $query): Builder
    {
        return $query->whereIn('status', ['new', 'contacted', 'qualified']);
    }

    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            // The message is not logged: it is whatever a stranger typed, it can
            // be long, and the activity log is read by people who want to know
            // who moved the lead and when — not to re-read the enquiry.
            ->logOnly(['status', 'assigned_to_user_id', 'contacted_at'])
            ->logOnlyDirty()
            ->dontSubmitEmptyLogs()
            ->useLogName('crm.lead');
    }
}
