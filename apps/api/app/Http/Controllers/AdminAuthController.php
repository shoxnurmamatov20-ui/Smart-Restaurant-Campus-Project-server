<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Http\Resources\UserResource;
use App\Models\User;
use App\Support\Auth\TwoFactor;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

/**
 * The platform operator's door.
 *
 * Separate from AuthController on purpose. A restaurant's staff sign in to
 * *their* restaurant; whoever signs in here can read every restaurant on the
 * platform, and the design (§3.12, third tab) treats that as a different kind
 * of act: a second factor, a session that expires in thirty minutes, and a
 * notice on the form saying the restaurant owner can see every sign-in.
 *
 * Three things must all hold, and the response never says which one failed.
 * "Wrong code" tells an attacker the password was right, which turns a
 * credential-stuffing run into a list of valid passwords worth phishing a code
 * for.
 */
final class AdminAuthController extends Controller
{
    /**
     * How long a platform session lasts.
     *
     * The design says thirty minutes. Enforced on the token itself rather than
     * left to the client to forget: a console that decides its own expiry is a
     * console an attacker can decide not to expire.
     */
    private const SESSION_MINUTES = 30;

    /** The role that may pass, as RolesAndPermissionsSeeder names it. */
    private const OPERATOR_ROLE = 'super-admin';

    public function __invoke(Request $request, TwoFactor $twoFactor): JsonResponse
    {
        $credentials = $request->validate([
            'email' => ['required', 'string', 'email', 'max:255'],
            'password' => ['required', 'string'],
            'code' => ['required', 'string', 'size:6'],
            'device_name' => ['sometimes', 'string', 'max:64'],
        ]);

        // Platform operators belong to no restaurant — that is what makes them
        // operators. A tenant-bound account with the same address is a
        // different person and must not pass here.
        $user = User::query()
            ->whereNull('tenant_id')
            ->where('email', $credentials['email'])
            ->first();

        $passwordOk = $user !== null && Hash::check($credentials['password'], $user->password);

        // Checked in this order but reported as one failure. The password is
        // verified even when the user is missing, so a request for an unknown
        // address takes the same time as one for a known address — otherwise
        // the response time is an account enumeration oracle.
        if ($user === null) {
            Hash::check($credentials['password'], '$2y$12$'.str_repeat('.', 53));
        }

        $allowed = $passwordOk
            && $user->is_active
            && $user->hasRole(self::OPERATOR_ROLE)
            && $twoFactor->verify($user, $credentials['code']);

        if (! $allowed) {
            throw ValidationException::withMessages([
                'email' => [__('Kirish maʼlumotlari notoʻgʻri.')],
            ]);
        }

        // Every existing token is dropped. A platform session is single-seat by
        // intent: two live tokens means a stolen one keeps working while its
        // owner is still signed in and sees nothing wrong.
        $user->tokens()->delete();

        $token = $user->createToken(
            $credentials['device_name'] ?? 'platform',
            ['*'],
            now()->addMinutes(self::SESSION_MINUTES),
        );

        $user->forceFill(['last_login_at' => now()])->save();

        // Written to the audit log the design promises the restaurant owner can
        // read. `identity.user` is the log name /api/v1/audit filters on.
        activity('identity.user')
            ->performedOn($user)
            ->causedBy($user)
            ->withProperties([
                'ip' => $request->ip(),
                'user_agent' => (string) $request->userAgent(),
            ])
            ->log('platform.signed-in');

        return response()->json([
            'token' => $token->plainTextToken,
            'expires_at' => $token->accessToken->expires_at?->toIso8601String(),
            'user' => new UserResource($user),
        ]);
    }
}
