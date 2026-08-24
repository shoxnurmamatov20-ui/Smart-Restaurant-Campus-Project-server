<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * Turn the seeded demo accounts into accounts nobody on the internet knows.
 *
 * `UserSeeder` creates twelve people on `demo-restaurant` with the password
 * `password`, and says so in its docblock — "fine here precisely because this
 * never runs in production". It ran in production. Every one of those accounts,
 * the owner included, answered `owner@demo.uz` / `password` on the public API
 * for as long as that seed had been live.
 *
 * This does not delete them. The demo tenant is what a sales call shows, and a
 * restaurant that does not exist yet still has to be demonstrated with one that
 * does. It rotates every demo password to a long random one and prints the set
 * ONCE — to the terminal, never to a log — so the person running it writes them
 * down and nobody else has them.
 *
 * Idempotent by design: running it again rotates again, which is also how you
 * revoke a set that leaked.
 */
final class LockDemoAccounts extends Command
{
    protected $signature = 'demo:lock
                            {--domain=demo.uz : Accounts whose email ends with this are the demo set}
                            {--also=admin@campus.uz : A platform account seeded with the same password}';

    protected $description = 'Rotate every seeded demo password to a random one and print the set once';

    public function handle(): int
    {
        $domain = ltrim((string) $this->option('domain'), '@');
        $also = array_filter(array_map('trim', explode(',', (string) $this->option('also'))));

        /** @var Collection<int, User> $people */
        $people = User::query()
            ->withoutGlobalScopes()
            ->where(function ($query) use ($domain, $also): void {
                $query->where('email', 'like', '%@'.$domain);

                foreach ($also as $email) {
                    $query->orWhere('email', $email);
                }
            })
            ->orderBy('tenant_id')
            ->orderBy('id')
            ->get();

        if ($people->isEmpty()) {
            $this->warn("No accounts match @{$domain} — nothing to lock.");

            return self::SUCCESS;
        }

        $this->newLine();
        $this->line('<comment>New passwords — shown once, never logged. Write them down now.</comment>');
        $this->newLine();

        $rows = [];

        foreach ($people as $person) {
            // 24 characters from a 62-symbol alphabet: ~143 bits. Long enough
            // that bcrypt's cost is the slow part, not the guess.
            $password = Str::password(24, symbols: false);

            $person->forceFill(['password' => Hash::make($password)])->save();

            // Every existing session for this person ends with the old password.
            $person->tokens()->delete();

            $rows[] = [$person->email, $password];
        }

        $this->table(['email', 'password'], $rows);
        $this->newLine();
        $this->info(count($rows).' account(s) rotated; every open session for them was revoked.');

        return self::SUCCESS;
    }
}
