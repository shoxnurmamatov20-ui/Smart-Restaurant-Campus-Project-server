<?php

declare(strict_types=1);

namespace App\Support\Auth;

use App\Models\User;
use App\Models\UserPin;
use Illuminate\Support\Facades\Hash;

/**
 * Checking four digits, and counting the wrong ones.
 *
 * Core rather than the till's, because two surfaces ask the same question of the
 * same person: a cashier tapping their name on a shared tablet, and a waiter
 * signing into the staff app on their own phone. What forced this out of
 * `Modules/Pos` is not tidiness but the lockout — **five wrong tries must
 * exhaust that person's attempts everywhere.** Two counters mean ten guesses
 * instead of five against a four-digit secret, and the phone is the surface
 * somebody can take away with them.
 *
 * ---------------------------------------------------------------------------
 * What this deliberately does not do
 *
 * It does not identify anybody. `verify()` is handed a user id that something
 * else established — a name tapped on a till's roster, a device enrolled to one
 * person — and only says whether the digits match. Letting a PIN identify as
 * well as authenticate means a bcrypt comparison against every enrolled member
 * of staff, which is slow, and worse: with 200 people enrolled, one in fifty
 * random four-digit guesses lands on somebody. Identification narrows the guess
 * space to one person before the counting starts, and that is the whole reason
 * a four-digit secret is defensible at all.
 *
 * It also does not decide what a successful check entitles anyone to. Sessions,
 * tokens and abilities belong to whichever surface asked.
 */
final class PinCredentials
{
    /** Why a check failed, in the vocabulary a caller has to branch on. */
    public const OK = 'ok';

    public const NO_PIN = 'no_pin';

    public const WRONG = 'wrong';

    public const LOCKED = 'locked';

    /**
     * Does this person's PIN match, and what did that attempt cost them?
     *
     * Locks the row for the duration: two tills asking about one person at the
     * same moment must not each read `failed_attempts` as 4 and each write 5,
     * which is how a lockout of five becomes a lockout of ten.
     *
     * The caller is expected to answer a wrong PIN, an unknown person and
     * somebody else's staff member with ONE message. Three answers would make
     * the keypad a way to ask whether a person exists.
     *
     * @return array{status: string, pin: UserPin|null, retry_after_minutes: int|null}
     */
    public function verify(int $userId, string $pin): array
    {
        /** @var UserPin|null $credential */
        $credential = UserPin::query()
            ->where('user_id', $userId)
            ->lockForUpdate()
            ->first();

        if ($credential === null) {
            return ['status' => self::NO_PIN, 'pin' => null, 'retry_after_minutes' => null];
        }

        if ($credential->is_locked) {
            return [
                'status' => self::LOCKED,
                'pin' => $credential,
                /*
                 * Minutes, not a sentence. The client already holds all three
                 * languages and can say "15 daqiqadan keyin" in the reader's own;
                 * a hand-written string here reaches a Russian reader in Uzbek.
                 */
                'retry_after_minutes' => max(
                    1,
                    (int) ceil(now()->diffInMinutes($credential->locked_until, absolute: true)),
                ),
            ];
        }

        if (! Hash::check($pin, $credential->pin_hash)) {
            $this->registerFailure($credential);

            return ['status' => self::WRONG, 'pin' => $credential, 'retry_after_minutes' => null];
        }

        return ['status' => self::OK, 'pin' => $credential, 'retry_after_minutes' => null];
    }

    /**
     * Mark a successful sign-in.
     *
     * Separate from `verify()` because a correct PIN is not always a session:
     * the till still has to check the person belongs to this restaurant and may
     * work a till at all, and clearing the counter before those refusals would
     * hand an attacker a way to reset the lockout with a PIN they had guessed
     * but could not use.
     */
    public function accept(UserPin $credential): void
    {
        $credential->forceFill([
            'failed_attempts' => 0,
            'locked_until' => null,
            'last_used_at' => now(),
        ])->save();
    }

    /**
     * Set or replace someone's PIN.
     *
     * Rotation clears the lockout on purpose: a manager resetting a forgotten
     * PIN should not also have to wait fifteen minutes for the door to reopen.
     */
    public function set(User $user, string $pin): UserPin
    {
        /** @var UserPin $credential */
        $credential = UserPin::query()->firstOrNew(['user_id' => $user->getKey()]);

        $credential->forceFill([
            'tenant_id' => $credential->tenant_id ?? $user->tenant_id,
            'user_id' => $user->getKey(),
            'pin_hash' => Hash::make($pin),
            'failed_attempts' => 0,
            'locked_until' => null,
            'rotated_at' => now(),
        ])->save();

        return $credential;
    }

    /** How many wrong tries are left before the door shuts. */
    public static function maxAttempts(): int
    {
        return max(1, (int) config('auth.pin.max_attempts', 5));
    }

    /** How long it stays shut. */
    public static function lockMinutes(): int
    {
        return max(1, (int) config('auth.pin.lock_minutes', 15));
    }

    private function registerFailure(UserPin $credential): void
    {
        $attempts = $credential->failed_attempts + 1;

        $credential->forceFill([
            'failed_attempts' => $attempts,
            'locked_until' => $attempts >= self::maxAttempts()
                ? now()->addMinutes(self::lockMinutes())
                : null,
        ])->save();
    }
}
