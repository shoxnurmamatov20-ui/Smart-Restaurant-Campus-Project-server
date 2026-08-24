<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Support\Tenancy\TenantProvisioner;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Validator;

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

    public function __construct(private readonly TenantProvisioner $provisioner)
    {
        parent::__construct();
    }

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
        $password = (string) ($this->option('password') ?: TenantProvisioner::password());
        $generated = $this->option('password') === null || $this->option('password') === '';

        /*
         * The one definition of "a new restaurant" — shared with
         * POST /api/v1/platform/tenants.
         *
         * This used to be written here, and the endpoint that would have needed
         * the same steps did not exist yet. Two copies of "create a tenant,
         * seed its settings, make its owner" is how a venue ends up without a
         * VAT rate, discovered by an accountant in March.
         */
        $result = $this->provisioner->create([
            'restaurant' => $input['restaurant'],
            'name' => $input['name'],
            'email' => $input['email'],
            'phone' => $input['phone'],
            'password' => $password,
            'locale' => (string) $this->option('locale'),
            'timezone' => (string) $this->option('timezone'),
            'country' => (string) $this->option('country'),
        ]);

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
}
