<?php

declare(strict_types=1);

namespace Modules\Finance\Http\Resources;

use App\Support\Finance\AcquirerFees;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Modules\Finance\Models\PaymentMethod;

/**
 * @mixin PaymentMethod
 */
final class PaymentMethodResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'method' => $this->method,
            'name' => $this->name,
            'title' => $this->translate('name'),
            'kind' => $this->kind,
            'is_fiscal' => $this->is_fiscal,
            'fee_bps' => $this->fee_bps,
            /*
             * What the bank will actually keep, negotiated rate or platform
             * default, resolved here rather than left to the reader.
             *
             * `fee_bps` alone cannot be drawn on a screen: null means "no
             * negotiated rate", and a settings panel showing a dash where 1.2%
             * is being charged is the reason an owner would never notice the
             * card fee. Both are published — the raw column so a client can tell
             * a negotiated zero from an inherited one, and the effective figure
             * so it has something to print.
             */
            'effective_fee_bps' => $this->fee_bps ?? AcquirerFees::bps($this->method),
            'gateway' => $this->gateway,
            'is_enabled' => $this->is_enabled,
            'position' => $this->position,
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
