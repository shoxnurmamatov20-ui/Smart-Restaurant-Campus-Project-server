<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;
use Spatie\Permission\Models\Role;

use function Laravel\Prompts\confirm;
use function Laravel\Prompts\password;
use function Laravel\Prompts\select;
use function Laravel\Prompts\text;

/**
 * Yangi Super Admin yaratish (interactive).
 *
 * Foydalanish:
 *   php artisan admin:create
 *   php artisan admin:create --email=admin@campus.uz --name="Bosh admin"
 */
final class CreateAdminCommand extends Command
{
    protected $signature = 'admin:create
        {--email= : Admin email}
        {--name= : Admin full name}
        {--role=super-admin : Role to assign (default: super-admin)}
        {--password= : Plain password (NOT recommended — use interactive)}';

    protected $description = "Yangi Super Admin foydalanuvchi yaratish (RBAC roli bilan)";

    public function handle(): int
    {
        $this->info('🔐 CAMPUS — Super Admin yaratish');
        $this->newLine();

        $email = $this->option('email') ?: text(
            label: 'Email manzili',
            placeholder: 'admin@campus.uz',
            required: true,
            validate: fn (string $value) => match (true) {
                ! filter_var($value, FILTER_VALIDATE_EMAIL) => 'Email noto\'g\'ri formatda',
                User::where('email', $value)->exists() => 'Bu email allaqachon mavjud',
                default => null,
            },
        );

        $name = $this->option('name') ?: text(
            label: 'Ism va familiya',
            placeholder: 'Yoqubjon Aliyev',
            required: true,
        );

        $roleName = $this->option('role');
        $availableRoles = Role::pluck('name')->all();

        if (! in_array($roleName, $availableRoles, true)) {
            if (empty($availableRoles)) {
                $this->error('Hech qanday rol mavjud emas. Avval `php artisan db:seed --class=RolesAndPermissionsSeeder` ishga tushiring.');

                return Command::FAILURE;
            }
            $roleName = select('Rolni tanlang', $availableRoles, default: 'super-admin');
        }

        $plainPassword = $this->option('password') ?: password(
            label: 'Parol (kamida 12 ta belgi)',
            required: true,
            validate: fn (string $value) => match (true) {
                strlen($value) < 12 => 'Parol kamida 12 ta belgidan iborat bo\'lishi kerak',
                ! preg_match('/[A-Z]/', $value) => 'Kamida bitta katta harf bo\'lishi kerak',
                ! preg_match('/[0-9]/', $value) => 'Kamida bitta raqam bo\'lishi kerak',
                default => null,
            },
        );

        if (! $this->option('email') && ! confirm("Yaratamizmi? ({$email}, {$roleName})", default: true)) {
            $this->warn('Bekor qilindi.');

            return Command::SUCCESS;
        }

        $user = User::create([
            'name' => $name,
            'email' => $email,
            'password' => Hash::make($plainPassword),
            'email_verified_at' => now(),
        ]);

        $user->assignRole($roleName);

        $this->newLine();
        $this->info("✅ Super Admin yaratildi:");
        $this->table(['Field', 'Value'], [
            ['ID', (string) $user->id],
            ['Email', $user->email],
            ['Name', $user->name],
            ['Role', $roleName],
            ['Created', $user->created_at->toDateTimeString()],
        ]);

        $this->warn('⚠️  2FA TOTP ni keyingi loginda sozlash zarur (Super Admin uchun majburiy).');

        return Command::SUCCESS;
    }
}
