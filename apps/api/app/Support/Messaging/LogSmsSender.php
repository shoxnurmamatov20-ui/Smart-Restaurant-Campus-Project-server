<?php

declare(strict_types=1);

namespace App\Support\Messaging;

use App\Contracts\Messaging\SmsDelivery;
use App\Contracts\Messaging\SmsSender;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * The driver for a laptop and for CI: it writes the message to the log.
 *
 * The whole reason this exists rather than a null driver is the sign-in code.
 * A developer running the customer app has to be able to finish signing in,
 * and the only two ways to do that are to print the code somewhere they can
 * read it or to return it in the HTTP response. The second one is how a
 * debugging affordance ends up shipped: the endpoint's shape stops depending
 * on the driver, `SMS_DRIVER=eskiz` is one environment variable away from
 * being forgotten, and the code that unlocks an account travels back over the
 * wire to whoever asked for it. So it goes to `storage/logs`, which is a file
 * on the machine running the API and reaches nobody else.
 *
 * It is still a real implementation of the contract: it answers accepted, with
 * a reference, so anything that stores the gateway's id has something to store
 * and the shape a caller handles does not change between environments.
 */
final class LogSmsSender implements SmsSender
{
    public function send(string $phone, string $text): SmsDelivery
    {
        $reference = 'log-'.Str::lower(Str::random(12));

        /*
         * The body is logged in full, and only this driver may do that. A
         * one-time code is a credential, and a credential in a log that is
         * shipped to a collector is a credential in a place nobody audits —
         * which is why EskizSmsSender logs the length and never the text.
         */
        Log::channel(config('logging.default'))->info('sms.log_driver', [
            'to' => $phone,
            'text' => $text,
            'reference' => $reference,
        ]);

        return SmsDelivery::accepted($reference);
    }
}
