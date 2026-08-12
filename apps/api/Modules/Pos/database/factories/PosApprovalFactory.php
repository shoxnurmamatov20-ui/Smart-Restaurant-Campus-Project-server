<?php

declare(strict_types=1);

namespace Modules\Pos\Database\Factories;

use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Modules\Pos\Models\PosApproval;
use Modules\Pos\Models\Terminal;
use Modules\Pos\Models\TerminalSession;

/**
 * @extends Factory<PosApproval>
 */
final class PosApprovalFactory extends Factory
{
    protected $model = PosApproval::class;

    public function definition(): array
    {
        return [
            'terminal_id' => Terminal::factory(),
            'session_id' => TerminalSession::factory(),
            'action' => 'void_line',
            'subject_type' => 'line',
            'subject_id' => 1,
            'amount' => 4_500_000,
            'reason' => 'Mehmon fikridan qaytdi',
            'requested_by_user_id' => User::factory(),
            'status' => 'pending',
            'requested_at' => now(),
            'expires_at' => now()->addMinutes(5),
        ];
    }

    public function approvedBy(User $manager): static
    {
        return $this->state(fn (): array => [
            'status' => 'approved',
            'approved_by_user_id' => $manager->id,
            'method' => 'pin',
            'decided_at' => now(),
        ]);
    }

    public function expired(): static
    {
        return $this->state(fn (): array => ['expires_at' => now()->subMinute()]);
    }

    public function used(): static
    {
        return $this->state(fn (): array => ['status' => 'used', 'used_at' => now()]);
    }
}
