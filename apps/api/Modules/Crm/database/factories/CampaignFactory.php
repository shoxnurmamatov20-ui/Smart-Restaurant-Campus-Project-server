<?php

declare(strict_types=1);

namespace Modules\Crm\Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;
use Modules\Crm\Models\Campaign;

/**
 * @extends Factory<Campaign>
 */
final class CampaignFactory extends Factory
{
    protected $model = Campaign::class;

    public function definition(): array
    {
        return [
            'name' => 'Payshanba lavash aksiyasi',
            /*
             * Latin, and short. The alphabet decides the part count and the part
             * count decides the cost, so a factory whose default body was
             * Cyrillic would make every cost assertion in the suite depend on a
             * detail nobody wrote down.
             */
            'body' => 'Salom! Bugun barcha lavashlarga 20% chegirma.',
            'segment' => 'all',
            'status' => 'draft',
            'scheduled_for' => null,
            'estimated_cost_tiyin' => 0,
        ];
    }

    public function scheduled(): static
    {
        return $this->state(['status' => 'scheduled', 'scheduled_for' => now()->addHour()]);
    }

    public function sent(): static
    {
        return $this->state([
            'status' => 'sent',
            'started_at' => now()->subHour(),
            'finished_at' => now()->subMinutes(50),
        ]);
    }

    public function forSegment(string $segment): static
    {
        return $this->state(['segment' => $segment]);
    }
}
