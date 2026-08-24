<?php

declare(strict_types=1);

namespace Modules\Finance\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Modules\Finance\Models\FiscalReceipt;

/**
 * One declaration, as a cashier and a manager need to read it.
 *
 * Three fields carry the whole story and the rest is detail. `status` says where
 * the document is; `fiscal_sign` is the only thing a guest can actually verify,
 * so a receipt printed without one is a piece of paper; and `expires_at` is the
 * moment the deferral runs out and the queue item becomes a liability.
 *
 * `last_error` is sent rather than hidden behind a generic "failed". The
 * sentences a provider returns — a wrong module number, a total that does not
 * add up — are the ones somebody can act on, and a screen that only said
 * "pending" would leave a venue waiting all evening for a retry that can never
 * succeed.
 *
 * @mixin FiscalReceipt
 */
final class FiscalReceiptResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'cash_shift_id' => $this->cash_shift_id,
            'order_id' => $this->order_id,
            'order_number' => $this->order_number,
            'business_date' => $this->business_date?->toDateString(),
            'kind' => $this->kind,
            'parent_id' => $this->parent_id,
            'status' => $this->status,
            // Whether the guest has something they can check, rather than
            // whether the row reached a terminal state. A cashier asked "is this
            // receipt legal?" is asking this and not about `status`.
            'is_legal' => $this->is_legal,

            // Tiyin, every one of them. 1 so'm = 100 tiyin.
            'total' => $this->total,
            'cash_total' => $this->cash_total,
            'card_total' => $this->card_total,
            'vat_total' => $this->vat_total,

            // ---- How the conversation with the OFD is going ----
            'provider' => $this->provider,
            'attempts' => $this->attempts,
            'last_error' => $this->last_error,
            'next_attempt_at' => $this->next_attempt_at?->toIso8601String(),
            'expires_at' => $this->expires_at?->toIso8601String(),

            // ---- What came back ----
            'fiscal_sign' => $this->fiscal_sign,
            'receipt_seq' => $this->receipt_seq,
            'module_no' => $this->module_no,
            'qr_url' => $this->qr_url,
            'registered_at' => $this->registered_at?->toIso8601String(),

            // How many NUSXA copies have been printed. On the receipt itself so
            // that "this one was printed four times" is answerable at the till
            // rather than only from the audit log.
            'duplicates_printed' => $this->duplicates_printed,

            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
