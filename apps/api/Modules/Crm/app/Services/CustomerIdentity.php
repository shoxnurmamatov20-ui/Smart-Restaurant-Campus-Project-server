<?php

declare(strict_types=1);

namespace Modules\Crm\Services;

use Illuminate\Database\QueryException;
use Modules\Crm\Models\Customer;

/**
 * One phone number, one guest — the only identity rule this platform has.
 *
 * START-HERE §4 makes `phone_e164` the identity key, and the whole loyalty
 * model rests on it: a guest who orders through the app on Monday and gives
 * their number at the till on Friday must land on one balance. Every surface
 * that signs somebody in goes through here so that "find or create by phone"
 * is written once and normalises the number the same way each time.
 *
 * ---------------------------------------------------------------------------
 * Three things that look like edge cases and are not
 *
 * **The race.** Two taps on "send code", both codes typed, both verified
 * within a second of each other. `firstOrCreate` reads then writes, and the
 * unique index on `(tenant_id, phone)` refuses the second write — so the
 * insert is caught and the row re-read rather than surfacing as a 500 on a
 * sign-in screen.
 *
 * **The guest who was deleted.** `crm.customers` is soft-deleted and the
 * unique index is not partial, so a returning guest cannot simply be inserted
 * — and should not be: their loyalty history, their addresses and their tab
 * are all still hanging off that id. They are restored, which is what "the
 * same guest came back" means.
 *
 * **The guest who was blocked.** `is_active = false` is left exactly as it is.
 * Signing in does not un-block anybody; the middleware refuses them afterwards
 * with `crm.customer_blocked`, and a restaurant that switched a guest off has
 * to switch them back on themselves.
 */
final class CustomerIdentity
{
    /**
     * The guest behind this number, creating the row if this is their first time.
     *
     * @param  string  $phone  Already normalised — {@see Customer::normalisePhone()}
     */
    public function forPhone(string $phone, ?string $locale = null): Customer
    {
        $existing = $this->find($phone);

        if ($existing !== null) {
            return $this->revive($existing, $locale);
        }

        try {
            return Customer::query()->create([
                'phone' => $phone,
                'locale' => $locale,
                'is_active' => true,
            ]);
        } catch (QueryException $collision) {
            /*
             * Somebody else inserted the same number between the read and the
             * write. The index did its job; re-read rather than fail, because
             * from the guest's side both taps asked for the same thing.
             */
            $raced = $this->find($phone);

            if ($raced === null) {
                throw $collision;
            }

            return $this->revive($raced, $locale);
        }
    }

    private function find(string $phone): ?Customer
    {
        return Customer::withTrashed()->where('phone', $phone)->first();
    }

    private function revive(Customer $guest, ?string $locale): Customer
    {
        if ($guest->trashed()) {
            $guest->restore();
        }

        // Their language is theirs, so it is only filled in when we have never
        // been told: the app sends whatever the phone is set to on every
        // sign-in, and letting that overwrite a deliberate choice on the
        // profile screen would undo it every time they signed in again.
        if ($locale !== null && $guest->locale === null) {
            $guest->forceFill(['locale' => $locale])->save();
        }

        return $guest;
    }
}
