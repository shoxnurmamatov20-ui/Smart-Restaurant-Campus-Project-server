<?php

declare(strict_types=1);

namespace Modules\Menu\Database\Seeders;

use App\Models\Tenant;
use App\Support\Tenancy\TenantContext;
use Illuminate\Database\Seeder;
use Modules\Menu\Models\MenuItem;
use Modules\Menu\Models\ModifierGroup;
use Modules\Menu\Models\ModifierOption;

/**
 * The modifier groups the design draws, on the dishes they belong to.
 *
 * Attached by station rather than to everything, because that is the honest
 * shape: doneness is a question about grilled meat and nonsense about tea, and
 * a demo where every dish asks about doneness teaches the wrong thing about the
 * model. Station is what the seeded menu actually carries, so it is what this
 * can key on without inventing a taxonomy.
 *
 * Idempotent — matched on the group's Uzbek name, so re-running re-attaches
 * rather than duplicating.
 */
final class MenuModifierSeeder extends Seeder
{
    /**
     * @var array<int, array{
     *     name: array<string, string>,
     *     multi: bool,
     *     min: int,
     *     max: int,
     *     stations: list<string>,
     *     options: array<int, array{array<string, string>, int}>
     * }>
     */
    private const GROUPS = [
        [
            'name' => ['uz' => 'Qo\'shimchalar', 'ru' => 'Добавки', 'en' => 'Add-ons'],
            'multi' => true,
            'min' => 0,
            'max' => 5,
            // Anything that comes off a hot line or a grill can be added to.
            'stations' => ['hot', 'grill'],
            'options' => [
                [['uz' => 'Qo\'shimcha pishloq', 'ru' => 'Доп. сыр', 'en' => 'Extra cheese'], 600_000],
                [['uz' => 'Qo\'shimcha go\'sht', 'ru' => 'Доп. мясо', 'en' => 'Extra meat'], 1_400_000],
                [['uz' => 'Achchiq sous', 'ru' => 'Острый соус', 'en' => 'Hot sauce'], 200_000],
                [['uz' => 'Piyozsiz', 'ru' => 'Без лука', 'en' => 'No onion'], 0],
            ],
        ],
        [
            'name' => ['uz' => 'Pishirish darajasi', 'ru' => 'Степень прожарки', 'en' => 'Doneness'],
            'multi' => false,
            'min' => 1,
            'max' => 1,
            // A question about grilled meat and nonsense about anything else.
            'stations' => ['grill'],
            'options' => [
                [['uz' => 'Kam', 'ru' => 'Слабая', 'en' => 'Rare'], 0],
                [['uz' => 'O\'rta', 'ru' => 'Средняя', 'en' => 'Medium'], 0],
                [['uz' => 'To\'liq', 'ru' => 'Полная', 'en' => 'Well done'], 0],
            ],
        ],
        [
            'name' => ['uz' => 'O\'lcham', 'ru' => 'Размер', 'en' => 'Size'],
            'multi' => false,
            'min' => 1,
            'max' => 1,
            'stations' => ['bar', 'cold'],
            'options' => [
                [['uz' => 'Kichik', 'ru' => 'Маленький', 'en' => 'Small'], 0],
                [['uz' => 'O\'rta', 'ru' => 'Средний', 'en' => 'Medium'], 800_000],
                [['uz' => 'Katta', 'ru' => 'Большой', 'en' => 'Large'], 1_600_000],
            ],
        ],
    ];

    public function run(): void
    {
        /*
         * The restaurant, set here rather than assumed.
         *
         * DatabaseSeeder sets a TenantContext before calling any module seeder,
         * so this worked when run as part of `db:seed` and wrote NOTHING
         * readable when run on its own: BelongsToTenant stamps from the
         * context, and with no context every row landed with tenant_id NULL —
         * invisible to row-level security, present in the table, owned by
         * nobody. Thirty-five pivot rows and thirteen groups had to be deleted.
         *
         * PosDatabaseSeeder already does this for the same reason.
         */
        $tenant = Tenant::query()->where('status', 'active')->first();

        if ($tenant === null) {
            $this->command?->warn('Faol restoran topilmadi — avval `php artisan db:seed`.');

            return;
        }

        app(TenantContext::class)->set($tenant);

        $attached = 0;

        foreach (self::GROUPS as $sort => $definition) {
            /*
             * Matched on the Uzbek name, which is the natural key: it is what a
             * manager types, and matching on the whole jsonb document would
             * depend on key order.
             *
             * Written as an explicit find-then-create rather than
             * `firstOrCreate`, because that helper passes its match attributes
             * to `create` as well — and `name->>'uz'` is a read expression, not
             * a column anything can be written to.
             */
            /** @var ModifierGroup|null $group */
            $group = ModifierGroup::query()
                ->whereRaw("name->>'uz' = ?", [$definition['name']['uz']])
                ->first();

            $group ??= ModifierGroup::query()->create([
                'name' => $definition['name'],
                'is_multi' => $definition['multi'],
                'min_choices' => $definition['min'],
                'max_choices' => $definition['max'],
                'sort' => $sort,
                'is_active' => true,
            ]);

            foreach ($definition['options'] as $index => [$name, $priceDelta]) {
                $exists = ModifierOption::query()
                    ->where('modifier_group_id', $group->id)
                    ->whereRaw("name->>'uz' = ?", [$name['uz']])
                    ->exists();

                if ($exists) {
                    continue;
                }

                ModifierOption::query()->create([
                    'modifier_group_id' => $group->id,
                    'name' => $name,
                    'price_delta' => $priceDelta,
                    'sort' => $index,
                    'is_active' => true,
                ]);
            }

            $items = MenuItem::query()
                ->whereIn('station', $definition['stations'])
                ->pluck('id');

            foreach ($items as $itemId) {
                /*
                 * `tenant_id` in the pivot attributes, explicitly.
                 *
                 * BelongsToTenant stamps MODELS on create; a pivot row is not a
                 * model and `syncWithoutDetaching` writes only the keys and what
                 * it is handed. So the column stayed null and row-level security
                 * hid every attachment — the dish had its groups in the table
                 * and the API answered "no questions about this dish".
                 *
                 * syncWithoutDetaching rather than sync: a dish may legitimately
                 * carry two of these groups, and sync would have each pass
                 * remove the previous one's work.
                 */
                $group->items()->syncWithoutDetaching([
                    $itemId => ['sort' => $sort, 'tenant_id' => $tenant->id],
                ]);
                $attached++;
            }
        }

        $this->command?->info('✅ Menyu qo\'shimchalari: '.count(self::GROUPS)." guruh, {$attached} bog'lanish.");
    }
}
