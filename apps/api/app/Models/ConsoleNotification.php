<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Notifications\DatabaseNotification;
use Illuminate\Support\Carbon;

/**
 * The read side of `public.notifications`.
 *
 * A subclass rather than a second table, and rather than reading through
 * `DatabaseNotification` directly, for two reasons that both cost something
 * when they are missing:
 *
 *  - **`BelongsToTenant`.** The framework's model knows nothing about
 *    restaurants, so every read through it would have to remember the WHERE.
 *    Row-level security would still refuse a cross-tenant row, but "refused by
 *    PostgreSQL" arrives as an empty page rather than as a bug report, and the
 *    scope is the belt that names the mistake at the query.
 *  - **`branch()`.** The tray's third line is the venue, and a resource that
 *    resolved it with `Branch::find()` would be one query per row in a list
 *    whose whole purpose is to be read in a glance.
 *
 * Writes still go through Laravel's own model — `$user->notify()` reaches the
 * `notifications()` morphMany, which is hard-coded to `DatabaseNotification` —
 * so the two share a table on purpose. Nothing here may change the shape of a
 * row, only how it is read.
 *
 * @property string $id
 * @property string $type
 * @property string $notifiable_type
 * @property int $notifiable_id
 * @property array<string, mixed> $data
 * @property Carbon|null $read_at
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property int|null $tenant_id
 * @property int|null $branch_id
 * @property string $key
 * @property string $level
 * @property-read Branch|null $branch
 * @property-read Tenant|null $tenant
 */
final class ConsoleNotification extends DatabaseNotification
{
    use BelongsToTenant;

    /** @return BelongsTo<Branch, $this> */
    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }
}
