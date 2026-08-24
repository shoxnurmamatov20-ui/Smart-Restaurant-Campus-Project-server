<?php

declare(strict_types=1);

namespace Modules\Kitchen\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Modules\Kitchen\Models\Printer;

/**
 * @mixin Printer
 */
final class PrinterResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'branch_id' => $this->branch_id,
            'code' => $this->code,
            'name' => $this->name,
            'role' => $this->role,
            'connection' => $this->connection,
            'target' => $this->target,
            'columns' => $this->columns,
            'codepage' => $this->codepage,
            'cuts' => $this->cuts,
            'opens_drawer' => $this->opens_drawer,
            'copies' => $this->copies,
            'is_active' => $this->is_active,
            'is_default' => $this->is_default,
            /*
             * Liveness travels with the device, not only on the health endpoint.
             * A printer list that showed only names and addresses would make the
             * configuration screen the one place in the console where you cannot
             * tell whether the thing you are editing is plugged in.
             */
            'state' => $this->state,
            'last_seen_at' => $this->last_seen_at?->toIso8601String(),
            'failing_since' => $this->failing_since?->toIso8601String(),
            'last_error' => $this->last_error,
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
