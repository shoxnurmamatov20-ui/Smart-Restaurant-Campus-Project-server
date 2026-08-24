<?php

declare(strict_types=1);

namespace Modules\Staff\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Support\Auth\PinCredentials;
use App\Support\Errors\ApiException;
use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Modules\Staff\Http\Requests\IssueDeviceCodeRequest;
use Modules\Staff\Http\Requests\PairDeviceRequest;
use Modules\Staff\Http\Requests\StaffPinRequest;
use Modules\Staff\Http\Resources\StaffDeviceResource;
use Modules\Staff\Models\StaffDevice;
use Modules\Staff\Services\DevicePairing;

/**
 * Getting a waiter into the staff app on their own phone.
 *
 * Two credentials, in this order and never fewer:
 *
 *   **The device token** says *whose phone this is*. Issued once, at enrolment,
 *   by exchanging an eight-character code a manager read aloud. It can do
 *   exactly one thing — offer a PIN — and holds none of the person's
 *   permissions, so a phone left on a bus is a phone that can sign in as
 *   nobody.
 *
 *   **The PIN** says *they are the one holding it*. Four digits, checked by
 *   `App\Support\Auth\PinCredentials`, which is core because the till asks the
 *   same person for the same secret and the lockout has to be one counter
 *   rather than two.
 *
 * The order matters and is the reason four digits are acceptable at all: the
 * device identifies, so the PIN authenticates one known person rather than being
 * matched against everybody enrolled. `staff/devices/pair` is the only
 * unauthenticated route here; everything after it carries one of the two tokens.
 */
final class StaffAuthController extends Controller
{
    public function __construct(private readonly DevicePairing $pairing) {}

    /**
     * A manager hands an employee a code for their phone.
     *
     * Permissioned at the route (`staff.manage`). The code is returned in plain
     * text exactly once, because the manager has to read it aloud — after this
     * response the server holds only a hash and cannot show it again.
     */
    public function issueCode(IssueDeviceCodeRequest $request): JsonResponse
    {
        /** @var User|null $employee */
        $employee = User::query()->whereKey($request->integer('user_id'))->first();

        /*
         * Someone else's employee and a deleted account get one answer. A
         * manager's tenant is already established by middleware, so a user from
         * another restaurant is not "forbidden" — from here it does not exist,
         * and saying otherwise makes this endpoint a way to probe the platform's
         * user table one id at a time.
         */
        if ($employee === null || $employee->tenant_id !== $request->user()?->tenant_id) {
            throw ApiException::of('staff.employee_unknown', field: 'user_id');
        }

        ['device' => $device, 'code' => $code] = $this->pairing->issueCode(
            employee: $employee,
            label: (string) $request->string('label'),
            branchCode: $request->filled('branch_code') ? (string) $request->string('branch_code') : null,
        );

        return response()->json([
            'code' => $code,
            'expires_at' => $device->pairing_expires_at?->toIso8601String(),
            'data' => (new StaffDeviceResource($device))->resolve($request),
        ], 201);
    }

    /** Exchange a code for a device token. No authentication — see the request. */
    public function pair(PairDeviceRequest $request): JsonResponse
    {
        ['device' => $device, 'token' => $token] = $this->pairing->redeem(
            code: (string) $request->string('code'),
            deviceFingerprint: (string) $request->string('device_fingerprint'),
            appVersion: $request->filled('app_version') ? (string) $request->string('app_version') : null,
        );

        return response()->json([
            'token' => $token->plainTextToken,
            'data' => (new StaffDeviceResource($device))->resolve($request),
            // Sent back as X-Tenant on every later request: a device token is not
            // a user, so ResolveTenant cannot infer the restaurant from it.
            'tenant' => [
                'id' => $device->tenant_id,
                'slug' => $device->tenant?->slug,
            ],
        ], 201);
    }

    /**
     * Four digits from an enrolled phone, exchanged for the person's own token.
     *
     * The endpoint `apps/web/src/app/(staff)/crew/session/route.ts` has been
     * naming in a 501 since the app was built.
     */
    public function pin(StaffPinRequest $request, PinCredentials $pins): JsonResponse
    {
        $device = $this->device($request);

        $checked = $pins->verify((int) $device->user_id, (string) $request->string('pin'));

        if ($checked['status'] === PinCredentials::LOCKED) {
            /*
             * The wait rides in the meta rather than in a sentence: the client
             * holds all three languages and can say "15 daqiqadan keyin" in the
             * reader's own. A hand-written string here reaches a Russian reader
             * in Uzbek.
             */
            throw ApiException::of('staff.pin_locked', field: 'pin', meta: [
                'retry_after_minutes' => $checked['retry_after_minutes'],
            ]);
        }

        if ($checked['status'] !== PinCredentials::OK) {
            $this->refuse();
        }

        /** @var User|null $person */
        $person = User::query()->whereKey($device->user_id)->first();

        if ($person === null || $person->tenant_id !== $device->tenant_id || ! $person->is_active) {
            // The account was deleted, moved restaurants or closed while the
            // phone kept its token. Same answer as a wrong PIN — a keypad must
            // not become a way to ask whether somebody still works here.
            $this->refuse();
        }

        /*
         * Cleared only now.
         *
         * A PIN that was correct but unusable — a deleted account, the wrong
         * restaurant — must not reset the lockout, or an attacker who has
         * guessed the digits can hold the counter at zero forever.
         */
        $credential = $checked['pin'];

        if ($credential !== null) {
            $pins->accept($credential);
        }

        $device->forceFill(['last_seen_at' => now()])->save();

        /*
         * A user token, not the device's.
         *
         * Every permission check downstream runs off `$request->user()`, and a
         * StaffDevice holds no roles. `staff:app` marks where it came from, so a
         * token minted on a phone can be told apart from one minted at a desk if
         * a future rule ever needs to.
         */
        $token = $person->createToken(
            name: 'staff-app-'.$device->getKey(),
            abilities: ['staff:app'],
        );

        return response()->json([
            'token' => $token->plainTextToken,
            'person' => [
                'id' => $person->getKey(),
                'name' => $person->name,
                'roles' => $person->getRoleNames()->values()->all(),
            ],
            'device' => (new StaffDeviceResource($device))->resolve($request),
        ], 201);
    }

    /** Who this phone is signed in as, for a client rehydrating a session. */
    public function session(Request $request): JsonResponse
    {
        /** @var User $person */
        $person = $request->user();

        return response()->json([
            'data' => [
                'id' => $person->getKey(),
                'name' => $person->name,
                'roles' => $person->getRoleNames()->values()->all(),
            ],
        ]);
    }

    /**
     * Which phone this is — asked by the phone itself, before anybody signs in.
     *
     * The sign-in screen prints one line above the keypad: the branch this
     * handset was enrolled against and the name the manager gave it. It used to
     * print a fixture — "Chilonzor filiali · POS-3" — on every phone in the
     * country, which is worse than printing nothing: a waiter in Termiz reads
     * it, believes they are in the wrong back office, and the one check the
     * line exists to offer has become the one lie on the screen.
     *
     * No permission, and it cannot have one: the caller is a device, not a
     * person. It answers only about itself, from its own token, so there is
     * nothing here another restaurant could ask for.
     *
     * @throws ApiException when the caller is not an enrolled device
     */
    public function whoami(Request $request): JsonResponse
    {
        $device = $this->device($request);

        return response()->json([
            'data' => (new StaffDeviceResource($device))->resolve($request),
        ]);
    }

    /**
     * Sign out of the app, keeping the enrolment.
     *
     * Only the user token dies. The device stays paired, because signing out at
     * the end of a shift must not mean finding a manager to re-enrol the phone
     * at the start of the next one — that is what makes people stay signed in.
     */
    public function logout(Request $request): JsonResponse
    {
        /*
         * `PersonalAccessToken` and nothing else can reach here: this route sits
         * behind `auth:sanctum` and the only credential that opens it is the
         * token the PIN issued, so the session guard's `TransientToken` — the
         * one type without a `delete()` — is not reachable. The `method_exists`
         * guard that used to stand here was checking for a method the type
         * system already guarantees, which reads as caution and buys nothing.
         */
        $request->user()?->currentAccessToken()?->delete();

        return response()->json(['data' => ['signed_out' => true]]);
    }

    /**
     * The phone behind this request.
     *
     * @throws ApiException when the principal is anything but an enrolled device
     */
    private function device(Request $request): StaffDevice
    {
        /*
         * `Authenticatable`, not `App\Models\User`.
         *
         * `Request::user()` is annotated as the app's user model, and on this
         * route it is not one: a phone authenticates as itself, so Sanctum
         * resolves the token to a `StaffDevice`. Without the wider annotation
         * static analysis proves the `instanceof` below always false, decides
         * the throw always fires, and calls the return unreachable — three
         * findings that are all the annotation's fault rather than the code's.
         */
        /** @var Authenticatable|null $principal */
        $principal = $request->user();

        if (! $principal instanceof StaffDevice || $principal->status !== 'active') {
            throw ApiException::of('staff.device_required');
        }

        return $principal;
    }

    /**
     * One code for a wrong PIN, an unknown person and somebody else's employee.
     *
     * Three answers would be three ways to ask whether an account exists, from a
     * keypad anybody who has picked up the phone can reach.
     *
     * @throws ApiException
     */
    private function refuse(): never
    {
        throw ApiException::of('staff.pin_invalid', field: 'pin');
    }
}
