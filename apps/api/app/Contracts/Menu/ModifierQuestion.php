<?php

declare(strict_types=1);

namespace App\Contracts\Menu;

/**
 * A question asked about a dish, with the rules for answering it.
 *
 * The rules travel with the question rather than being left to the client,
 * because two clients left to decide whether two sauces are allowed will decide
 * differently — and the till, the QR menu and the aggregator are three clients.
 * The server enforces them again on the way in; these are so a screen can grey
 * out the sixth checkbox instead of letting somebody tap it and be refused.
 */
final readonly class ModifierQuestion
{
    /**
     * @param  array<int, ModifierChoice>  $choices
     */
    public function __construct(
        public int $id,
        public string $title,
        public bool $isMulti,
        public int $minChoices,
        public int $maxChoices,
        public array $choices,
    ) {}

    /** @return array<string, mixed> */
    public function toArray(): array
    {
        return [
            'id' => $this->id,
            'title' => $this->title,
            'is_multi' => $this->isMulti,
            'min_choices' => $this->minChoices,
            'max_choices' => $this->maxChoices,
            'choices' => array_map(
                static fn (ModifierChoice $choice): array => $choice->toArray(),
                $this->choices,
            ),
        ];
    }
}
