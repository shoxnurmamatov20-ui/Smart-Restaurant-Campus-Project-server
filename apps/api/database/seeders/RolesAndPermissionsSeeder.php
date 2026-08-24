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
        'marketplace',
        'board',
    ];

    /** @var array<int, string> */
    private const ACTIONS = ['view', 'create', 'update', 'delete', 'manage'];

    /**
     * Platform-level permissions — only the back office ever needs these.
     *
     * @var array<string, string>
     */
    /**
     * Permissions that belong to no CRUD module.
     *
     * `printing.agent` sits here rather than under `kitchen` deliberately: it is
     * not a degree of kitchen access, it is a different kind of principal. Putting
     * it in the module's five verbs would make it look like something a person
     * could be given a little of.
     */
    private const SYSTEM_PERMISSIONS = [
        'system.settings' => 'tizim sozlamalari',
        /*
         * Reading the restaurant's own settings, which is not the same power as
         * changing them.
         *
         * A branch manager has to read the VAT rate and the service charge to
         * explain a receipt to a guest standing in front of them; changing
         * either reprices every bill in the building. One permission for both
         * would have forced the choice between a manager who cannot answer a
         * question and a manager who can quietly move the tax rate.
         */
        'settings.view' => 'restoran sozlamalarini ko\'rish',
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
        /*
         * The home screen, and why it is not `analytics.view`.
         *
         * `GET /api/v1/dashboard` draws a different shape per role and the
         * console's sidebar points every role at it — a cashier's drawer, a
         * waiter's own six tables, a storekeeper's shelf. None of that is
         * analytics, and guarding it with `analytics.view` had two costs: four
         * roles got a 403 on their own home screen and silently fell back to
         * sample figures, and the only way to fix it was to hand a waiter the
         * venue's sales reports, its food cost and its ABC analysis.
         *
         * So the home screen has its own permission and every operational role
         * holds it. What each of them SEES is still decided by the shape the
         * service assembles and by the tenant and branch scopes underneath.
         */
        'dashboard.view' => 'bosh ekranni ko\'rish',
        'printing.agent' => 'lokal chop etish agenti: navbatni olish va natijani yozish',
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

    /**
     * What the local print agent is allowed to do, and nothing else.
     *
     * The agent is a small process on a machine in the back office that claims
     * queued jobs, pushes bytes at a printer and reports what happened. It is the
     * least trustworthy thing that holds a token in this system: it runs on a PC
     * nobody patches, in a room with a door, and it needs no human present.
     *
     * It came in on `kitchen.update` — the permission a cook uses to move dockets
     * across the board. A token lifted off that machine could therefore mark a
     * table's food ready, or start a ticket nobody is cooking, and the pass would
     * believe it. That is not a printing problem being solved by a printing
     * permission; it is a printing process holding a kitchen's authority.
     *
     * So: claim a job, say it printed, say it failed, report a pulse. Four
     * verbs, none of which touches an order, a bill or a docket's state.
     */
    private const PRINT_AGENT = ['printing.agent'];

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
                // The business's own settings — its requisites, its tax rates,
                // its website. The owner writes them; everybody below reads.
                'system.settings', 'settings.view',
                // Which modules this restaurant uses is the owner's call, not the
                // platform's: PATCH /api/v1/modules only ever writes their own
                // tenant settings, never the platform-wide flag.
                'system.modules',
                // Every till power, including approving someone else's void.
                ...array_keys(self::POS_PERMISSIONS),
                'dashboard.view',
            ],
        ));

        // ---- 3. Tarmoq (brend) menejeri — bir nechta filial ustidan ----
        $this->role('brand-manager')->syncPermissions($this->permissions(
            modules: self::MODULES,
            actions: ['view', 'create', 'update', 'manage'],
            extra: [
                'reports.export', 'system.statistics', 'branches.manage', 'users.invite',
                'settings.view', 'dashboard.view',
                ...array_keys(self::POS_PERMISSIONS),
            ],
        ));

        // ---- 4. Filial menejeri — kunlik operatsiyalar ----
        $this->role('branch-manager')->syncPermissions($this->permissions(
            modules: ['menu', 'orders', 'kitchen', 'tables', 'inventory', 'suppliers', 'staff', 'finance', 'crm', 'pos', 'board'],
            actions: ['view', 'create', 'update'],
            extra: [
                'analytics.view', 'staff.manage', 'finance.manage', 'reports.export', 'telegram.view',
                'dashboard.view',
                // Reads the VAT rate and the service charge; changes neither.
                'settings.view',
                /*
                 * Raising a guest's credit ceiling.
                 *
                 * The manager grants a void and a discount on this floor; a regular
                 * asking to sign for more than their limit is the same conversation
                 * with the same person. Without it the only people who could were
                 * the owner and the brand manager, and neither is in the room when a
                 * guest is standing at the till.
                 */
                'crm.manage',
                // The manager is the authority on the floor: they are who a
                // cashier walks to when a line has to come off a bill.
                'pos.manage', ...array_keys(self::POS_PERMISSIONS),
                /*
                 * Deciding whose evening carries a delivery.
                 *
                 * `POST orders/{order}/assign-courier` is guarded by this and
                 * not by `orders.update`, which every waiter and cashier holds:
                 * adding a dish to a bill and handing a rider their next drop
                 * are different powers. The manager on the floor is who does
                 * the second one when there is no intake desk on shift.
                 */
                'orders.manage',
            ],
        ));

        // ---- 5. Osh-boshi (chef) — menyu va oshxona egasi ----
        $this->role('chef')->syncPermissions($this->permissions(
            modules: ['menu', 'kitchen'],
            actions: ['view', 'create', 'update', 'delete', 'manage'],
            // The chef's till power is the stop-list, and that lives in Menu.
            // Here they only need to see what the floor is selling.
            extra: ['inventory.view', 'inventory.update', 'staff.view', 'orders.view', 'analytics.view', 'pos.view',
                'dashboard.view'],
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
            extra: ['menu.view', 'tables.view', 'tables.update', 'kitchen.view', 'crm.view', 'dashboard.view',
                ...self::POS_OPERATOR],
        ));

        // ---- 8. Barmen — bar chiptalari va ichimliklar ----
        $this->role('bartender')->syncPermissions($this->permissions(
            modules: ['kitchen'],
            actions: ['view', 'update'],
            // A bar tab is a bill: the bartender rings it up at their own screen.
            extra: ['menu.view', 'menu.update', 'orders.view', 'orders.update', 'inventory.view', 'dashboard.view',
                ...self::POS_OPERATOR],
        ));

        // ---- 9. Kassir — to'lovlar va kassa smenasi ----
        $this->role('cashier')->syncPermissions($this->permissions(
            modules: ['finance'],
            actions: ['view', 'create', 'update'],
            /*
             * `pos.drawer` and no `pos.approve`: the cashier moves the cash and
             * asks for a void; only a manager ever grants one.
             *
             * `crm.create` is here for one moment at the till: a guest paying
             * who is not on file. Without it the cashier could read the guest
             * list and edit a guest but not add one, so a first-time regular
             * either got no loyalty account at all or got somebody else's — the
             * cashier typing the number into whichever row was already open.
             * Creating a guest is the smallest of the three CRM powers they
             * already hold, and it is the one the queue behind them depends on.
             */
            extra: ['orders.view', 'orders.update', 'menu.view', 'crm.view', 'crm.create', 'crm.update', 'dashboard.view',
                ...self::POS_OPERATOR, 'pos.drawer'],
        ));

        // ---- 10. Hostes — stollar, bronlar, mehmonlarni kutib olish ----
        $this->role('host')->syncPermissions($this->permissions(
            modules: ['tables'],
            actions: ['view', 'create', 'update', 'manage'],
            extra: ['orders.view', 'crm.view', 'crm.create', 'menu.view', 'pos.view', 'dashboard.view'],
        ));

        /*
         * ---- 10a. Qabul operatori — telefon, Telegram, sayt, agregatorlar ----
         *
         * The design's ninth console role. Not a host with fewer permissions:
         * a host seats people who walked in, an operator answers people who did
         * not, and the two never share a shift or a screen. Merging them would
         * hand the intake queue to whoever is standing at the door.
         *
         * No `pos.*` at all — an operator books an order, never settles one —
         * and `crm.update` because the person on the phone is the one who
         * corrects a wrong address while the caller is still on the line.
         */
        $this->role('order-operator')->syncPermissions(
            Permission::whereIn('name', [
                'orders.view', 'orders.create', 'orders.update',
                /*
                 * Dispatch. The operator's screen has a "Yetkazish" tab whose
                 * whole content is riders and unassigned orders, and assigning
                 * one is the single write on it — the person answering the
                 * phone is who tells a courier where to go next.
                 */
                'orders.manage',
                'menu.view', 'crm.view', 'crm.create', 'crm.update', 'dashboard.view',
            ])->get()
        );

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
            extra: ['suppliers.view', 'suppliers.create', 'suppliers.update', 'menu.view', 'kitchen.view', 'pos.view',
                'dashboard.view'],
        ));

        // ---- 13. Buxgalter — moliya va hisobotlar ----
        $this->role('accountant')->syncPermissions($this->permissions(
            modules: ['finance'],
            actions: ['view', 'create', 'update', 'manage'],
            // Z-reports, fiscal receipts and cash variance — reads and re-sends,
            // never sells.
            extra: [
                /*
                 * The debtors' list, which is the accountant's screen.
                 *
                 * They held no `crm.*` at all, so `GET v1/crm/accounts` — the one
                 * report that explains the gap between what a day sold and what it
                 * banked — answered 403 for the only person whose job it is to read
                 * it. The rest of CRM stays shut: an accountant reconciles balances,
                 * they do not edit customers.
                 */
                'crm.view', 'suppliers.view', 'staff.view', 'analytics.view', 'reports.export', 'audit.view', 'pos.view', 'pos.manage',
                'dashboard.view',
                // The requisites go on every invoice they issue.
                'settings.view'],
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

        /*
         * ---- 16. Chop etish agenti — odam emas, jarayon ----
         *
         * A role for a machine, and the only one in this list. It holds exactly one
         * permission because the process behind it does exactly one thing: take the
         * next queued job, push bytes at a printer, report the outcome.
         *
         * Deliberately not `cook` and deliberately not a narrowed `kitchen.*`. The
         * agent runs unattended on a back-office PC, which makes its token the
         * easiest one in the building to walk away with — and on `kitchen.update`
         * that token could mark a table's food ready or start a docket nobody is
         * cooking, with the pass believing it. A printer that has been unplugged is
         * an inconvenience; a kitchen board that lies is a room full of wrong food.
         */
        $this->role('print-agent')->syncPermissions(self::PRINT_AGENT);
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
