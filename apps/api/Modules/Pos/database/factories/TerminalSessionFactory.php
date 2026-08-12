<?php

declare(strict_types=1);

namespace Modules\Pos\Database\Factories;

use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Modules\Pos\Models\Terminal;
use Modules\Pos\Models\TerminalSession;

/**
 * @extends Factory<TerminalSession>
 */
final class TerminalSessionFactory extends Factory
{
    protected $model = TerminalSession::class;

    public function definition(): array
    {
        return [
            'terminal_id' => Terminal::factory(),
            'user_id' => User::factory(),
            'opened_at' => now(),
            'last_activity_at' => now(),
            'ip' => '127.0.0.1',
        ];
    }

    public function closed(string $reason = 'logout'): static
    {
        return $this->state(fn (): array => [
            'closed_at' => now(),
            'closed_reason' => $reason,
        ]);
    }

    public function idle(int $minutes): static
    {
        return $this->state(fn (): array => [
            'last_activity_at' => now()->subMinutes($minutes),
        ]);
    }
}
