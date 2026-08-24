<?php

declare(strict_types=1);

namespace Modules\Crm\Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;
use Modules\Crm\Models\TriggerSend;

/**
 * @extends Factory<TriggerSend>
 */
final class TriggerSendFactory extends Factory
{
    protected $model = TriggerSend::class;

    public function definition(): array
    {
        return ['converted' => false, 'converted_at' => null];
    }

    public function converted(): static
    {
        return $this->state(['converted' => true, 'converted_at' => now()]);
    }
}
