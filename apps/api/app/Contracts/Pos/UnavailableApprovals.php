<?php

declare(strict_types=1);

namespace App\Contracts\Pos;

use RuntimeException;

/**
 * What the platform does when Pos is switched off.
 *
 * Reads answer "nobody is waiting"; writes refuse loudly. `requiredFor()` is the
 * interesting one and it answers **false**, which looks like the unsafe
 * direction and is not: with no till module there is no approval ledger, so a
 * true would refuse every discount on the platform forever with no way for
 * anybody to sign one off. A restaurant running no POS has a manager clicking a
 * button in the back office, and their permission is the guard.
 */
final class UnavailableApprovals implements Approvals
{
    public function requiredFor(int $userId, string $action, int $amountTiyin = 0, int $subtotalTiyin = 0): bool
    {
        return false;
    }

    public function ask(
        int $requestedByUserId,
        string $action,
        string $reason,
        ?string $subjectType = null,
        ?int $subjectId = null,
        int $amountTiyin = 0,
        ?int $branchId = null,
    ): PendingApproval {
        throw new RuntimeException('Kassa moduli o\'chirilgan — tasdiq so\'rab bo\'lmaydi.');
    }

    /**
     * @return array<int, PendingApproval>
     */
    public function waiting(?int $branchId = null, int $limit = 50): array
    {
        return [];
    }

    public function spend(
        int $approvalId,
        string $action,
        ?string $subjectType = null,
        ?int $subjectId = null,
        int $amountTiyin = 0,
    ): void {
        throw new RuntimeException('Kassa moduli o\'chirilgan — tasdiqni ishlatib bo\'lmaydi.');
    }

    public function decide(int $approvalId, int $byUserId, bool $granted): PendingApproval
    {
        throw new RuntimeException('Kassa moduli o\'chirilgan — tasdiqni hal qilib bo\'lmaydi.');
    }
}
