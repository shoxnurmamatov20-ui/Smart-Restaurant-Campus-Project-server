<?php

declare(strict_types=1);

namespace Modules\Pos\Services;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;
use Modules\Pos\Models\PosPin;
use Modules\Pos\Models\Terminal;
use Modules\Pos\Models\TerminalSession;

/**
 * Turning four digits into a session at a specific till.
 *
 * The flow deliberately identifies the person first and authenticates second:
 * the till shows a grid of staff, someone taps their own name, then types the
 * PIN. The alternative — type a PIN and let the server work out who you are —
 * would mean a bcrypt comparison against every enrolled member of staff on
 * every attempt, which is both slow and a much larger guessing surface.
 *
 * Opening a session closes whatever session was already on that terminal. Two
 * people are never signed in at one till, so "who did this" always has exactly
 * one answer.
 */
final class PinAuthenticator
{
    /**
     * @return array{session: TerminalSession, token: string}
     *
     * @throws ValidationException
     */
    public function attempt(Terminal $terminal, int $userId, string $pin, ?string $ip = null): array
    {
        /** @var PosPin|null $credential */
        $credential = PosPin::query()
            ->where('user_id', $userId)
            ->lockForUpdate()
            ->first();

        if ($credential === null) {
            $this->refuse();
        }

        if ($credential->is_locked) {
            throw ValidationException::withMessages([
                'pin' => sprintf(
                    'Juda ko\'p noto\'g\'ri urinish. %d daqiqadan keyin qayta urinib ko\'ring.',
                    max(1, (int) ceil(now()->diffInMinutes($credential->locked_until, absolute: true))),
                ),
            ]);
        }

        if (! Hash::check($pin, $credential->pin_hash)) {
            $this->registerFailure($credential);
            $this->refuse();
        }

        /** @var User|null $user */
        $user = User::query()->whereKey($userId)->first();

        if ($user === null || $user->tenant_id !== $terminal->tenant_id) {
            // Someone else's staff member, or a deleted account. Same message as
            // a wrong PIN — the till must not become a way to probe the roster.
            $this->refuse();
        }

        if (! $user->can('pos.sell') && ! $user->can('pos.approve')) {
            throw ValidationException::withMessages([
                'pin' => 'Sizda kassada ishlash huquqi yo\'q.',
            ]);
        }

        return DB::transaction(function () use ($terminal, $user, $credential, $ip): array {
            // One person per till. Anyone already here is taken over.
            TerminalSession::query()
                ->open()
                ->onTerminal((int) $terminal->getKey())
                ->get()
                ->each(static fn (TerminalSession $previous) => $previous->close('takeover'));

            $credential->forceFill([
                'failed_attempts' => 0,
                'locked_until' => null,
                'last_used_at' => now(),
            ])->save();

            $session = TerminalSession::create([
                'terminal_id' => $terminal->getKey(),
                'user_id' => $user->getKey(),
                'opened_at' => now(),
                'last_activity_at' => now(),
                'ip' => $ip,
            ]);

            // A user token, not a device token: every permission check in the
            // module runs off `$request->user()`, and a Terminal holds no roles.
            $token = $user->createToken(
                name: 'pos-session-'.$session->getKey(),
                abilities: ['pos:operate'],
            );

            $session->forceFill(['access_token_id' => $token->accessToken->getKey()])->save();

            return ['session' => $session->fresh(), 'token' => $token->plainTextToken];
        });
    }

    /**
     * Set or replace someone's PIN.
     *
     * Rotation clears the lockout on purpose: a manager resetting a forgotten
     * PIN should not also have to wait fifteen minutes for the door to reopen.
     */
    public function setPin(User $user, string $pin): PosPin
    {
        /** @var PosPin $credential */
        $credential = PosPin::query()->firstOrNew(['user_id' => $user->getKey()]);

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

    private function registerFailure(PosPin $credential): void
    {
        $attempts = $credential->failed_attempts + 1;
        $max = (int) config('pos.pin.max_attempts', 5);

        $credential->forceFill([
            'failed_attempts' => $attempts,
            'locked_until' => $attempts >= $max
                ? now()->addMinutes((int) config('pos.pin.lock_minutes', 15))
                : null,
        ])->save();
    }

    /**
     * @throws ValidationException
     */
    private function refuse(): never
    {
        throw ValidationException::withMessages(['pin' => 'PIN noto\'g\'ri.']);
    }
}
