<?php

declare(strict_types=1);

namespace Modules\Board\Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;
use Modules\Board\Models\BoardBanner;

/**
 * @extends Factory<BoardBanner>
 */
final class BoardBannerFactory extends Factory
{
    protected $model = BoardBanner::class;

    /**
     * Real promo lines, one per kind.
     *
     * @var array<int, array{slug: string, kind: string, uz: string, ru: string, en: string}>
     */
    private const STRIPS = [
        [
            'slug' => 'lavash', 'kind' => 'offer',
            'uz' => 'Ikkinchi lavash 50% chegirma',
            'ru' => 'Второй лаваш −50%',
            'en' => 'Second lavash 50% off',
        ],
        [
            'slug' => 'qaynatma', 'kind' => 'new',
            'uz' => "Yangi: Qaynatma mol go'sht",
            'ru' => 'Новинка: кайнатма из говядины',
            'en' => 'New: beef qaynatma',
        ],
        [
            'slug' => 'birthday', 'kind' => 'loyalty',
            'uz' => "Tug'ilgan kunga 10% chegirma",
            'ru' => '10% скидка в день рождения',
            'en' => '10% off on your birthday',
        ],
    ];

    public function definition(): array
    {
        $strip = $this->faker->randomElement(self::STRIPS);

        return [
            'slug' => $strip['slug'].'-'.Str::lower(Str::random(4)),
            'text' => ['uz' => $strip['uz'], 'ru' => $strip['ru'], 'en' => $strip['en']],
            'kind' => $strip['kind'],
            'starts_at' => null,
            'ends_at' => null,
            'is_live' => false,
        ];
    }

    public function named(string $slug, string $kind, string $uz, string $ru, string $en): static
    {
        return $this->state([
            'slug' => $slug,
            'kind' => $kind,
            'text' => ['uz' => $uz, 'ru' => $ru, 'en' => $en],
        ]);
    }

    /** Switched on. Says nothing about the dates — see BoardBanner::scopeRunning. */
    public function live(): static
    {
        return $this->state(['is_live' => true]);
    }

    public function between(?string $from, ?string $to): static
    {
        return $this->state(['starts_at' => $from, 'ends_at' => $to]);
    }

    /** Already on the wall, as it would be after a push. */
    public function published(): static
    {
        return $this->state(['published_at' => now()]);
    }
}
