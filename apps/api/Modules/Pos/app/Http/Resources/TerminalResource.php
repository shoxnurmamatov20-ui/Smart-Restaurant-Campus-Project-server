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

            /*
             * The branch's NAME, not just its id.
             *
             * Every screen that lists a till writes it as "POS-3 · Chilonzor" —
             * the design's terminal-health table, the receipt footer, the idle
             * screen's identity line. An id forces each of them into a second
             * request or a lookup table of its own, and a client-side lookup
             * table of branch names is a client-side copy of the org chart.
             *
             * `whenLoaded`, so listing forty tills does not become forty-one
             * queries. The controller eager-loads it; a caller who did not gets
             * the id alone rather than a silent N+1.
             */
            'branch' => $this->whenLoaded('branch', fn (): ?array => $this->branch === null ? null : [
                'id' => $this->branch->id,
                'name' => $this->branch->name,
                'slug' => $this->branch->slug,
            ]),

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
