<?php

declare(strict_types=1);

namespace Modules\Kitchen\Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;
use Modules\Kitchen\Models\Printer;
use Modules\Kitchen\Models\PrintJob;
use Modules\Kitchen\Printing\Document;

/**
 * @extends Factory<PrintJob>
 */
final class PrintJobFactory extends Factory
{
    protected $model = PrintJob::class;

    public function definition(): array
    {
        return [
            'printer_id' => Printer::factory(),
            'kind' => 'docket',
            'reference' => 'ticket:'.$this->faker->numberBetween(1, 9999),
            'title' => 'A-'.$this->faker->numberBetween(1000, 9999),
            'document' => (new Document(48))->centre('SINOV')->cut()->toArray(),
            'copies' => 1,
            'status' => 'queued',
            'attempts' => 0,
            'available_at' => now(),
            // Null by default: most tests want two jobs to coexist, and a shared
            // fingerprint would have the second one refused by the unique index
            // for reasons that have nothing to do with what is being tested.
            'fingerprint' => null,
        ];
    }

    public function claimed(string $by = 'agent-1'): self
    {
        return $this->state(fn (): array => [
            'status' => 'claimed',
            'claimed_at' => now(),
            'claimed_by' => $by,
        ]);
    }

    /** Claimed by an agent that then died — the case the claim expiry exists for. */
    public function abandoned(): self
    {
        return $this->state(fn (): array => [
            'status' => 'claimed',
            'claimed_at' => now()->subMinutes(10),
            'claimed_by' => 'agent-that-died',
        ]);
    }

    public function printed(): self
    {
        return $this->state(fn (): array => ['status' => 'printed', 'printed_at' => now()]);
    }

    public function failed(): self
    {
        return $this->state(fn (): array => [
            'status' => 'failed',
            'attempts' => PrintJob::maxAttempts(),
            'last_error' => 'Printer javob bermadi',
        ]);
    }

    /** Waiting out a backoff — queued, but not yet due. */
    public function backedOff(): self
    {
        return $this->state(fn (): array => [
            'status' => 'queued',
            'attempts' => 2,
            'available_at' => now()->addMinutes(5),
            'last_error' => 'Printer javob bermadi',
        ]);
    }
}
