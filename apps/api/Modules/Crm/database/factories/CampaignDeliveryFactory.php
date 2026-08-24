<?php

declare(strict_types=1);

namespace Modules\Crm\Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;
use Modules\Crm\Models\CampaignDelivery;

/**
 * @extends Factory<CampaignDelivery>
 */
final class CampaignDeliveryFactory extends Factory
{
    protected $model = CampaignDelivery::class;

    public function definition(): array
    {
        return [
            'phone' => '+998901234567',
            'status' => 'queued',
            'parts' => 1,
            'cost_tiyin' => 5500,
        ];
    }

    public function sent(): static
    {
        return $this->state(['status' => 'sent', 'reference' => 'log-test', 'sent_at' => now()]);
    }

    public function failed(string $reason = 'no_balance'): static
    {
        // Cost goes to zero with the refusal, matching what the job writes: a
        // message the gateway never sent is a message nobody was billed for.
        return $this->state(['status' => 'failed', 'reason' => $reason, 'cost_tiyin' => 0]);
    }
}
