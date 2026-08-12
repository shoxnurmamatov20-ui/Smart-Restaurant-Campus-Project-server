<?php

declare(strict_types=1);

namespace Modules\Pos\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Modules\Pos\Models\TerminalSession;

/**
 * @mixin TerminalSession
 */
final class TerminalSessionResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'terminal_id' => $this->terminal_id,
            'user_id' => $this->user_id,
            'cash_shift_id' => $this->cash_shift_id,
            'is_open' => $this->is_open,
            'opened_at' => $this->opened_at?->toIso8601String(),
            'last_activity_at' => $this->last_activity_at?->toIso8601String(),
            'closed_at' => $this->closed_at?->toIso8601String(),
            'closed_reason' => $this->closed_reason,

            'user' => $this->whenLoaded('user', fn (): array => [
                'id' => $this->user->id,
                'name' => $this->user->name,
                'roles' => $this->user->getRoleNames(),
                'permissions' => $this->user->getAllPermissions()
                    ->pluck('name')
                    ->filter(static fn (string $name): bool => str_starts_with($name, 'pos.'))
                    ->values(),
            ]),

            'terminal' => new TerminalResource($this->whenLoaded('terminal')),
        ];
    }
}
