<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\Branch;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin Branch
 */
final class BranchResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'slug' => $this->slug,
            'code' => $this->code,
            'city' => $this->city,
            'address' => $this->address,
            'phone' => $this->phone,
            'timezone' => $this->timezone,
            'status' => $this->status,
            'opened_at' => $this->opened_at?->toDateString(),
            /*
             * The venue's own overrides — its monthly target, its hours, its
             * service charge. An empty object rather than null so a console can
             * read `settings.target_monthly_tiyin` without a null guard on
             * every branch that has never been configured.
             */
            'settings' => $this->settings ?? [],
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
