<?php

declare(strict_types=1);

namespace Modules\Crm\Models;

use App\Models\Activity;
use App\Models\Concerns\BelongsToTenant;
use App\Models\Concerns\HasTranslations;
use App\Models\Tenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Carbon;
use Modules\Crm\Database\Factories\TriggerFactory;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;

/**
 * A message that sends itself, and the guard that stops it sending twice.
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property string $key
 * @property string $kind birthday|win_back|first_visit|points_expiry
 * @property array<array-key, mixed>|null $name
 * @property array<array-key, mixed>|null $rule_text
 * @property string $body
 * @property int $offset_days
 * @property int $offset_hours
 * @property int $cooldown_days
 * @property int $min_tiyin
 * @property bool $is_active
 * @property Carbon|null $last_run_at
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property Carbon|null $deleted_at
 * @property-read Collection<int, Activity> $activities
 * @property-read int|null $activities_count
 * @property-read Collection<int, TriggerSend> $sends
 * @property-read int|null $sends_count
 * @property-read Tenant|null $tenant
 *
 * @method static \Modules\Crm\Database\Factories\TriggerFactory factory($count = null, $state = [])
 * @method static Builder<static>|Trigger newModelQuery()
 * @method static Builder<static>|Trigger newQuery()
 * @method static Builder<static>|Trigger onlyTrashed()
 * @method static Builder<static>|Trigger query()
 * @method static Builder<static>|Trigger withTrashed(bool $withTrashed = true)
 * @method static Builder<static>|Trigger withoutTrashed()
 *
 * @mixin \Eloquent
 */
final class Trigger extends Model
{
    use BelongsToTenant;

    /** @use HasFactory<TriggerFactory> */
    use HasFactory;

    use HasTranslations;
    use LogsActivity;
    use SoftDeletes;

    protected $table = 'crm.triggers';

    public const KINDS = ['birthday', 'win_back', 'first_visit', 'points_expiry'];

    /** @var array<int, string> */
    protected array $translatable = ['name', 'rule_text'];

    protected $fillable = [
        'tenant_id',
        'key',
        'kind',
        'name',
        'rule_text',
        'body',
        'offset_days',
        'offset_hours',
        'cooldown_days',
        'min_tiyin',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'name' => 'array',
            'rule_text' => 'array',
            'offset_days' => 'integer',
            'offset_hours' => 'integer',
            'cooldown_days' => 'integer',
            'min_tiyin' => 'integer',
            'is_active' => 'boolean',
            'last_run_at' => 'datetime',
        ];
    }

    protected static function newFactory(): TriggerFactory
    {
        return TriggerFactory::new();
    }

    public function sends(): HasMany
    {
        return $this->hasMany(TriggerSend::class);
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }

    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            // The switch itself, and the body. Both are what a guest receives
            // without anybody pressing anything, which is exactly the kind of
            // change that has to have a name against it.
            ->logOnly(['key', 'kind', 'body', 'is_active', 'cooldown_days'])
            ->logOnlyDirty()
            ->dontSubmitEmptyLogs()
            ->useLogName('crm.trigger');
    }
}
