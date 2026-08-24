<?php

declare(strict_types=1);

namespace Modules\Staff\Services;

use App\Models\User;
use App\Support\Tenancy\DatabaseTenancy;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\NewAccessToken;
use Modules\Staff\Models\StaffDevice;

/**
 * The one moment a staff phone has no credentials.
 *
 * A manager opens the employee in the back office and reads eight characters
 * aloud; the waiter types them into their own phone once; the phone walks away
 * with a device token and the code is destroyed. It is the only unauthenticated
 * write this module has, and every choice below follows from that:
 *
 *  - the alphabet drops I, O, 0 and 1, because the code is read across a room;
 *  - only a hash is stored, and the code is long enough that an unsalted hash is
 *    still not worth attacking — it has to be unsalted, because the lookup
 *    happens before anybody knows which restaurant is pairing;
 *  - redemption is one transaction that clears the code, so two people racing on
 *    the same code enrol exactly one phone.
 *
 * Deliberately the same shape as `Modules\Pos\Services\TerminalPairing`, and not
 * shared with it. Two enrolment flows that look alike are two a reader only has
 * to understand once — while the differences that matter stay visible: this one
 * binds to a person rather than a till, and it revokes the person's previous
 * phone rather than the till's previous tablet.
 */
final class DevicePairing
{
    /** No I, O, 0 or 1 — this code gets read out loud and typed on a phone. */
    private const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

    private const CODE_LENGTH = 8;

    private const TTL_MINUTES = 10;

    public function __construct(private readonly DatabaseTenancy $tenancy) {}

    /**
     * Enrol a person's phone, or re-enrol it.
     *
     * The row is created here rather than by a separate "add a device" screen,
     * because a device with no code and no token is a row that means nothing —
     * the act a manager performs is *giving somebody a code*, and this is it.
     *
     * Returned in plain text exactly once; afterwards the server can only check
     * a candidate against it.
     *
     * @return array{device: StaffDevice, code: string}
     */
    public function issueCode(User $employee, string $label, ?string $branchCode = null): array
    {
        $code = $this->generateCode();
        $expiresAt = now()->addMinutes(self::TTL_MINUTES);

        /** @var StaffDevice $device */
        $device = StaffDevice::query()->firstOrNew([
            'user_id' => $employee->getKey(),
        ]);

        $device->forceFill([
            'tenant_id' => $device->tenant_id ?? $employee->tenant_id,
            'user_id' => $employee->getKey(),
            'label' => $label,
            'branch_code' => $branchCode ?? $device->branch_code,
            'pairing_code_hash' => $this->hash($code),
            'pairing_expires_at' => $expiresAt,
            'status' => 'active',
            /*
             * The previous enrolment is voided at the moment a new code is
             * issued, not when it is redeemed.
             *
             * A manager issuing a code is nearly always a manager whose employee
             * has lost a phone. Leaving the old token alive until somebody
             * finishes typing means the lost handset keeps working for as long
             * as the new one takes to arrive — which can be days.
             */
            'paired_at' => null,
            'device_fingerprint' => null,
        ])->save();

        $device->tokens()->delete();

        return ['device' => $device->fresh() ?? $device, 'code' => $code];
    }

    /**
     * Exchange a code for a device token.
     *
     * @return array{device: StaffDevice, token: NewAccessToken}
     *
     * @throws ValidationException when the code is unknown, expired or used
     */
    public function redeem(string $code, string $deviceFingerprint, ?string $appVersion = null): array
    {
        return DB::transaction(fn (): array => $this->tenancy->withoutTenancy(
            fn (): array => $this->redeemAcrossTenants($code, $deviceFingerprint, $appVersion),
        ));
    }

    /**
     * The body of redeem(), running with every restaurant visible.
     *
     * Both belts come off for this one query and for the same reason: a phone
     * holding nothing but eight characters cannot say which restaurant it
     * belongs to, so the code has to be findable before the tenant is known.
     * `withoutGlobalScope('tenant')` takes off Eloquent's; `withoutTenancy()`
     * takes off the database's, which row-level security added — without the
     * second, the policies answer NO ROWS and every pairing attempt refuses a
     * code issued thirty seconds earlier.
     *
     * @return array{device: StaffDevice, token: NewAccessToken}
     *
     * @throws ValidationException
     */
    private function redeemAcrossTenants(string $code, string $deviceFingerprint, ?string $appVersion): array
    {
        /** @var StaffDevice|null $device */
        $device = StaffDevice::query()
            ->withoutGlobalScope('tenant')   // nobody is signed in yet
            ->where('pairing_code_hash', $this->hash($code))
            ->lockForUpdate()
            ->first();

        if ($device === null || $device->pairing_expires_at === null) {
            $this->refuse();
        }

        if ($device->pairing_expires_at->isPast()) {
            $this->refuse('Ulash kodining muddati tugagan. Menejerdan yangi kod so\'rang.');
        }

        if ($device->status !== 'active') {
            $this->refuse('Bu qurilma o\'chirilgan.');
        }

        $device->tokens()->delete();

        $device->forceFill([
            'pairing_code_hash' => null,
            'pairing_expires_at' => null,
            'paired_at' => now(),
            'device_fingerprint' => $deviceFingerprint,
            'app_version' => $appVersion,
            'last_seen_at' => now(),
        ])->save();

        /*
         * A device token, with no ability to do anything but sign somebody in.
         *
         * `staff:device` is deliberately not `staff:operate`. The phone is not a
         * person and holds none of a person's permissions — everything the app
         * does afterwards runs on the user token the PIN exchange issues, which
         * is what carries the waiter's own roles. A device token that could read
         * a rota would be a lost phone that could read a rota.
         */
        $token = $device->createToken(
            name: 'staff-device-'.$device->getKey(),
            abilities: ['staff:device'],
        );

        // Loaded HERE, inside the cross-tenant window. Once this returns the
        // connection is closed again and `public.users` — exempt from RLS, but
        // still behind the Eloquent scope — is resolved without a tenant.
        $device->load('user');

        return ['device' => $device, 'token' => $token];
    }

    /** Deterministic on purpose — see the class docblock. */
    private function hash(string $code): string
    {
        return hash('sha256', mb_strtoupper(trim($code)));
    }

    private function generateCode(): string
    {
        $max = mb_strlen(self::ALPHABET) - 1;
        $code = '';

        for ($i = 0; $i < self::CODE_LENGTH; $i++) {
            $code .= self::ALPHABET[random_int(0, $max)];
        }

        return $code;
    }

    /**
     * One message for "no such code" and "somebody else's restaurant".
     *
     * Telling a caller that a code exists but belongs elsewhere turns this
     * endpoint into an oracle for enumerating other restaurants' staff.
     *
     * @throws ValidationException
     */
    private function refuse(string $message = 'Ulash kodi noto\'g\'ri yoki ishlatib bo\'lingan.'): never
    {
        throw ValidationException::withMessages(['code' => $message]);
    }
}
