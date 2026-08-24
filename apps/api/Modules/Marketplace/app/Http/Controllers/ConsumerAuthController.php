<?php

declare(strict_types=1);

namespace Modules\Marketplace\Http\Controllers;

use App\Contracts\Messaging\SmsSender;
use App\Http\Controllers\Controller;
use App\Support\Auth\OtpCredentials;
use App\Support\Errors\ApiException;
use Illuminate\Http\JsonResponse;
use Modules\Marketplace\Http\Requests\RequestConsumerOtpRequest;
use Modules\Marketplace\Http\Requests\VerifyConsumerOtpRequest;
use Modules\Marketplace\Http\Resources\ConsumerResource;
use Modules\Marketplace\Models\Consumer;
use Modules\Marketplace\Services\ConsumerIdentity;

/**
 * Signing into the marketplace: a phone number, then a code.
 *
 * ---------------------------------------------------------------------------
 * The counter is the platform's, and that was already decided
 *
 * `App\Support\Auth\OtpCredentials` says so in its own docblock: it is core
 * rather than CRM's precisely because "the moment a second surface wants to
 * sign somebody in by phone — the marketplace, a courier app — a second counter
 * would double every attacker's budget". This is that second surface, and it
 * uses that counter.
 *
 * It is called with a null tenant, which is what makes the budget shared rather
 * than doubled. A number that has just burned five guesses signing into a
 * restaurant's own app is a number that is locked here too — the same phone,
 * the same person, one budget. Passing a tenant would have given an attacker a
 * fresh five for every restaurant on the platform plus five more for the
 * marketplace.
 *
 * ---------------------------------------------------------------------------
 * The code never travels back over the wire
 *
 * Not in the response, not in development, not behind a flag — the same rule
 * CRM's door follows and for the same reason: the moment the shape of the
 * response depends on the environment, one forgotten variable is the difference
 * between a sign-in and an oracle. Locally it is in `storage/logs`, which is
 * what `LogSmsSender` exists for.
 */
final class ConsumerAuthController extends Controller
{
    /** POST /api/v1/mp/auth/otp — send a code to this number. */
    public function request(
        RequestConsumerOtpRequest $request,
        OtpCredentials $otps,
        SmsSender $sms,
    ): JsonResponse {
        $phone = Consumer::normalisePhone((string) $request->string('phone'));

        // Null tenant — the marketplace is nobody's restaurant. See the docblock.
        $issued = $otps->issue(null, $phone);

        if ($issued === null) {
            /*
             * 429 with the wait in the meta rather than a sentence: the client
             * holds all three languages and can count down in the reader's own,
             * and a string written here reaches a Russian reader in Uzbek.
             */
            throw ApiException::of('marketplace.otp_too_soon', field: 'phone', meta: [
                'retry_after' => $otps->retryAfter(null, $phone),
            ]);
        }

        $delivery = $sms->send($phone, $this->messageFor($request, $issued['code']));

        if (! $delivery->accepted) {
            /*
             * Said out loud rather than answered 200. A screen that says "we
             * sent you a code" when nothing was sent leaves somebody waiting for
             * an SMS that is not coming — and "resend" is refused for the next
             * minute by the limit this request just spent.
             */
            throw ApiException::of('marketplace.otp_undeliverable', meta: ['reason' => $delivery->reason]);
        }

        return response()->json([
            'data' => [
                'expires_in' => $issued['expires_in'],
                'retry_after' => $otps->retryAfter(null, $phone),
                'code_length' => OtpCredentials::length(),
            ],
        ], 201);
    }

    /** POST /api/v1/mp/auth/otp/verify — the code, for a token. */
    public function verify(
        VerifyConsumerOtpRequest $request,
        OtpCredentials $otps,
        ConsumerIdentity $identity,
    ): JsonResponse {
        $phone = Consumer::normalisePhone((string) $request->string('phone'));
        $checked = $otps->verify(null, $phone, (string) $request->string('code'));

        if ($checked['status'] === OtpCredentials::LOCKED) {
            throw ApiException::of('marketplace.otp_locked', field: 'code', meta: [
                'retry_after' => $checked['retry_after_seconds'],
            ]);
        }

        if ($checked['status'] === OtpCredentials::EXPIRED) {
            throw ApiException::of('marketplace.otp_expired', field: 'code');
        }

        if ($checked['status'] !== OtpCredentials::OK) {
            throw ApiException::of('marketplace.otp_wrong', field: 'code');
        }

        $consumer = $identity->forPhone($phone, $request->filled('locale') ? (string) $request->string('locale') : null);

        /*
         * A name only if we do not have one.
         *
         * The same request shape is sent by somebody signing up and somebody
         * signing back in. Letting it overwrite means a customer the couriers
         * know as "Nilufar" becomes whatever was in a phone's autofill tonight.
         */
        if ($consumer->name === null && $request->filled('name')) {
            $consumer->forceFill(['name' => trim((string) $request->string('name'))])->save();
        }

        if (! $consumer->is_active) {
            // Refused here rather than by the middleware afterwards, so no
            // token exists to be replayed.
            throw ApiException::of('marketplace.consumer_blocked');
        }

        $expiresAt = now()->addDays(max(1, (int) config('auth.otp.token_days', 90)));

        $token = $consumer->createToken(
            name: $request->filled('device_name') ? (string) $request->string('device_name') : 'mypos-app',
            abilities: [Consumer::ABILITY],
            expiresAt: $expiresAt,
        );

        return response()->json([
            'token' => $token->plainTextToken,
            'expires_at' => $expiresAt->toIso8601String(),
            'data' => (new ConsumerResource($consumer->load('addresses')))->resolve($request),
        ], 201);
    }

    /**
     * The SMS itself, in the reader's language.
     *
     * From this module's own `lang/` files. A number that has never signed in
     * has no stored preference, so the request's locale is the best guess
     * there is.
     */
    private function messageFor(RequestConsumerOtpRequest $request, string $code): string
    {
        $locale = $request->filled('locale') ? (string) $request->string('locale') : app()->getLocale();

        return (string) trans('marketplace::sms.otp', [
            'code' => $code,
            'minutes' => (int) ceil(OtpCredentials::ttlSeconds() / 60),
        ], $locale);
    }
}
