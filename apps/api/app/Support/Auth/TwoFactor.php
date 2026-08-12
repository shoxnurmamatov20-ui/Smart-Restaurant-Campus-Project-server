<?php

declare(strict_types=1);

namespace App\Support\Auth;

use App\Models\User;
use PragmaRX\Google2FA\Google2FA;

/**
 * The six digits on the platform operator's phone.
 *
 * Wraps pragmarx/google2fa with the two things a raw verify does not give you
 * and every real deployment needs: a window that is wide enough for a phone
 * whose clock has drifted, and a refusal to accept the same code twice.
 *
 * Replay is the interesting one. TOTP codes are valid for a whole 30-second
 * step, and with drift tolerance for several of them, so a code read over a
 * shoulder or out of a proxy log works again for up to a minute and a half.
 * Every accepted code's window is written to the user row and a window that has
 * already been spent is refused — which turns "valid for 90 seconds" into
 * "valid once".
 *
 * The window is stored rather than cached because a cache restart must not
 * re-open a code, and because there is exactly one row to write and it is
 * already being written on sign-in.
 */
final class TwoFactor
{
    /**
     * How far either side of now a code is accepted.
     *
     * One step — 30 seconds before and after. Phones drift; airport wifi
     * drifts more. Two would be 150 seconds of validity for a six-digit
     * number, which is generous to the wrong people.
     */
    private const WINDOW = 1;

    public function __construct(private readonly Google2FA $google2fa) {}

    /** A fresh secret, for enrolling someone. */
    public function newSecret(): string
    {
        return $this->google2fa->generateSecretKey();
    }

    /**
     * The `otpauth://` URI an authenticator app scans.
     *
     * The issuer is what the person sees in their app's list, so it names the
     * platform rather than the deployment: someone supporting three
     * environments should still be able to tell which entry is which by the
     * account label, not by guessing.
     */
    public function enrolmentUri(User $user, string $secret, string $issuer): string
    {
        return $this->google2fa->getQRCodeUrl($issuer, $user->email, $secret);
    }

    /**
     * Is this the code on that person's phone, right now, and unused?
     *
     * False for every failure and they are deliberately indistinguishable to
     * the caller: not enrolled, not confirmed, wrong code, and replayed all
     * look the same from outside. A sign-in form that says "that code was
     * already used" tells an attacker they had the right code.
     */
    public function verify(User $user, string $code): bool
    {
        $secret = $user->two_factor_secret;

        if ($secret === null || $user->two_factor_confirmed_at === null) {
            return false;
        }

        // Six digits, nothing else. Passing arbitrary input to the verifier is
        // how a library's own parsing becomes your attack surface.
        if (preg_match('/^[0-9]{6}$/', $code) !== 1) {
            return false;
        }

        /*
         * `verifyKeyNewer` refuses anything at or before the window it is
         * given, which is the replay check itself — the library compares, this
         * class only remembers the answer.
         *
         * Zero rather than null on a first sign-in, and the distinction
         * matters: given null the library returns `true` instead of the window
         * index, and storing `true` writes 1 to the column. Given zero it
         * returns the index, and its starting point is
         * `max($now - $window, 1)`, so nothing scans from the epoch.
         */
        $window = $this->google2fa->verifyKeyNewer(
            $secret,
            $code,
            (int) ($user->two_factor_last_window ?? 0),
            self::WINDOW,
        );

        if ($window === false) {
            return false;
        }

        $user->forceFill(['two_factor_last_window' => $window])->save();

        return true;
    }
}
