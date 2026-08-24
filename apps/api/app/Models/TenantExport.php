<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * One request for everything this platform holds about one restaurant.
 *
 * The row is the receipt, not the archive — see the migration for why the
 * archive itself is a file on disk with a lifetime. What lives here is the
 * state a console can poll, the two numbers that make "ready" checkable, and
 * the reason when it is not.
 *
 * @property int $id
 * @property int $tenant_id
 * @property int|null $requested_by
 * @property string $state
 * @property string|null $path
 * @property int|null $size_bytes
 * @property int $tables
 * @property int $rows_count
 * @property string|null $error
 * @property Carbon $requested_at
 * @property Carbon|null $completed_at
 * @property Carbon|null $expires_at
 */
final class TenantExport extends Model
{
    use BelongsToTenant;

    /** Waiting for a worker. Nothing has been read yet. */
    public const QUEUED = 'queued';

    /** A worker is walking the tables right now. */
    public const RUNNING = 'running';

    /** The archive exists and can be downloaded until `expires_at`. */
    public const READY = 'ready';

    /** The walk stopped; `error` says where. Ask for a new one. */
    public const FAILED = 'failed';

    /**
     * How long a finished archive — and the link to it — stays alive.
     *
     * Twenty-four hours, and the same number on both halves on purpose: a
     * signed URL that outlives its file answers 404, and a file that outlives
     * its URL is one restaurant's whole history sitting on a disk nobody is
     * watching. One constant, so they cannot drift apart.
     */
    public const LIFETIME_HOURS = 24;

    protected $table = 'public.tenant_exports';

    protected $fillable = [
        'tenant_id', 'requested_by', 'state', 'path', 'size_bytes',
        'tables', 'rows_count', 'error', 'requested_at', 'completed_at', 'expires_at',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'requested_at' => 'datetime',
            'completed_at' => 'datetime',
            'expires_at' => 'datetime',
            'size_bytes' => 'integer',
            'tables' => 'integer',
            'rows_count' => 'integer',
        ];
    }

    public function requester(): BelongsTo
    {
        return $this->belongsTo(User::class, 'requested_by');
    }

    /** Still moving: a second request for the same restaurant would duplicate the walk. */
    public function isRunning(): bool
    {
        return in_array($this->state, [self::QUEUED, self::RUNNING], true);
    }

    /**
     * Downloadable right now.
     *
     * All three halves, because each fails differently: a queued export has no
     * file, an expired one has a file the retention sweep is entitled to have
     * removed, and a `ready` row whose `path` is null is a bug that would
     * otherwise surface as a stream of nothing.
     */
    public function isDownloadable(): bool
    {
        return $this->state === self::READY
            && $this->path !== null
            && ! $this->hasExpired();
    }

    public function hasExpired(): bool
    {
        return $this->expires_at !== null && $this->expires_at->isPast();
    }

    /**
     * Where the archive actually is on this machine.
     *
     * The column keeps a path relative to `storage/app` so the rows survive a
     * move to object storage; resolving it is this one method's job, which is
     * also the one place that has to change when that move happens.
     */
    public function absolutePath(): ?string
    {
        return $this->path === null ? null : storage_path('app/'.$this->path);
    }
}
