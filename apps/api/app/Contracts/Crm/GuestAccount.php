<?php

declare(strict_types=1);

namespace App\Contracts\Crm;

/**
 * A guest's tab, as the rest of the platform is allowed to see it.
 *
 * Enough to decide whether somebody may sign for a meal, and nothing about how CRM
 * stores a customer. A module holding one of these keeps working when CRM renames
 * a column, and — the part that matters more — a till holding one cannot
 * accidentally write to it.
 *
 * Every figure is tiyin. 1 so'm = 100 tiyin.
 */
final readonly class GuestAccount
{
    /**
     * @param int $creditLimit What the guest may owe at once. 0 means no tab at all.
     * @param int $balance Signed. Positive means the guest owes the restaurant.
     * @param int $available What is left of the ceiling, floored at zero.
     */
    public function __construct(
        public int $customerId,
        public ?string $name,
        public string $phone,
        public bool $isActive,
        public int $creditLimit,
        public int $balance,
        public int $available,
    ) {}

    /**
     * Whether this guest may put anything on a tab at all.
     *
     * Two conditions, and the second is the one that gets forgotten: a customer who
     * has been deactivated keeps whatever limit they were given, and a till reading
     * only the limit would extend credit to somebody the restaurant has stopped
     * doing business with.
     */
    public function canCharge(): bool
    {
        return $this->isActive && $this->creditLimit > 0;
    }

    /** Whether this amount fits under what is left of the ceiling. */
    public function fits(int $amount): bool
    {
        return $amount <= $this->available;
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'customer_id' => $this->customerId,
            'name' => $this->name,
            'phone' => $this->phone,
            'is_active' => $this->isActive,
            'credit_limit' => $this->creditLimit,
            'balance' => $this->balance,
            'available' => $this->available,
            'can_charge' => $this->canCharge(),
        ];
    }
}
