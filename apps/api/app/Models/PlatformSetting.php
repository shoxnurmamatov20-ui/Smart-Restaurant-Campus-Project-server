<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

/**
 * One of the four switches the platform operator owns.
 *
 * A table rather than config because they change while the process is running:
 * `maintenance` gets flipped during an incident, and a config file would need a
 * deploy to say the platform is down.
 *
 * @property string $key
 * @property mixed $value
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 *
 * @method static Builder<static>|PlatformSetting newModelQuery()
 * @method static Builder<static>|PlatformSetting newQuery()
 * @method static Builder<static>|PlatformSetting query()
 *
 * @mixin \Eloquent
 */
#[Fillable(['key', 'value'])]
final class PlatformSetting extends Model
{
    /** Key, kind, and what it means. The console draws a switch or a number. */
    public const KINDS = [
        'signups' => 'toggle',
        'trialDays' => 'number',
        'impersonation' => 'toggle',
        'maintenance' => 'toggle',
    ];

    protected $table = 'public.platform_settings';

    protected $primaryKey = 'key';

    protected $keyType = 'string';

    public $incrementing = false;

    protected function casts(): array
    {
        return [
            // jsonb, so a boolean stays a boolean and a number stays a number.
            // The console's `value` is `boolean | number` and casting both to
            // string would make the switch permanently on.
            'value' => 'json',
        ];
    }
}
