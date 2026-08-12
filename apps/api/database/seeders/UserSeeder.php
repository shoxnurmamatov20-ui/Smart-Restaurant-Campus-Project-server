<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\Tenant;
use App\Models\User;
use Illuminate\Database\Seeder;

/**
 * Accounts to actually sign in with.
 *
 * Without this, `migrate --seed` produces a fully populated restaurant that
 * nobody can log into — 34 dishes, 25 bills, 24 tables, and no way to see any
 * of it. One account per role also makes the RBAC visible: open the app as the
 * waiter and the till is simply not there.
 *
 * Never runs in production. Real venues get their owner from
 * `php artisan restaurant:create-owner`, which forces a password to be chosen
 * rather than shipping one in source control.
 */
final class UserSeeder extends Seeder
{
    /** Demo password. Fine here precisely because this never runs in production. */
    private const PASSWORD = 'password';

    /**
     * The demo operator's two-factor secret.
     *
     * Base32, sixteen characters — the shape Google Authenticator expects.
     * Committed on purpose and safe for the same reason the password above is:
     * this seeder refuses to run in production. Add it to an authenticator app
     * as "Smart Restaurant Cloud" to sign in at /login on the admin console.
     */
    public const DEMO_TOTP_SECRET = 'JBSWY3DPEHPK3PXP';

    /**
     * One per role that a person actually signs in as, so every permission set
     * in RolesAndPermissionsSeeder can be seen in the UI.
     *
     * @var array<string, array{name: string, role: string, phone: string}>
     */
    private const PEOPLE = [
        'owner@demo.uz' => ['name' => 'Rustam Egamberdiyev', 'role' => 'owner', 'phone' => '+998901110001'],
        'manager@demo.uz' => ['name' => 'Nigora Yusupova', 'role' => 'branch-manager', 'phone' => '+998901110002'],
        'chef@demo.uz' => ['name' => 'Anvar Qodirov', 'role' => 'chef', 'phone' => '+998901110003'],
        'cook@demo.uz' => ['name' => 'Shahzod Aliyev', 'role' => 'cook', 'phone' => '+998901110004'],
        'waiter@demo.uz' => ['name' => 'Dilnoza Rahimova', 'role' => 'waiter', 'phone' => '+998901110005'],
        'cashier@demo.uz' => ['name' => 'Malika Tosheva', 'role' => 'cashier', 'phone' => '+998901110006'],
        'host@demo.uz' => ['name' => 'Sardor Nazarov', 'role' => 'host', 'phone' => '+998901110007'],
        'storekeeper@demo.uz' => ['name' => 'Bekzod Umarov', 'role' => 'storekeeper', 'phone' => '+998901110008'],
        'accountant@demo.uz' => ['name' => 'Gulnora Ismoilova', 'role' => 'accountant', 'phone' => '+998901110009'],
        'marketer@demo.uz' => ['name' => 'Jasur Karimov', 'role' => 'marketer', 'phone' => '+998901110010'],
    ];

    public function run(): void
    {
        if (app()->environment('production')) {
            $this->command?->warn('⏭  UserSeeder: production muhitida o\'tkazib yuborildi.');

            return;
        }

        $tenant = Tenant::query()
            ->where('slug', (string) config('tenancy.default_slug', 'demo-restaurant'))
            ->first();

        if ($tenant === null) {
            $this->command?->warn('⚠️  UserSeeder: demo restoran topilmadi — avval TenantSeeder.');

            return;
        }

        foreach (self::PEOPLE as $email => $person) {
            $user = User::query()->updateOrCreate(
                // Email is unique per restaurant, not per platform, so both
                // columns are needed to identify the row.
                ['tenant_id' => $tenant->id, 'email' => $email],
                [
                    'name' => $person['name'],
                    'phone' => $person['phone'],
                    'password' => self::PASSWORD,
                    'locale' => 'uz',
                    'is_active' => true,
                    'email_verified_at' => now(),
                ],
            );

            // syncRoles rather than assignRole: re-seeding must not leave a
            // waiter who was promoted to manager holding both.
            $user->syncRoles([$person['role']]);
        }

        // A platform operator, deliberately outside any restaurant: they
        // support every tenant and belong to none.
        $superAdmin = User::query()->updateOrCreate(
            ['tenant_id' => null, 'email' => 'admin@campus.uz'],
            [
                'name' => 'Platforma administratori',
                'phone' => '+998901110000',
                'password' => self::PASSWORD,
                'locale' => 'uz',
                'is_active' => true,
                'email_verified_at' => now(),
            ],
        );
        $superAdmin->syncRoles(['super-admin']);

        /*
         * Enrol them in two-factor, or the platform door cannot be opened.
         *
         * `POST /api/v1/admin/login` requires a code, and a code requires a
         * confirmed secret — so without this the only super-admin on a fresh
         * database is locked out of the console built for them.
         *
         * A fixed secret, printed below, because this seeder never runs in
         * production (it returns early above). A real operator enrols by
         * scanning a QR code; nobody types this one anywhere but a test.
         */
        $superAdmin->forceFill([
            'two_factor_secret' => self::DEMO_TOTP_SECRET,
            'two_factor_confirmed_at' => now(),
            'two_factor_last_window' => null,
        ])->save();

        $count = count(self::PEOPLE) + 1;
        $this->command?->info("✅ Users: {$count} ta hisob yaratildi (parol: ".self::PASSWORD.').');
        $this->command?->line('   owner@demo.uz · waiter@demo.uz · cashier@demo.uz · admin@campus.uz');
        $this->command?->line('   admin@campus.uz uchun 2FA kaliti: '.self::DEMO_TOTP_SECRET);
    }
}
