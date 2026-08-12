<?php

declare(strict_types=1);

namespace Modules\Pos\Database\Factories;

use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Modules\Pos\Models\DrawerMovement;
use Modules\Pos\Models\Terminal;
use Modules\Pos\Models\TerminalSession;

/**
 * @extends Factory<DrawerMovement>
 */
final class DrawerMovementFactory extends Factory
{
    protected $model = DrawerMovement::class;

    public function definition(): array
    {
        return [
            'terminal_id' => Terminal::factory(),
            'session_id' => TerminalSession::factory(),
            'user_id' => User::factory(),
            'cash_shift_id' => 1,
            'kind' => 'cash_in',
            'amount' => 10_000_000,
            'direction' => 'in',
            'reason' => 'Maydalash uchun',
            'occurred_at' => now(),
        ];
    }

    public function collection(int $amount = 50_000_000): static
    {
        return $this->state(fn (): array => [
            'kind' => 'collection',
            'direction' => 'out',
            'amount' => $amount,
            'reason' => 'Inkassatsiya',
        ]);
    }
}
