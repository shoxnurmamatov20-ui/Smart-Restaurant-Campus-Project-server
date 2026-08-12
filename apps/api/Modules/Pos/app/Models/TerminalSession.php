<?php

declare(strict_types=1);

namespace Modules\Pos\Models;

use App\Models\Concerns\BelongsToTenant;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Modules\Pos\Database\Factories\TerminalSessionFactory;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;

/**
 * Who is standing at which till, and since when.
 *
 * This is the audit spine of the module. Every sale, void, discount, drawer
 * movement and printed receipt carries a session id, which is how a question
 * like "who rang up this bill on the bar till at 23:40" has one answer instead
 * of a guess. A shared tablet with only a device token could not answer it at
 * all.
 *
 * A session dies four ways, and the reason is recorded because they mean very
 * different things: `logout` is normal, `timeout` means the till was left
 * unattended, `takeover` means somebody else logged in over the top, and
 * `shift_close` means the money was counted.
 *
 * @method static TerminalSessionFactory factory(int $count = null, array $state = [])
 */
final class TerminalSession extends Model
{
    /** @use HasFactory<TerminalSessionFactory> */
    use BelongsToTenant;

    use HasFactory;
    use LogsActivity;

    protected $table = 'pos.terminal_sessions';

    public const CLOSE_REASONS = ['logout', 'timeout', 'takeover', 'shift_close'];

    protected $fillable = [
        'tenant_id',
        'terminal_id',
        'user_id',
        'cash_shift_id',
        'access_token_id',
        'opened_at',
        'last_activity_at',
        'closed_at',
        'closed_reason',
        'ip',
    ];

    protected function casts(): array
    {
        return [
            'opened_at' => 'datetime',
            'last_activity_at' => 'datetime',
            'closed_at' => 'datetime',
            'terminal_id' => 'integer',
            'user_id' => 'integer',
            'cash_shift_id' => 'integer',
            'access_token_id' => 'integer',
        ];
    }

    protected static function newFactory(): TerminalSessionFactory
    {
        return TerminalSessionFactory::new();
    }

    // ============ Relationships ============

    public function terminal(): BelongsTo
    {
        return $this->belongsTo(Terminal::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    // ============ Accessors ============

    protected function isOpen(): Attribute
    {
        return Attribute::get(fn (): bool => $this->closed_at === null);
    }

    // ============ Domain behaviour ============

    /**
     * Close the session and revoke the token minted for it.
     *
     * Deleting the token is the part that matters: a session row marked closed
     * while its bearer token still works is a logout that did not log anybody
     * out.
     */
    public function close(string $reason): bool
    {
        if ($this->closed_at !== null) {
            return false;
        }

        if ($this->access_token_id !== null) {
            $this->user?->tokens()->whereKey($this->access_token_id)->delete();
        }

        return $this->update([
            'closed_at' => now(),
            'closed_reason' => in_array($reason, self::CLOSE_REASONS, true) ? $reason : 'logout',
        ]);
    }

    public function touchActivity(): void
    {
        $this->forceFill(['last_activity_at' => now()])->saveQuietly();
    }

    public function hasExpired(int $idleMinutes): bool
    {
        return $this->last_activity_at !== null
            && $this->last_activity_at->addMinutes($idleMinutes)->isPast();
    }

    // ============ Scopes ============

    public function scopeOpen(Builder $query): Builder
    {
        return $query->whereNull('closed_at');
    }

    public function scopeOnTerminal(Builder $query, int $terminalId): Builder
    {
        return $query->where('terminal_id', $terminalId);
    }

    // ============ Spatie ActivityLog ============

    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            ->logOnly(['tenant_id', 'terminal_id', 'user_id', 'cash_shift_id', 'opened_at', 'closed_at', 'closed_reason'])
            ->logOnlyDirty()
            ->dontSubmitEmptyLogs()
            ->useLogName('pos.session');
    }
}
