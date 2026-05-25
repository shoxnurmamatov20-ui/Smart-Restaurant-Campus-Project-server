<?php

declare(strict_types=1);

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

/**
 * CAMPUS RBAC seeder — 15 standart rolelarni va per-modul permissions yaratadi.
 *
 * Rolelar Spatie laravel-permission orqali boshqariladi.
 * Default guard: web (Sanctum SPA + API token uchun bir xil).
 */
final class RolesAndPermissionsSeeder extends Seeder
{
    public function run(): void
    {
        app(PermissionRegistrar::class)->forgetCachedPermissions();

        DB::transaction(function (): void {
            $this->seedPermissions();
            $this->seedRoles();
        });

        app(PermissionRegistrar::class)->forgetCachedPermissions();

        $this->command->info('✅ Roles + Permissions seeded.');
    }

    private function seedPermissions(): void
    {
        // Per-modul standart amallar
        $modules = ['hr', 'students', 'online', 'edms', 'rttm', 'psychology', 'exams', 'library', 'media', 'kpi'];
        $actions = ['view', 'create', 'update', 'delete', 'manage'];

        foreach ($modules as $module) {
            foreach ($actions as $action) {
                Permission::firstOrCreate(['name' => "{$module}.{$action}", 'guard_name' => 'web']);
            }
        }

        // Tizim darajasidagi permissions (super-admin uchun)
        $systemPermissions = [
            'system.settings',           // tizim sozlamalari
            'system.modules',            // modullarni yoqish/o'chirish
            'system.integrations',       // tashqi integratsiyalar
            'system.backups',            // backup'lar
            'system.api-keys',           // API kalitlari
            'system.health',             // health monitoring
            'system.statistics',         // statistika
            'audit.view',                // audit log ko'rish
            'users.invite',              // foydalanuvchi taklif
            'users.impersonate',         // foydalanuvchi tomonidan login
            'tenants.manage',            // ko'p universitet (multi-tenant)
            'roles.manage',              // rollarni boshqarish
            'notifications.broadcast',   // tizim bo'ylab xabarnoma
            'reports.export',            // hisobot eksport
        ];

        foreach ($systemPermissions as $perm) {
            Permission::firstOrCreate(['name' => $perm, 'guard_name' => 'web']);
        }
    }

    private function seedRoles(): void
    {
        // 1. Super Admin — barcha amallar
        $superAdmin = Role::firstOrCreate(['name' => 'super-admin', 'guard_name' => 'web']);
        $superAdmin->syncPermissions(Permission::all());

        // 2. Rektor — kuzatuv + tasdiqlash, lekin tizim sozlamalariga kirmaydi
        $rector = Role::firstOrCreate(['name' => 'rector', 'guard_name' => 'web']);
        $rector->syncPermissions(
            Permission::where('name', 'like', '%.view')
                ->orWhere('name', 'like', '%.manage')
                ->orWhereIn('name', ['audit.view', 'system.statistics', 'reports.export', 'notifications.broadcast'])
                ->get()
        );

        // 3. Prorektor — rector singari, lekin cheklangan
        $prorector = Role::firstOrCreate(['name' => 'prorector', 'guard_name' => 'web']);
        $prorector->syncPermissions(
            Permission::where('name', 'like', '%.view')
                ->orWhere('name', 'like', '%.update')
                ->orWhereIn('name', ['system.statistics', 'reports.export'])
                ->get()
        );

        // 4. Dekan — fakultet bo'yicha kuzatuv
        $dean = Role::firstOrCreate(['name' => 'dean', 'guard_name' => 'web']);
        $dean->syncPermissions(
            Permission::whereIn('name', [
                'students.view', 'students.update', 'students.manage',
                'hr.view',
                'online.view', 'online.manage',
                'exams.view', 'exams.update',
                'kpi.view',
                'reports.export', 'system.statistics',
            ])->get()
        );

        // 5. Kafedra mudiri (head-of-department)
        $hod = Role::firstOrCreate(['name' => 'head-of-department', 'guard_name' => 'web']);
        $hod->syncPermissions(
            Permission::whereIn('name', [
                'students.view',
                'hr.view',
                'online.view',
                'exams.view', 'exams.create', 'exams.update',
                'kpi.view',
            ])->get()
        );

        // 6. O'qituvchi
        $teacher = Role::firstOrCreate(['name' => 'teacher', 'guard_name' => 'web']);
        $teacher->syncPermissions(
            Permission::whereIn('name', [
                'students.view',
                'online.view', 'online.create', 'online.update',
                'exams.view', 'exams.create', 'exams.update',
                'library.view',
                'kpi.view',
                'edms.view', 'edms.create',
            ])->get()
        );

        // 7. Talaba
        $student = Role::firstOrCreate(['name' => 'student', 'guard_name' => 'web']);
        $student->syncPermissions(
            Permission::whereIn('name', [
                'online.view',
                'exams.view',
                'library.view',
                'edms.view', 'edms.create',
                'psychology.view',
            ])->get()
        );

        // 8. Ota-ona
        Role::firstOrCreate(['name' => 'parent', 'guard_name' => 'web'])
            ->syncPermissions(Permission::whereIn('name', ['students.view'])->get());

        // 9. HR xodimi
        Role::firstOrCreate(['name' => 'hr', 'guard_name' => 'web'])
            ->syncPermissions(Permission::where('name', 'like', 'hr.%')->orWhere('name', 'like', 'edms.%')->get());

        // 10. Buxgalter
        Role::firstOrCreate(['name' => 'accountant', 'guard_name' => 'web'])
            ->syncPermissions(Permission::whereIn('name', ['students.view', 'hr.view', 'reports.export'])->get());

        // 11. Kutubxonachi
        Role::firstOrCreate(['name' => 'librarian', 'guard_name' => 'web'])
            ->syncPermissions(Permission::where('name', 'like', 'library.%')->get());

        // 12. Psixolog
        Role::firstOrCreate(['name' => 'psychologist', 'guard_name' => 'web'])
            ->syncPermissions(Permission::where('name', 'like', 'psychology.%')->get());

        // 13. IT xodimi
        Role::firstOrCreate(['name' => 'it-staff', 'guard_name' => 'web'])
            ->syncPermissions(
                Permission::where('name', 'like', 'rttm.%')
                    ->orWhereIn('name', ['system.api-keys', 'system.health'])
                    ->get()
            );

        // 14. Xavfsizlik
        Role::firstOrCreate(['name' => 'security', 'guard_name' => 'web'])
            ->syncPermissions(Permission::whereIn('name', ['students.view', 'hr.view'])->get());

        // 15. Mehmon (faqat read-only public data)
        Role::firstOrCreate(['name' => 'guest', 'guard_name' => 'web']);
    }
}
