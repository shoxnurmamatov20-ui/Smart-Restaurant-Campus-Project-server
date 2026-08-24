<?php

declare(strict_types=1);

namespace Modules\Crm\Http\Controllers;

use App\Contracts\Messaging\SmsSender;
use App\Http\Controllers\Controller;
use App\Support\Auth\OtpCredentials;
use App\Support\Errors\ApiException;
use App\Support\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Modules\Crm\Http\Requests\RequestOtpRequest;
use Modules\Crm\Http\Requests\VerifyOtpRequest;
use Modules\Crm\Http\Resources\CustomerProfileResource;
use Modules\Crm\Models\Customer;
use Modules\Crm\Services\CustomerIdentity;

/**
 * How a guest signs into the customer app: a phone number, then an SMS code.
 *
 * Never a password, and that is the design's choice as well as the right one
 * for this market — somebody ordering plov at eight in the evening will not
 * invent, remember or reset one, and a password on a food-ordering account is a
 * password reused from somewhere that matters more.
 *
 * Both endpoints were `TODO(api)` in `customer/sign-in/sign-in-board.tsx` and
 * in the mobile app beside it: the screen advanced on any four digits and
 * handed over to a fixture identity. Anybody who typed any number reached the
 * same demo guest.
 *
 * ---------------------------------------------------------------------------
 * The code never travels back over the wire
 *
 * Not in the response, not in development, not behind a flag. The moment the
 * endpoint's shape depends on the environment, `SMS_DRIVER=eskiz` is one
 * forgotten variable away from returning sign-in codes to whoever asks for
 * them. Locally the code is in `storage/logs` — see `LogSmsSender`, which
 * exists for exactly this reason.
 *
 * ---------------------------------------------------------------------------
 * What stops it being a way to spend somebody else's money
 *
 * Every send is a paid SMS. Three limits, and they are three different
 * questions:
 *
 *   **Per number** — one a minute, five an hour, counted in
 *   `OtpCredentials`. This is the one that matters: it is keyed to the thing
 *   being spent on rather than to whoever is asking.
 *
 *   **Per address** — the route's own `throttle`, which catches a script
 *   working through a list of numbers rather than hammering one.
 *
 *   **Per code** — five wrong guesses and the number is shut for fifteen
 *   minutes. Four digits is only defensible with that number under it.
 *
 * ---------------------------------------------------------------------------
 * Why `crm.customers` and not `users`
 *
 * A guest is not an employee. They hold no Spatie role, appear in no roster and
 * belong to a restaurant as a customer — see the note on `Customer`'s
 * `HasApiTokens`. The token they get carries one ability, `customer`, and is
 * read by `RequireCustomerToken` after tenancy has been resolved, because
 * `crm.customers` sits behind row-level security and must stay there.
 */
final class PublicCustomerAuthController extends Controller
{
    /** POST /api/v1/public/auth/otp — send a code to this number. */
    public function request(
        RequestOtpRequest $request,
        OtpCredentials $otps,
        SmsSender $sms,
        TenantContext $tenants,
    ): JsonResponse {
        $phone = Customer::normalisePhone((string) $request->string('phone'));
        $tenantId = $tenants->id();

        $issued = $otps->issue($tenantId, $phone);

        if ($issued === null) {
            /*
             * Already had one recently. 429 with the wait in the meta rather
             * than a sentence: the client holds all three languages and can say
             * "42 soniyadan keyin" in the reader's own, and a hand-written
             * string here reaches a Russian reader in Uzbek.
             */
            throw ApiException::of('crm.otp_too_soon', field: 'phone', meta: [
                'retry_after' => $otps->retryAfter($tenantId, $phone),
            ]);
        }

        $delivery = $sms->send($phone, $this->messageFor($request, $issued['code']));

        if (! $delivery->accepted) {
            /*
             * The gateway would not take it. Said out loud rather than answered
             * 200: a screen that shows "we sent you a code" when nothing was
             * sent leaves a guest waiting for an SMS that is never coming, and
             * pressing "resend" is refused for the next minute by the limit
             * this request just consumed.
             */
            throw ApiException::of('crm.otp_undeliverable', meta: ['reason' => $delivery->reason]);
        }

        return response()->json([
            'data' => [
                'expires_in' => $issued['expires_in'],
                // When the next send is allowed, so the screen can run its
                // countdown against a number the server chose.
                'retry_after' => $otps->retryAfter($tenantId, $phone),
                'code_length' => OtpCredentials::length(),
            ],
        ], 201);
    }

    /** POST /api/v1/public/auth/otp/verify — the code, for a token. */
    public function verify(
        VerifyOtpRequest $request,
        OtpCredentials $otps,
        CustomerIdentity $identity,
        TenantContext $tenants,
    ): JsonResponse {
        $phone = Customer::normalisePhone((string) $request->string('phone'));
        $checked = $otps->verify($tenants->id(), $phone, (string) $request->string('code'));

        if ($checked['status'] === OtpCredentials::LOCKED) {
            throw ApiException::of('crm.otp_locked', field: 'code', meta: [
                'retry_after' => $checked['retry_after_seconds'],
            ]);
        }

        if ($checked['status'] === OtpCredentials::EXPIRED) {
            throw ApiException::of('crm.otp_expired', field: 'code');
        }

        if ($checked['status'] !== OtpCredentials::OK) {
            throw ApiException::of('crm.otp_wrong', field: 'code');
        }

        $locale = $request->filled('locale') ? (string) $request->string('locale') : null;
        $guest = $identity->forPhone($phone, $locale);

        /*
         * A name only if we do not have one.
         *
         * The sign-in screen offers a name field to somebody signing up, and
         * the same request shape is sent by somebody signing back in. Letting
         * it overwrite would mean a guest the restaurant knows as "Dilnoza
         * Aliyeva" becomes whatever was in a phone's autofill this evening.
         */
        if ($guest->name === null && $request->filled('name')) {
            $guest->forceFill(['name' => trim((string) $request->string('name'))])->save();
        }

        if (! $guest->is_active) {
            // A blocked guest passes the code and still gets no token. Refused
            // here rather than in the middleware afterwards so no token exists
            // to be replayed.
            throw ApiException::of('crm.customer_blocked');
        }

        $expiresAt = now()->addDays(max(1, (int) config('auth.otp.token_days', 90)));

        $token = $guest->createToken(
            name: $request->filled('device_name')
                ? (string) $request->string('device_name')
                : 'customer-app',
            abilities: ['customer'],
            expiresAt: $expiresAt,
        );

        return response()->json([
            'token' => $token->plainTextToken,
            'expires_at' => $expiresAt->toIso8601String(),
            'data' => (new CustomerProfileResource($guest->load('addresses')))->resolve($request),
        ], 201);
    }

    /**
     * The SMS itself, in the guest's language.
     *
     * Resolved against the module's own `lang/` files rather than the console
     * catalogue: nothing in a browser is involved, and the language is the
     * guest's rather than the request's — a number that has never signed in has
     * no stored preference, so the request's own locale is the best guess
     * available.
     */
    private function messageFor(RequestOtpRequest $request, string $code): string
    {
        $locale = $request->filled('locale')
            ? (string) $request->string('locale')
            : app()->getLocale();

        return (string) trans('crm::sms.otp', [
            'code' => $code,
            'minutes' => (int) ceil(OtpCredentials::ttlSeconds() / 60),
        ], $locale);
    }
}
