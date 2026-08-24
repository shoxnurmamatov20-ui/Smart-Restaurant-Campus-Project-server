<?php

declare(strict_types=1);

namespace Modules\Finance\Events;

use App\Support\Events\DomainEvent;
use Illuminate\Database\Eloquent\Model;
use Modules\Finance\Models\FiscalReceipt;

/**
 * A meal that was sold and never declared.
 *
 * The window closed with the document still queued, so it has stopped being a
 * retry and become a liability: the money was taken, the guest has a receipt
 * with no fiscal sign on it, and the tax authority has no record of any of it.
 *
 * Published loudly and on purpose. Everything else about fiscalisation is
 * designed to stay out of the way — a dead module never blocks a sale — and the
 * price of that freedom is that somebody has to be told when the deferral ran
 * out. A queue that silently accumulated expired declarations would be worse
 * than one that refused sales, because nobody would find out until an audit.
 */
final class FiscalReceiptExpired extends DomainEvent
{
    public function __construct(private readonly FiscalReceipt $receipt) {}

    public function name(): string
    {
        return 'finance.fiscal_receipt_expired';
    }

    /**
     * @return array<string, mixed>
     */
    public function payload(): array
    {
        return [
            'fiscal_receipt_id' => (int) $this->receipt->getKey(),
            'kind' => $this->receipt->kind,
            'order_id' => $this->receipt->order_id,
            'order_number' => $this->receipt->order_number,
            'branch_id' => $this->receipt->branch_id,
            'cash_shift_id' => $this->receipt->cash_shift_id,
            'total' => $this->receipt->total,
            'attempts' => $this->receipt->attempts,
            'last_error' => $this->receipt->last_error,
            'expired_at' => $this->receipt->expires_at?->toIso8601String(),
            'currency' => 'UZS',
        ];
    }

    /** Narrowed from the parent's `?Model`: this event always has its receipt. */
    public function aggregate(): Model
    {
        return $this->receipt;
    }

    public function tenantId(): ?int
    {
        return $this->receipt->tenant_id;
    }
}
