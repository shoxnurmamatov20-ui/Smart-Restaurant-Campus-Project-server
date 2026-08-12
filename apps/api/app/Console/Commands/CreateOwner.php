<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\Tenant;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;

/**
 * Puts a real restaurant on the platform — the production counterpart of
 * UserSeeder.
 *
 * Onboarding a venue over the public /auth/register endpoint is fine for
 * self-signup, but an operator setting one up on a private deployment needs to
 * do it from the server, without a password ever appearing in a seeder, a
 * request log, or source control.
 */
final class CreateOwner extends Command
{
    protected $signature = 'restaurant:create-owner
                            {--restaurant= : Restaurant name, e.g. "Osh Markazi"}
                            {--name= : The owner\'s full name}
                            {--email= : The owner\'s email}
                            {--phone= : The owner\'s phone in E.164, e.g. +998901234567}
                            {--password= : Leave empty to have one generated}
                            {--timezone=Asia/Tashkent}
                            {--locale=uz}
                            {--country=UZ}';

    protected $description = 'Create a restaurant and its owner account';

    public function handle(): int
    {
        $input = [
            'restaurant' => (string) $this->option('restaurant'),
            'name' => (string) $this->option('name'),
            'email' => (string) $this->option('email'),
            'phone' => $this->option('phone') === null ? null : (string) $this->option('phone'),
        ];

        $validator = Validator::make($input, [
            'restaurant' => ['required', 'string', 'max:160'],
            'name' => ['required', 'string', 'max:160'],
            'email' => ['required', 'email', 'max:190'],
            'phone' => ['nullable', 'string', 'max:32', 'regex:/^\+?[0-9]{9,15}$/'],
        ]);

        if ($validator->fails()) {
            foreach ($validator->errors()->all() as $error) {
                $this->error($error);
            }

            return self::INVALID;
        }

        // Generated rather than defaulted: a known default password on a
        // production install is the same as no password at all.
        $password = (string) ($this->option('password') ?: Str::password(16));
        $generated = $this->option('password') === null || $this->option('password') === '';

        $result = DB::transaction(function () use ($input, $password): array {
            $tenant = Tenant::query()->create([
                'name' => $input['restaurant'],
                'slug' => $this->uniqueSlug($input['restaurant']),
                'country_code' => strtoupper((string) $this->option('country')),
                'locale' => (string) $this->option('locale'),
                'timezone' => (string) $this->option('timezone'),
                'status' => 'active',
                'settings' => [
                    'currency' => 'UZS',
                    'service_charge_percent' => 0,
                    'vat_percent' => 12,
                    'business_day_starts_at' => '06:00',
                    'channels' => ['dine_in', 'takeaway', 'delivery'],
                ],
            ]);

            $user = User::query()->create([
                'tenant_id' => $tenant->id,
                'name' => $input['name'],
                'email' => $input['email'],
                'phone' => $input['phone'],
                'password' => $password,
                'locale' => (string) $this->option('locale'),
                'is_active' => true,
                'email_verified_at' => now(),
            ]);

            $user->assignRole('owner');

            return ['tenant' => $tenant, 'user' => $user];
        });

        $this->info("✅ Restoran yaratildi: {$result['tenant']->name} ({$result['tenant']->slug})");
        $this->info("✅ Egasi: {$result['user']->email}");

        if ($generated) {
            $this->newLine();
            $this->warn('Parol (bir marta ko\'rsatiladi, saqlab qo\'ying):');
            $this->line("  {$password}");
        }

        $this->newLine();
        $this->line("Kirish: X-Tenant: {$result['tenant']->slug}");

        return self::SUCCESS;
    }

    /**
     * Slugs identify a restaurant in the `X-Tenant` header and on its
     * subdomain, so a collision would route two businesses to one another.
     */
    private function uniqueSlug(string $name): string
    {
        $base = Str::slug($name) ?: 'restoran';
        $slug = $base;
        $suffix = 2;

        while (Tenant::query()->where('slug', $slug)->exists()) {
            $slug = "{$base}-{$suffix}";
            $suffix++;
        }

        return $slug;
    }
}
