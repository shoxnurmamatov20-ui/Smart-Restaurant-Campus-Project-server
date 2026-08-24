<?php

declare(strict_types=1);

namespace App\Contracts\Pos;

use Illuminate\Support\Carbon;

/**
 * One line of a manager's queue, as anything outside Pos may see it.
 *
 * Deliberately not the Eloquent model and not `PosApprovalResource` either. The
 * resource is Pos's own wire format and may change with the till's screens; this
 * is the shape another module builds a decision on, and the two have different
 * reasons to change.
 *
 * Money is tiyin. Times are carried as Carbon rather than strings, because the
 * consumer is a controller that will format them for a locale it knows and this
 * one does not.
 */
final readonly class PendingApproval
{
    /**
     * @param  string  $action  void_line|void_order|discount|comp|refund|…
     * @param  string|null  $subjectType  bill|line|payment|drawer|shift
     * @param  int  $amountTiyin  What is at stake. Zero when the request named no figure.
     */
    public function __construct(
        public int $id,
        public string $action,
        public ?string $subjectType,
        public ?int $subjectId,
        public int $amountTiyin,
        public string $reason,
        public int $requestedByUserId,
        public ?string $requestedByName,
        public string $status,
        public Carbon $requestedAt,
        public ?Carbon $expiresAt,
        public ?int $branchId,
        /** Which till it came from, when one did. Null means a phone raised it. */
        public ?int $terminalId,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'id' => $this->id,
            'action' => $this->action,
            'subject_type' => $this->subjectType,
            'subject_id' => $this->subjectId,
            'amount' => $this->amountTiyin,
            'reason' => $this->reason,
            'requested_by' => [
                'id' => $this->requestedByUserId,
                'name' => $this->requestedByName,
            ],
            'status' => $this->status,
            'requested_at' => $this->requestedAt->toIso8601String(),
            'expires_at' => $this->expiresAt?->toIso8601String(),
            'branch_id' => $this->branchId,
            'terminal_id' => $this->terminalId,
        ];
    }
}
