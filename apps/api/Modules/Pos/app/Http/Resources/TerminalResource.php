<?php

declare(strict_types=1);

namespace Modules\Pos\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Modules\Pos\Models\Terminal;

/**
 * @mixin Terminal
 */
final class TerminalResource extends JsonResource
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
            'mode' => $this->mode,
            'status' => $this->status,

            // Whether a device is attached, and whether it is answering — never
            // the pairing code, and never the hash.
            'is_paired' => $this->is_paired,
            'is_online' => $this->is_online,
            'paired_at' => $this->paired_at?->toIso8601String(),
            'last_seen_at' => $this->last_seen_at?->toIso8601String(),
            'app_version' => $this->app_version,

            'pos_layout_id' => $this->pos_layout_id,
            'settings' => $this->settings,

            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
