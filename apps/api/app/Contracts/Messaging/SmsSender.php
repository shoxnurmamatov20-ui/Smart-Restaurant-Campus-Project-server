<?php

declare(strict_types=1);

namespace App\Contracts\Messaging;

/**
 * Putting a short message on somebody's phone.
 *
 * A core contract rather than a class in whichever module happened to need it
 * first, for the reason every contract in this directory exists: Crm sends a
 * sign-in code today, Orders will send "your courier is downstairs" tomorrow,
 * and Staff will send a shift change after that. Three modules importing one
 * module's gateway client is three edges `ModuleBoundaryTest` would refuse —
 * and, worse, three places that know the vendor's field names.
 *
 * ---------------------------------------------------------------------------
 * What an implementation promises
 *
 * **The number is E.164 and already normalised.** `+998901234567`. Callers
 * hold the digits a person typed; normalising is theirs to do, because only
 * they know what a bare nine-digit string meant.
 *
 * **It never throws for a refusal.** A gateway saying "no balance" or "that
 * number is not in your allowed list" is an answer, and it comes back as
 * {@see SmsDelivery} with `accepted = false` and a reason. Exceptions are for
 * the cases where the code itself is wrong — a driver configured with no
 * credentials, for example, which is a deployment fault and must be loud.
 *
 * **It is synchronous and it is fast, or it is queued by its caller.** Nothing
 * here retries: a resend is a person pressing the button again, and an SMS
 * delivered twice costs money and confuses the reader.
 */
interface SmsSender
{
    /**
     * @param  string  $phone  E.164, e.g. `+998901234567`
     * @param  string  $text  Already in the reader's language
     */
    public function send(string $phone, string $text): SmsDelivery;
}
