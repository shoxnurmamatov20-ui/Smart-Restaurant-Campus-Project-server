<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\User;
use App\Support\Auth\TwoFactor;
use Illuminate\Console\Command;

/**
 * Give a super-admin their second factor — or a new one.
 *
 * `POST /api/v1/admin/login` refuses without a six-digit code, and there is
 * no enrolment endpoint on purpose: the platform console is the one door the
 * product has that opens every restaurant, and a self-service "set up 2FA"
 * screen on it is a screen an attacker with the password could use too. So
 * enrolment is an operator's act, on the box, like `admin:create` — which
 * said "set up TOTP at the next login" and left no way to do it.
 *
 * The secret is printed once, as the base32 string and as the `otpauth://`
 * URI an authenticator app scans. Running it again replaces the secret: a
 * lost phone is the only reason to, and the old code must stop working the
 * moment the new one starts. The seeded demo admin's secret is written down
 * in the repository; this is also how a box that goes live rotates it.
 */
final class AdminTwoFactorCommand extends Command
{
    protected $signature = 'admin:two-factor
                            {email : The super-admin to enrol}
                            {--issuer=Smart Restaurant : The name the authenticator app shows}';

    protected $description = 'Set (or replace) a super-admin\'s TOTP secret and print it once';

    public function handle(TwoFactor $twoFactor): int
    {
        $email = (string) $this->argument('email');
        $user = User::query()->where('email', $email)->first();

        if ($user === null) {
            $this->error("No user with email {$email}.");

            return self::FAILURE;
        }

        if (! $user->hasRole('super-admin')) {
            $this->error("{$email} is not a super-admin; a restaurant account signs in with its password alone.");

            return self::FAILURE;
        }

        $replacing = $user->two_factor_secret !== null;
        $secret = $twoFactor->newSecret();

        // Not fillable, deliberately — written here and nowhere a request can reach.
        $user->forceFill([
            'two_factor_secret' => $secret,
            'two_factor_confirmed_at' => now(),
            'two_factor_last_window' => null,
        ])->save();

        $this->info("✅ Two-factor secret set for {$email}".($replacing ? ' (the old one no longer works)' : ''));
        $this->newLine();
        $this->line('Add it to Google Authenticator / Aegis / 1Password — either by scanning the URI or typing the key:');
        $this->newLine();
        $this->line('  Key:  '.$secret);
        $this->line('  URI:  '.$twoFactor->enrolmentUri($user, $secret, (string) $this->option('issuer')));
        $this->newLine();
        $this->warn('Shown once. Anyone who reads this key can produce the codes; run the command again to replace it.');

        return self::SUCCESS;
    }
}
