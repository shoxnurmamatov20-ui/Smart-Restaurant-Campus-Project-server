<?php

declare(strict_types=1);

namespace Modules\Marketplace\Services;

use Modules\Marketplace\Models\Consumer;

/**
 * Turning a phone number into the account it belongs to.
 *
 * One line of logic, and it is here rather than in the controller because it is
 * the point where a stranger becomes an account and that is worth being able to
 * find. `firstOrCreate` on the normalised number: signing up and signing back
 * in are the same request on this platform, because a phone that has never
 * ordered before and one that ordered last week both arrive holding six digits
 * from an SMS.
 *
 * Tenant-free, like the model. A number that has ordered from four restaurants
 * gets one account, which is the whole marketplace proposition — see
 * {@see Consumer} for why that is not the same decision `crm.customers` made.
 */
final readonly class ConsumerIdentity
{
    /**
     * The account behind this number, creating it if this is the first time.
     *
     * The locale is only ever set on creation. Overwriting it on every sign-in
     * would mean a Russian-speaking guest who opens the app on a borrowed
     * Uzbek phone loses their language, and the profile screen is where a person
     * changes it deliberately.
     */
    public function forPhone(string $phone, ?string $locale = null): Consumer
    {
        /*
         * `is_active` is stated rather than left to the column default, and the
         * bug it fixes is a quiet one: `firstOrCreate` returns a model holding
         * only the attributes it was given, so a freshly created account had no
         * `is_active` in memory at all — `null`, cast to `false`, and the very
         * next line refused the sign-in of the account it had just opened.
         * Every first-time customer was told they were blocked.
         */
        $consumer = Consumer::query()->firstOrCreate(
            ['phone' => Consumer::normalisePhone($phone)],
            ['locale' => $locale ?? 'uz', 'is_active' => true, 'points' => 0],
        );

        $consumer->forceFill(['last_seen_at' => now()])->save();

        return $consumer;
    }
}
