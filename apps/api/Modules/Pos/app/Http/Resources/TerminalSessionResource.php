<?php

declare(strict_types=1);

namespace Modules\Pos\Http\Resources;

use App\Support\Settings\Policies;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Modules\Pos\Models\TerminalSession;
use Modules\Pos\Services\ApprovalGate;

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
                /*
                 * The largest discount this person may apply at THIS till without
                 * anyone else agreeing — whole percent, P9's role ladder.
                 *
                 * Sent because the percent picker has to be drawn before anything
                 * is tapped, and the tablet has only two other options: offer every
                 * chip and let half of them come back 403, which teaches a cashier
                 * that the screen lies; or hard-code the ladder, which is a
                 * per-terminal setting and would be wrong at the second venue.
                 *
                 * A ceiling, not a permission. Above it the chip is still offered —
                 * it opens an approval instead of applying one, which is the whole
                 * flow. `0` means every discount goes to a manager, which is what a
                 * waiter's row says.
                 */
                'discount_ceiling' => $this->discountCeiling(),
            ]),

            /*
             * The tip chip the till pre-selects — `policies.tip_default_percent`.
             *
             * Here for the same reason `discount_ceiling` is: the picker has to
             * be drawn before anything is tapped, and a tablet with no answer
             * either offers nothing or hard-codes a number that is wrong at the
             * second restaurant.
             *
             * A SUGGESTION and nothing more. It is deliberately not applied in
             * the ledger — DECISIONS Q6 says a tip is money the guest handed
             * over, never revenue, and a tip that appeared on a bill because of
             * a setting is a charge nobody agreed to. Zero, the default, means
             * the till offers no chip at all.
             */
            'tip_default_percent' => app(Policies::class)->number('tip_default_percent'),

            'terminal' => new TerminalResource($this->whenLoaded('terminal')),
        ];
    }

    /**
     * Read through the gate rather than off the terminal directly.
     *
     * A person can hold more than one role — a manager covering a shift is a
     * `branch-manager` who is also on the rota as a `cashier` — and the answer
     * is the best of them. That resolution is `ApprovalGate::limitFor()`, and it
     * is the same call the gate makes when it decides whether to refuse; a
     * second copy here is how a screen ends up offering a chip the server then
     * refuses.
     */
    private function discountCeiling(): int
    {
        $terminal = $this->resource->terminal;
        $user = $this->resource->user;

        if ($terminal === null || $user === null) {
            return 0;
        }

        return app(ApprovalGate::class)->limitFor($terminal, $user);
    }
}
