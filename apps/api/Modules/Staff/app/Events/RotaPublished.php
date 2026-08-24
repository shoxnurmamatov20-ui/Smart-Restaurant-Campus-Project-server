<?php

declare(strict_types=1);

namespace Modules\Staff\Events;

use App\Support\Events\DomainEvent;

/**
 * The week stopped being a draft.
 *
 * Published so that whatever notifies people — the Telegram bots today, push
 * on the staff app tomorrow — can do it without Staff knowing either exists.
 * The payload is ids and dates and nothing else: a subscriber that needed the
 * shift rows would be a subscriber reading this module's tables.
 *
 * `staff_member_ids` is what makes it useful. A notifier that had only the date
 * range would have to ask who is on it, which is the query this module has
 * already run — and would ask it again, later, against a rota somebody may have
 * edited in between.
 */
final class RotaPublished extends DomainEvent
{
    /**
     * @param  list<int>  $staffMemberIds  everybody who appears on the published week
     */
    public function __construct(
        private readonly string $from,
        private readonly string $to,
        private readonly int $shiftCount,
        private readonly array $staffMemberIds,
        private readonly ?int $branchId = null,
    ) {}

    public function name(): string
    {
        return 'staff.rota_published';
    }

    /**
     * @return array<string, mixed>
     */
    public function payload(): array
    {
        return [
            'from' => $this->from,
            'to' => $this->to,
            'branch_id' => $this->branchId,
            'shift_count' => $this->shiftCount,
            'staff_member_ids' => $this->staffMemberIds,
        ];
    }
}
