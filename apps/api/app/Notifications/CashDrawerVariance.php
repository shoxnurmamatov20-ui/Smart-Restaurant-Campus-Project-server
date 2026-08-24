<?php

declare(strict_types=1);

namespace App\Notifications;

/**
 * A drawer did not balance, and the console says so before the month does.
 *
 * `finance.shift_variance_flagged` is published from the last rung of the
 * closing ladder — below it a difference is explained, and past the middle rung
 * authorised, both of which happen inside the restaurant. This one leaves it,
 * and the event's own docblock says why: "the difference between one bad night
 * and a habit is whether anybody noticed the first one."
 *
 * `high`, always. The design reserves that colour for a decision today, and a
 * count that is out is exactly that: the cashier is still in the building
 * tonight and will not be tomorrow.
 *
 * The sign is carried into the title rather than flattened into "out by". Short
 * is money gone; over is usually a sale that was taken and never rung up, and
 * an owner reading the two the same way is an owner who investigates half of
 * what they should.
 */
final class CashDrawerVariance extends ConsoleNotice
{
    public function __construct(
        private readonly string $shiftNumber,
        private readonly int $difference,
        private readonly int $expected,
        private readonly int $counted,
        private readonly ?string $reason,
        private readonly ?int $branchId,
    ) {}

    protected function key(): string
    {
        return 'cash_variance';
    }

    protected function level(): string
    {
        return 'high';
    }

    protected function href(): string
    {
        return '/analytics/control';
    }

    protected function branchId(): ?int
    {
        return $this->branchId;
    }

    /** @return array{uz: string, ru: string, en: string} */
    protected function titles(): array
    {
        $amount = self::signedSom($this->difference);

        return [
            'uz' => "Kassa farqi: {$amount} so'm",
            'ru' => "Расхождение в кассе: {$amount} сум",
            'en' => "Till variance: {$amount} so'm",
        ];
    }

    /**
     * The two figures the difference came from, and the reason if one was
     * typed.
     *
     * Both numbers rather than just the gap: "short by 32 000" on a 4 000 000
     * shift and on a 90 000 shift are different evenings, and the reader
     * decides which by seeing what was expected.
     *
     * @return array{uz: string, ru: string, en: string}
     */
    protected function bodies(): array
    {
        $expected = self::som($this->expected);
        $counted = self::som($this->counted);
        $reason = $this->reason === null || trim($this->reason) === '' ? '' : ' · '.trim($this->reason);

        return [
            'uz' => "{$this->shiftNumber}-smena. Kutilgan {$expected}, sanalgan {$counted}.{$reason}",
            'ru' => "Смена {$this->shiftNumber}. Ожидалось {$expected}, посчитано {$counted}.{$reason}",
            'en' => "Shift {$this->shiftNumber}. Expected {$expected}, counted {$counted}.{$reason}",
        ];
    }
}
