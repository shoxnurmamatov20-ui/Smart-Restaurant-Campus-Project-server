<?php

declare(strict_types=1);

namespace Modules\Pos\Services;

use App\Models\User;
use App\Models\UserPin;
use App\Support\Auth\PinCredentials;
use App\Support\Errors\ApiException;
use Illuminate\Support\Facades\DB;
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
    /*
     * The digits themselves are core's business.
     *
     * `PinCredentials` owns the hash, the counter and the fifteen-minute door;
     * this class owns what a correct PIN entitles somebody to at a till — a
     * session, on this terminal, taking over whoever was signed in. The split
     * exists because the staff app asks the same person for the same four
     * digits on their own phone, and the lockout has to be one counter rather
     * than two.
     */
    public function __construct(private readonly PinCredentials $pins) {}

    /**
     * @return array{session: TerminalSession, token: string}
     *
     * @throws ApiException
     */
    public function attempt(Terminal $terminal, int $userId, string $pin, ?string $ip = null): array
    {
        $checked = $this->pins->verify($userId, $pin);

        if ($checked['status'] === PinCredentials::LOCKED) {
            /*
             * A catalogue code, not a sentence.
             *
             * This threw a ValidationException carrying one hand-written Uzbek
             * string — so a Russian or English reader got Uzbek, and no client
             * could tell "wrong PIN" from "locked out" without matching on the
             * words. Both are what the one envelope exists to prevent.
             *
             * The wait rides in the meta rather than being interpolated into
             * the sentence: the client already has the three languages and can
             * say "15 daqiqadan keyin" in the reader's own.
             */
            throw ApiException::of('pos.pin_locked', field: 'pin', meta: [
                'retry_after_minutes' => $checked['retry_after_minutes'],
            ]);
        }

        if ($checked['status'] !== PinCredentials::OK) {
            // A wrong PIN and a person with no PIN at all get the same answer:
            // the keypad must not become a way to ask who is enrolled.
            $this->refuse();
        }

        /** @var UserPin $credential */
        $credential = $checked['pin'];

        /** @var User|null $user */
        $user = User::query()->whereKey($userId)->first();

        if ($user === null || $user->tenant_id !== $terminal->tenant_id) {
            // Someone else's staff member, or a deleted account. Same message as
            // a wrong PIN — the till must not become a way to probe the roster.
            $this->refuse();
        }

        if (! $user->can('pos.sell') && ! $user->can('pos.approve')) {
            throw ApiException::of('pos.pin_no_till_permission', field: 'pin');
        }

        return DB::transaction(function () use ($terminal, $user, $credential, $ip): array {
            // One person per till. Anyone already here is taken over.
            TerminalSession::query()
                ->open()
                ->onTerminal((int) $terminal->getKey())
                ->get()
                ->each(static fn (TerminalSession $previous) => $previous->close('takeover'));

            // Cleared only now, after the person has been checked against this
            // restaurant and against `pos.sell` — a PIN that was right but
            // unusable must not reset somebody's lockout.
            $this->pins->accept($credential);

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
     * Four digits checked, and nothing opened.
     *
     * The manager standing at somebody else's till. `attempt()` above cannot
     * serve them: it opens a session, and opening a session on this terminal
     * closes the cashier's — the waiter would be signed out by the very act of
     * getting their void approved, mid-service, in front of the guest.
     *
     * So this verifies and returns. The caller keeps its own session, the
     * approval row records the manager's name, and `method` stays `pin` because
     * somebody genuinely typed one on a till.
     *
     * `pos.approve` rather than `pos.sell`: the question here is not "may this
     * person work a till" — it is "may this person authorise". A cashier's own
     * PIN must not clear a cashier's own request, and `approval_self` upstream
     * only catches the case where they are the same row.
     *
     * @throws ApiException
     */
    public function verifyApprover(Terminal $terminal, int $userId, string $pin): User
    {
        $checked = $this->pins->verify($userId, $pin);

        if ($checked['status'] === PinCredentials::LOCKED) {
            throw ApiException::of('pos.pin_locked', field: 'pin', meta: [
                'retry_after_minutes' => $checked['retry_after_minutes'],
            ]);
        }

        if ($checked['status'] !== PinCredentials::OK) {
            $this->refuse();
        }

        /** @var UserPin $credential */
        $credential = $checked['pin'];

        /** @var User|null $user */
        $user = User::query()->whereKey($userId)->first();

        if ($user === null || $user->tenant_id !== $terminal->tenant_id) {
            // Same answer as a wrong PIN. A keypad that distinguishes "not your
            // restaurant" from "wrong digits" is a keypad that enumerates staff.
            $this->refuse();
        }

        if (! $user->can('pos.approve')) {
            throw ApiException::of('pos.approval_no_permission', field: 'user_id');
        }

        // Cleared only now, after the person has been checked against this
        // restaurant and against the permission — a PIN that was right but
        // powerless must not reset somebody's lockout counter.
        $this->pins->accept($credential);

        return $user;
    }

    /**
     * Set or replace someone's PIN.
     *
     * Rotation clears the lockout on purpose: a manager resetting a forgotten
     * PIN should not also have to wait fifteen minutes for the door to reopen.
     */
    public function setPin(User $user, string $pin): UserPin
    {
        return $this->pins->set($user, $pin);
    }

    /**
     * @throws ApiException
     */
    private function refuse(): never
    {
        // One code for a wrong PIN, an unknown person and somebody else's
        // staff member. The till must not become a way to probe the roster,
        // and three codes would be three answers to "does this person exist".
        throw ApiException::of('pos.pin_invalid', field: 'pin');
    }
}
