<?php

declare(strict_types=1);

namespace App\Notifications;

/**
 * A bill was cancelled at a till. Nothing was sold and nothing was paid.
 *
 * `pos.bill_voided`, and the reason it is worth a bell at all is the approval
 * context the event carries: "who agreed, and were they in the building" is
 * the whole question a fraud review asks. A void a manager signed is a
 * correction. A void nobody signed is the other thing.
 *
 * So this is the one notice in the tray whose colour is decided by its own
 * payload — `high` unsigned, `mid` signed — rather than fixed by kind. That is
 * what the middle level is for: a heads-up you read in the morning, next to a
 * decision you make tonight.
 *
 * It carries no venue, and the reason is worth writing down rather than
 * guessing at: `pos.bill_voided` names a terminal and not a branch, and the
 * core cannot turn one into the other — `pos.terminals` belongs to the till
 * module and a core listener that read it would be the exact import the event
 * bus exists to prevent. The tray draws it as the business until Pos adds
 * `branch_id` to that payload, which is one line in its own module.
 */
final class BillVoidedAtTill extends ConsoleNotice
{
    public function __construct(
        private readonly string $number,
        private readonly int $total,
        private readonly string $reason,
        private readonly bool $approved,
    ) {}

    protected function key(): string
    {
        return 'bill_voided';
    }

    protected function level(): string
    {
        return $this->approved ? 'mid' : 'high';
    }

    protected function href(): string
    {
        return '/analytics/control';
    }

    protected function branchId(): ?int
    {
        return null;
    }

    /** @return array{uz: string, ru: string, en: string} */
    protected function titles(): array
    {
        $total = self::som($this->total);

        return [
            'uz' => "Hisob bekor qilindi: {$total} so'm",
            'ru' => "Счёт аннулирован: {$total} сум",
            'en' => "Bill voided: {$total} so'm",
        ];
    }

    /** @return array{uz: string, ru: string, en: string} */
    protected function bodies(): array
    {
        $reason = trim($this->reason) === '' ? '—' : trim($this->reason);

        return [
            'uz' => $this->approved
                ? "{$this->number} · {$reason}. Menejer tasdig‘i bilan."
                : "{$this->number} · {$reason}. Hech kim tasdiqlamagan.",
            'ru' => $this->approved
                ? "{$this->number} · {$reason}. С подтверждением менеджера."
                : "{$this->number} · {$reason}. Никто не подтверждал.",
            'en' => $this->approved
                ? "{$this->number} · {$reason}. Signed off by a manager."
                : "{$this->number} · {$reason}. Nobody signed it off.",
        ];
    }
}
