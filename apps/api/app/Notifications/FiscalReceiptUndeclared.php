<?php

declare(strict_types=1);

namespace App\Notifications;

/**
 * A meal that was sold and never declared, and the deferral has run out.
 *
 * `finance.fiscal_receipt_expired`. Everything else about fiscalisation on this
 * platform is designed to stay out of the way — a dead OFD never blocks a sale
 * — and the price of that freedom is that somebody has to be told when the
 * window closes with the document still queued. The event's docblock is blunt
 * about the alternative: "a queue that silently accumulated expired
 * declarations would be worse than one that refused sales, because nobody
 * would find out until an audit."
 *
 * `high`, and it stays high after the evening it happened. This is the one
 * notification in the tray that does not get less urgent overnight, which is
 * also the sharpest argument for the design's ordering — severity first, clock
 * second. Sorted newest-first it would be under this morning's rota by Tuesday.
 */
final class FiscalReceiptUndeclared extends ConsoleNotice
{
    public function __construct(
        private readonly string $orderNumber,
        private readonly int $total,
        private readonly int $attempts,
        private readonly ?string $lastError,
        private readonly ?int $branchId,
    ) {}

    protected function key(): string
    {
        return 'fiscal_expired';
    }

    protected function level(): string
    {
        return 'high';
    }

    /**
     * The books, not the till.
     *
     * The till screen belongs to whoever is standing at it, and by the time
     * this fires the window has been open for a day — the person who has to
     * answer for an undeclared sale is the one reading the ledger.
     */
    protected function href(): string
    {
        return '/finance/books';
    }

    protected function branchId(): ?int
    {
        return $this->branchId;
    }

    /** @return array{uz: string, ru: string, en: string} */
    protected function titles(): array
    {
        return [
            'uz' => 'Fiskal chek yuborilmadi',
            'ru' => 'Фискальный чек не отправлен',
            'en' => 'A sale was never declared',
        ];
    }

    /**
     * The order, the money and how hard the queue tried.
     *
     * The attempt count is not diagnostics for its own sake — it is the
     * difference between an OFD that was down all night and a document the
     * driver rejects every time, and those are two different phone calls.
     *
     * @return array{uz: string, ru: string, en: string}
     */
    protected function bodies(): array
    {
        $total = self::som($this->total);
        $error = $this->lastError === null || trim($this->lastError) === ''
            ? ''
            : ' · '.mb_substr(trim($this->lastError), 0, 80);

        return [
            'uz' => "{$this->orderNumber} · {$total} so'm. {$this->attempts} urinish, 24 soatlik oyna yopildi.{$error}",
            'ru' => "{$this->orderNumber} · {$total} сум. Попыток: {$this->attempts}, 24-часовое окно закрыто.{$error}",
            'en' => "{$this->orderNumber} · {$total} so'm. {$this->attempts} attempts, the 24-hour window has closed.{$error}",
        ];
    }
}
