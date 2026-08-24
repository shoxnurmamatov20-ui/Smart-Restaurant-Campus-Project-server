<?php

declare(strict_types=1);

namespace Modules\Finance\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Modules\Finance\Models\PaymentInvoice;

/**
 * What a guest is allowed to know about their own payment attempt.
 *
 * The row id is not on the list, and neither is the branch, the cash shift or
 * the payment row it became. This is read by an endpoint with no login on it:
 * everything here is either something the guest already typed or something they
 * are about to see on a bank's own screen.
 *
 * @mixin PaymentInvoice
 */
final class PaymentInvoiceResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            // The opaque token, named `invoice_id` because that is what it is to
            // everybody outside this module. The database id never leaves.
            'invoice_id' => $this->token,
            'provider' => $this->provider,
            'pay_url' => $this->pay_url,
            'amount' => $this->amount,
            'currency' => 'UZS',
            'state' => $this->state,
            'order_number' => $this->order_number,
            'provider_invoice_id' => $this->provider_invoice_id,
            'paid_at' => $this->paid_at?->toIso8601String(),
            'cancelled_at' => $this->cancelled_at?->toIso8601String(),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
