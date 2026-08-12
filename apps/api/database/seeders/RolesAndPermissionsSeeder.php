<?php

declare(strict_types=1);

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

/**
 * Smart Restaurant Campus RBAC — 15 standart restoran roli va per-modul ruxsatlar.
 *
 * The role list mirrors how a real restaurant is actually staffed: an owner, a
 * manager per branch, a kitchen brigade, a floor team, and back-office people.
 * Permissions are deliberately narrow — a waiter can read the menu but never
 * reprice it, a cook can pull a dish onto the stop-list but not delete it.
 *
 * Managed by spatie/laravel-permission. Default guard: web (Sanctum SPA and API
 * tokens share it).
 */
final class RolesAndPermissionsSeeder extends Seeder
{
    /**
     * Every Phase-1 module gets the same five verbs.
     *
     * @var array<int, string>
     */
    private const MODULES = [
        'menu',        // Menyu va taomlar
        'orders',      // Buyurtmalar
        'kitchen',     // Oshxona (KDS)
        'tables',      // Stollar va bronlar
        'inventory',   // Ombor
        'suppliers',   // Yetkazib beruvchilar
        'staff',       // Xodimlar
        'finance',     // Moliya va kassa
        'crm',         // Mijozlar va sodiqlik
        'analytics',   // Analitika
        'telegram',    // Telegram botlar
        'pos',        // Kassa terminali
    ];

    /** @var array<int, string> */
    private const ACTIONS = ['view', 'create', 'update', 'delete', 'manage'];

    /**
     * Platform-level permissions — only the back office ever needs these.
     *
     * @var array<string, string>
     */
    private const SYSTEM_PERMISSIONS = [
        'system.settings' => 'tizim sozlamalari',
        'system.modules' => 'modullarni yoqish/o\'chirish',
        'system.integrations' => 'tashqi integratsiyalar (Payme, Click, fiskal, agregatorlar)',
        'system.backups' => 'zaxira nusxalar',
        'system.api-keys' => 'API kalitlari',
        'system.health' => 'tizim salomatligi monitoringi',
        'system.statistics' => 'platforma statistikasi',
        'audit.view' => 'audit jurnalini ko\'rish',
        'users.invite' => 'foydalanuvchi taklif qilish',
        'users.impersonate' => 'foydalanuvchi nomidan kirish',
        'tenants.manage' => 'restoranlar/tarmoqlarni boshqarish (multi-tenant)',
        'branches.manage' => 'filiallarni boshqarish',
        'roles.manage' => 'rollarni boshqarish',
        'notifications.broadcast' => 'ommaviy xabarnoma yuborish',
        'reports.export' => 'hisobotlarni eksport qilish',
    ];

    /**
     * Till powers the five generic verbs cannot express.
     *
     * "Open a bill" and "wipe a line off it" are both `pos.update` to a CRUD
     * model, and they are the two ends of the only fraud that matters in a
     * restaurant: the guest pays cash, the line is voided, the money walks.
     * Naming them separately is what lets a cashier *ask* for a void while only
     * a manager can *grant* one.
     *
     * @var array<string, string>
     */
    private const POS_PERMISSIONS = [
        'pos.sell' => 'terminalda sotish',
        'pos.void' => 'hisob qatorini bekor qilish',
        'pos.discount' => 'qo\'lda chegirma berish',
        'pos.reopen' => 'yopilgan hisobni qayta ochish',
        'pos.refund' => 'qaytarish',
        'pos.drawer' => 'kassa qutisi: naqd kirim-chiqim, inkassatsiya',
        'pos.approve' => 'boshqaning so\'rovini tasdiqlash',
        'pos.terminal' => 'terminalni ulash va sozlash',
    ];

    /**
     * What a person standing at a terminal needs to take an order.
     *
     * @var array<int, string>
     */
    private const POS_OPERATOR = ['pos.view', 'pos.create', 'pos.update', 'pos.sell'];

    public function run(): void
    {
        app(PermissionRegistrar::class)->forgetCachedPermissions();

        DB::transaction(function (): void {
            $this->seedPermissions();
            $this->seedRoles();
        });

        app(PermissionRegistrar::class)->forgetCachedPermissions();

        $this->command?->info('✅ Roles + Permissions seeded (restoran RBAC).');
    }

    private function seedPermissions(): void
    {
        foreach (self::MODULES as $module) {
            foreach (self::ACTIONS as $action) {
                Permission::firstOrCreate(['name' => "{$module}.{$action}", 'guard_name' => 'web']);
            }
        }

        foreach (array_keys(self::SYSTEM_PERMISSIONS) as $permission) {
            Permission::firstOrCreate(['name' => $permission, 'guard_name' => 'web']);
        }

        foreach (array_keys(self::POS_PERMISSIONS) as $permission) {
            Permission::firstOrCreate(['name' => $permission, 'guard_name' => 'web']);
        }
    }

    private function seedRoles(): void
    {
        // ---- 1. Super Admin — SaaS platformasi administratori ----
        $this->role('super-admin')->syncPermissions(Permission::all());

        // ---- 2. Restoran egasi — hamma narsani ko'radi, tizimga tegmaydi ----
        $this->role('owner')->syncPermissions($this->permissions(
            modules: self::MODULES,
            actions: self::ACTIONS,
            extra: [
                'audit.view', 'system.statistics', 'reports.export', 'notifications.broadcast',
                'users.invite', 'roles.manage', 'branches.manage', 'system.integrations',
                // Which modules this restaurant uses is the owner's call, not the
                // platform's: PATCH /api/v1/modules only ever writes their own
                // tenant settings, never the platform-wide flag.
                'system.modules',
                // Every till power, including approving someone else's void.
                ...array_keys(self::POS_PERMISSIONS),
            ],
        ));

        // ---- 3. Tarmoq (brend) menejeri — bir nechta filial ustidan ----
        $this->role('brand-manager')->syncPermissions($this->permissions(
            modules: self::MODULES,
            actions: ['view', 'create', 'update', 'manage'],
            extra: [
                'reports.export', 'system.statistics', 'branches.manage', 'users.invite',
                ...array_keys(self::POS_PERMISSIONS),
            ],
        ));

        // ---- 4. Filial menejeri — kunlik operatsiyalar ----
        $this->role('branch-manager')->syncPermissions($this->permissions(
            modules: ['menu', 'orders', 'kitchen', 'tables', 'inventory', 'suppliers', 'staff', 'finance', 'crm', 'pos'],
            actions: ['view', 'create', 'update'],
            extra: [
                'analytics.view', 'staff.manage', 'finance.manage', 'reports.export', 'telegram.view',
                // The manager is the authority on the floor: they are who a
                // cashier walks to when a line has to come off a bill.
                'pos.manage', ...array_keys(self::POS_PERMISSIONS),
            ],
        ));

        // ---- 5. Osh-boshi (chef) — menyu va oshxona egasi ----
        $this->role('chef')->syncPermissions($this->permissions(
            modules: ['menu', 'kitchen'],
            actions: ['view', 'create', 'update', 'delete', 'manage'],
            // The chef's till power is the stop-list, and that lives in Menu.
            // Here they only need to see what the floor is selling.
            extra: ['inventory.view', 'inventory.update', 'staff.view', 'orders.view', 'analytics.view', 'pos.view'],
        ));

        // ---- 6. Oshpaz — chiptalarni bajaradi, stop-list qo'yadi ----
        $this->role('cook')->syncPermissions($this->permissions(
            modules: ['kitchen'],
            actions: ['view', 'update'],
            // menu.update is what lets a cook pull a dish the moment the
            // ingredient runs out — without it the floor keeps selling it.
            extra: ['menu.view', 'menu.update', 'inventory.view', 'orders.view'],
        ));

        // ---- 7. Ofitsiant — zal va buyurtmalar ----
        $this->role('waiter')->syncPermissions($this->permissions(
            modules: ['orders'],
            actions: ['view', 'create', 'update'],
            // A waiter takes orders at a terminal but never opens the drawer:
            // the money side of the till belongs to the cashier.
            extra: ['menu.view', 'tables.view', 'tables.update', 'kitchen.view', 'crm.view', ...self::POS_OPERATOR],
        ));

        // ---- 8. Barmen — bar chiptalari va ichimliklar ----
        $this->role('bartender')->syncPermissions($this->permissions(
            modules: ['kitchen'],
            actions: ['view', 'update'],
            // A bar tab is a bill: the bartender rings it up at their own screen.
            extra: ['menu.view', 'menu.update', 'orders.view', 'orders.update', 'inventory.view', ...self::POS_OPERATOR],
        ));

        // ---- 9. Kassir — to'lovlar va kassa smenasi ----
        $this->role('cashier')->syncPermissions($this->permissions(
            modules: ['finance'],
            actions: ['view', 'create', 'update'],
            // `pos.drawer` and no `pos.approve`: the cashier moves the cash and
            // asks for a void; only a manager ever grants one.
            extra: ['orders.view', 'orders.update', 'menu.view', 'crm.view', 'crm.update', ...self::POS_OPERATOR, 'pos.drawer'],
        ));

        // ---- 10. Hostes — stollar, bronlar, mehmonlarni kutib olish ----
        $this->role('host')->syncPermissions($this->permissions(
            modules: ['tables'],
            actions: ['view', 'create', 'update', 'manage'],
            extra: ['orders.view', 'crm.view', 'crm.create', 'menu.view', 'pos.view'],
        ));

        // ---- 11. Kuryer — faqat o'z yetkazmalari ----
        $this->role('courier')->syncPermissions(
            // Reads the till only to see what is owed on a delivery they carry.
            Permission::whereIn('name', ['orders.view', 'orders.update', 'pos.view'])->get()
        );

        // ---- 12. Omborchi — qoldiq, kirim, chiqim ----
        $this->role('storekeeper')->syncPermissions($this->permissions(
            modules: ['inventory'],
            actions: ['view', 'create', 'update', 'delete', 'manage'],
            // Sees what the till sold, because that is what drained the shelf.
            extra: ['suppliers.view', 'suppliers.create', 'suppliers.update', 'menu.view', 'kitchen.view', 'pos.view'],
        ));

        // ---- 13. Buxgalter — moliya va hisobotlar ----
        $this->role('accountant')->syncPermissions($this->permissions(
            modules: ['finance'],
            actions: ['view', 'create', 'update', 'manage'],
            // Z-reports, fiscal receipts and cash variance — reads and re-sends,
            // never sells.
            extra: ['suppliers.view', 'staff.view', 'analytics.view', 'reports.export', 'audit.view', 'pos.view', 'pos.manage'],
        ));

        // ---- 14. Marketolog — aksiyalar, sodiqlik, kampaniyalar ----
        $this->role('marketer')->syncPermissions($this->permissions(
            modules: ['crm'],
            actions: ['view', 'create', 'update', 'manage'],
            extra: [
                'menu.view', 'analytics.view', 'notifications.broadcast',
                'telegram.view', 'telegram.create', 'telegram.update',
            ],
        ));

        // ---- 15. Mehmon — hech qanday ichki ruxsat yo'q ----
        // A guest only ever reaches the public QR menu, which needs no permission.
        $this->role('guest')->syncPermissions([]);
    }

    private function role(string $name): Role
    {
        return Role::firstOrCreate(['name' => $name, 'guard_name' => 'web']);
    }

    /**
     * Build a permission collection from module × action pairs plus extras.
     *
     * @param array<int, string> $modules
     * @param array<int, string> $actions
     * @param array<int, string> $extra
     *
     * @return Collection<int, Permission>
     */
    private function permissions(array $modules, array $actions, array $extra = [])
    {
        $names = [];

        foreach ($modules as $module) {
            foreach ($actions as $action) {
                $names[] = "{$module}.{$action}";
            }
        }

        return Permission::whereIn('name', array_unique([...$names, ...$extra]))->get();
    }
}
