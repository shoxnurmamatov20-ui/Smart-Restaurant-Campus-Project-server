<?php

declare(strict_types=1);

namespace Modules\Board\Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;
use Modules\Board\Models\BoardScreen;

/**
 * @extends Factory<BoardScreen>
 */
final class BoardScreenFactory extends Factory
{
    protected $model = BoardScreen::class;

    /**
     * Screens a real counter rotates, so a demo board looks like a restaurant.
     *
     * @var array<int, array{slug: string, uz: string, ru: string, en: string, seconds: int}>
     */
    private const SCREENS = [
        ['slug' => 'main', 'uz' => 'Asosiy menyu', 'ru' => 'Основное меню', 'en' => 'Main menu', 'seconds' => 20],
        ['slug' => 'today', 'uz' => 'Kunlik taklif', 'ru' => 'Предложение дня', 'en' => "Today's offer", 'seconds' => 8],
        ['slug' => 'combo', 'uz' => 'Kombo takliflar', 'ru' => 'Комбо-предложения', 'en' => 'Combo deals', 'seconds' => 12],
    ];

    public function definition(): array
    {
        $screen = $this->faker->randomElement(self::SCREENS);

        return [
            'slug' => $screen['slug'].'-'.Str::lower(Str::random(4)),
            'name' => ['uz' => $screen['uz'], 'ru' => $screen['ru'], 'en' => $screen['en']],
            'seconds' => $screen['seconds'],
            'window_start' => null,
            'window_end' => null,
            'is_active' => true,
            'position' => 0,
        ];
    }

    /** A named screen with a stable slug — for seeders, where the slug matters. */
    public function named(string $slug, string $uz, string $ru, string $en): static
    {
        return $this->state([
            'slug' => $slug,
            'name' => ['uz' => $uz, 'ru' => $ru, 'en' => $en],
        ]);
    }

    /** Joins the rotation and holds for this long. */
    public function rotating(int $seconds, int $position = 0): static
    {
        return $this->state([
            'seconds' => $seconds,
            'window_start' => null,
            'window_end' => null,
            'position' => $position,
        ]);
    }

    /**
     * Replaces the rotation between these hours and takes no turn.
     *
     * `seconds` goes to null in the same call rather than being left to the
     * caller: the check constraint refuses a row that is both, and a factory
     * state that could produce one would fail at insert with a database error
     * rather than at the line that made the mistake.
     */
    public function scheduled(string $from, string $to, int $position = 0): static
    {
        return $this->state([
            'seconds' => null,
            'window_start' => $from,
            'window_end' => $to,
            'position' => $position,
        ]);
    }

    public function inactive(): static
    {
        return $this->state(['is_active' => false]);
    }

    /** Already on the wall, as it would be after a push. */
    public function published(): static
    {
        return $this->state(['published_at' => now()]);
    }
}
