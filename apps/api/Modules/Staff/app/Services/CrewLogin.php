<?php

declare(strict_types=1);

namespace Modules\Staff\Services;

use App\Models\User;
use App\Support\Auth\PinCredentials;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Modules\Staff\Models\StaffDevice;
use Modules\Staff\Models\StaffMember;

/**
 * The login behind a staff record.
 *
 * A staff member is an HR row — a name, a position, an hourly rate. The crew
 * app signs in *somebody*, and somebody is a `User` with a role and a PIN. For
 * a long time the two tables were never joined: hiring wrote the HR row and
 * nothing else, so a new waiter had no account, which meant no pairing code,
 * which meant the phone they had just installed the app on could not get past
 * its first field. This is the join, in both directions.
 *
 * **A PIN, not a password.** The crew app's door is a paired phone and four
 * digits; the password behind the account is random and never shown, because
 * nobody types it anywhere. A position that also needs the desk — a manager —
 * still gets only the PIN from here: a console password wants a real mailbox
 * and a reset mail, and the mail driver is one of the nine keys in
 * `docs/GO-LIVE.md`.
 *
 * **The address is a placeholder, and says so.** `users.email` is unique and
 * not null, and a hire rarely has one to give. `EMP-0007@staff.osh-xona.invalid`
 * is what goes in: `.invalid` is the TLD the RFC reserves for addresses that
 * must never resolve, so no mail can ever leave for it and no reader can
 * mistake it for a real one. A real address, when there is one, replaces it.
 *
 * **Closing is the part that matters.** A waiter let go whose account stayed
 * open still holds a working token on the phone in their pocket. `close()`
 * deactivates the account *and* revokes every token and every paired device —
 * `is_active` alone only guards the password door, not a session that already
 * exists.
 */
final class CrewLogin
{
    /** `StaffMember::POSITIONS` → the Spatie role that position works as. */
    private const ROLE_FOR_POSITION = [
        'waiter' => 'waiter',
        'cook' => 'cook',
        'chef' => 'chef',
        'cashier' => 'cashier',
        'bartender' => 'bartender',
        'host' => 'host',
        'courier' => 'courier',
        'storekeeper' => 'storekeeper',
        'manager' => 'branch-manager',
        'accountant' => 'accountant',
        'operator' => 'order-operator',
    ];

    /**
     * The positions whose work is the console, and who therefore need a
     * password as well as a PIN. A waiter never types one; an accountant
     * never types anything else.
     */
    public const DESK_POSITIONS = ['manager', 'accountant', 'operator'];

    public function __construct(private readonly PinCredentials $pins) {}

    /**
     * Open an account for a member who has none, or rotate the PIN of one who
     * has. Either way the PIN comes back exactly once.
     *
     * @return array{user: User, pin: string, created: bool}
     */
    public function open(StaffMember $member): array
    {
        return DB::transaction(function () use ($member): array {
            $pin = $this->generatePin();
            $created = false;

            /** @var User|null $user */
            $user = $member->user_id === null ? null : User::query()->whereKey($member->user_id)->first();

            if ($user === null) {
                $user = User::query()->create([
                    'tenant_id' => $member->tenant_id,
                    'name' => $member->full_name,
                    'email' => $this->placeholderEmail($member),
                    'phone' => $member->phone,
                    // Random and unknown to everyone, including the manager: the
                    // crew app never asks for it and the console door is not
                    // this person's. 32 characters of entropy rather than a word.
                    'password' => Str::password(32),
                    'is_active' => true,
                    'email_verified_at' => now(),
                ]);

                $member->forceFill(['user_id' => $user->getKey()])->save();
                $created = true;
            }

            /*
             * The role follows the position, and is re-synced rather than only
             * assigned: a member promoted from cook to chef through `PATCH
             * members` gets the chef's permissions the next time a manager
             * rotates their PIN, instead of keeping the cook's forever.
             */
            $user->syncRoles([self::ROLE_FOR_POSITION[$member->position] ?? 'waiter']);

            if (! $user->is_active) {
                $user->forceFill(['is_active' => true])->save();
            }

            $this->pins->set($user, $pin);

            return ['user' => $user, 'pin' => $pin, 'created' => $created];
        });
    }

    /**
     * A console password for a desk position, shown once.
     *
     * The account is opened first if it is missing — the same `open()` as the
     * PIN, so a freshly hired accountant needs one press, not two. The login
     * the person will type is returned beside the password, because the
     * account's address may be the `.invalid` placeholder: a phone number,
     * when the member has one, is what they sign in with (`AuthController`
     * accepts either), and the manager reads that out too.
     *
     * Random rather than chosen by the manager. A password somebody else
     * picked is a password two people know; this one is known to the person
     * it is read to, and to nobody after the screen is closed.
     *
     * @return array{user: User, password: string, login: string, created: bool}
     */
    public function password(StaffMember $member): array
    {
        return DB::transaction(function () use ($member): array {
            $created = false;

            /** @var User|null $user */
            $user = $member->user_id === null ? null : User::query()->whereKey($member->user_id)->first();

            if ($user === null) {
                ['user' => $user, 'created' => $created] = $this->open($member);
            }

            $password = Str::password(12, symbols: false);
            $user->forceFill(['password' => $password, 'is_active' => true])->save();

            /*
             * Every session this person holds is ended with the old password.
             * A password is re-issued because the old one is lost or in the
             * wrong hands, and a token minted with it must not outlive it.
             */
            $user->tokens()->delete();

            return [
                'user' => $user,
                'password' => $password,
                'login' => $user->phone ?? $user->email,
                'created' => $created,
            ];
        });
    }

    /**
     * Keep the role in step with the position.
     *
     * `PATCH members/{member}` can promote a cook to chef; without this the
     * account kept the cook's permissions until somebody happened to rotate
     * the PIN, which is a promotion that only half happened.
     */
    public function syncRole(StaffMember $member): void
    {
        if ($member->user_id === null) {
            return;
        }

        /** @var User|null $user */
        $user = User::query()->whereKey($member->user_id)->first();

        $user?->syncRoles([self::ROLE_FOR_POSITION[$member->position] ?? 'waiter']);
    }

    /**
     * Shut the account behind a member who is leaving — every token, every
     * paired phone, and the door itself.
     */
    public function close(StaffMember $member): void
    {
        if ($member->user_id === null) {
            return;
        }

        DB::transaction(function () use ($member): void {
            /** @var User|null $user */
            $user = User::query()->whereKey($member->user_id)->first();

            if ($user === null) {
                return;
            }

            $user->forceFill(['is_active' => false])->save();
            $user->tokens()->delete();

            /*
             * The phone's own credential, not only the person's. The device
             * token is what lets a handset ask for the PIN pad at all, and a
             * handset that can still reach the pad is a handset that can still
             * be guessed against.
             */
            foreach (StaffDevice::query()->where('user_id', $user->getKey())->get() as $device) {
                $device->tokens()->delete();
                $device->forceFill(['status' => 'revoked'])->save();
            }
        });
    }

    /**
     * Four digits, none of the ones a person would guess first.
     *
     * `0000`, `1234`, `1111` and their like are the first dozen tries on any
     * keypad, and a manager reading "your PIN is 1234" aloud teaches the new
     * hire that the system is a formality. Drawn again until it is neither a
     * run nor a repeat.
     */
    private function generatePin(): string
    {
        $length = max(4, (int) config('auth.pin.length', 4));

        do {
            $pin = '';

            for ($i = 0; $i < $length; $i++) {
                $pin .= (string) random_int(0, 9);
            }
        } while ($this->isGuessable($pin));

        return $pin;
    }

    private function isGuessable(string $pin): bool
    {
        // All one digit: 0000, 7777.
        if (count(array_unique(str_split($pin))) === 1) {
            return true;
        }

        // A run in either direction: 1234, 4321, 6789.
        $digits = array_map('intval', str_split($pin));
        $up = true;
        $down = true;

        for ($i = 1, $n = count($digits); $i < $n; $i++) {
            $up = $up && $digits[$i] === $digits[$i - 1] + 1;
            $down = $down && $digits[$i] === $digits[$i - 1] - 1;
        }

        return $up || $down;
    }

    /**
     * `EMP-0007@staff.osh-xona.invalid` — unique by construction, because the
     * employee code is unique per restaurant and the restaurant's slug is
     * unique on the platform.
     */
    private function placeholderEmail(StaffMember $member): string
    {
        $slug = $member->tenant->slug ?? ('t'.$member->tenant_id);

        return strtolower($member->employee_code).'@staff.'.$slug.'.invalid';
    }
}
