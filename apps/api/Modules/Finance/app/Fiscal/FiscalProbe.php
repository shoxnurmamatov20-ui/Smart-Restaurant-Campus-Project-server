<?php

declare(strict_types=1);

namespace Modules\Finance\Fiscal;

/**
 * Whether this restaurant can legally sell right now.
 *
 * The plan's phrasing is worth keeping: a module number of at least eight
 * digits, and _"soliq.uz javob berdi"_. Two separate facts, and a probe that
 * collapsed them into one boolean would hide the difference between a
 * misconfigured till and a government endpoint having a bad morning — which
 * need opposite responses from whoever is reading the screen.
 */
final readonly class FiscalProbe
{
    /**
     * @param bool $reachable Something answered.
     * @param string|null $moduleNo The fiscal module this till files under.
     * @param string $message Human-readable, for the screen. Uzbek: this is read
     *                        by whoever is standing at the till, not by a client
     *                        that would branch on it.
     */
    public function __construct(
        public string $provider,
        public bool $reachable,
        public ?string $moduleNo,
        public string $message,
    ) {}

    /**
     * A module number is at least eight digits.
     *
     * Checked here rather than in configuration validation because a restaurant
     * changes it by editing settings, months after anybody read the docs, and a
     * seven-digit number filed all evening produces receipts the authority
     * cannot match to anybody.
     */
    public function moduleLooksValid(): bool
    {
        return $this->moduleNo !== null
            && preg_match('/^\d{8,}$/', $this->moduleNo) === 1;
    }

    /** Both halves. Either one alone is a restaurant that cannot file. */
    public function isReady(): bool
    {
        return $this->reachable && $this->moduleLooksValid();
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'provider' => $this->provider,
            'reachable' => $this->reachable,
            'module_no' => $this->moduleNo,
            'module_valid' => $this->moduleLooksValid(),
            'ready' => $this->isReady(),
            'message' => $this->message,
        ];
    }
}
