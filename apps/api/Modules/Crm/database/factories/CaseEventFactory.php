<?php

declare(strict_types=1);

namespace Modules\Crm\Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;
use Modules\Crm\Models\CaseEvent;

/**
 * @extends Factory<CaseEvent>
 */
final class CaseEventFactory extends Factory
{
    protected $model = CaseEvent::class;

    public function definition(): array
    {
        return ['kind' => 'note', 'from_value' => null, 'to_value' => null, 'note' => 'Mijoz bilan gaplashildi.'];
    }
}
