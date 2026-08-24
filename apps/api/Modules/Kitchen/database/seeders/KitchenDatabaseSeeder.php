<?php

declare(strict_types=1);

namespace Modules\Kitchen\Database\Seeders;

use App\Support\Tenancy\BranchContext;
use Illuminate\Database\Seeder;
use Modules\Kitchen\Models\KitchenStation;
use Modules\Kitchen\Models\Printer;

/**
 * The five stations every kitchen in this platform routes to, and the three
 * printers a venue is actually wired with.
 *
 * The station codes must match MenuItem::STATIONS or a dish would be dispatched
 * to a screen nobody is watching.
 */
final class KitchenDatabaseSeeder extends Seeder
{
    /** @var array<int, array{code: string, name: string, sla: int, sort: int}> */
    private const STATIONS = [
        ['code' => 'hot', 'name' => 'Issiq sex', 'sla' => 20, 'sort' => 10],
        ['code' => 'cold', 'name' => 'Sovuq sex', 'sla' => 10, 'sort' => 20],
        ['code' => 'grill', 'name' => 'Mangal', 'sla' => 25, 'sort' => 30],
        ['code' => 'bar', 'name' => 'Bar', 'sla' => 5, 'sort' => 40],
        ['code' => 'pastry', 'name' => 'Konditer', 'sla' => 8, 'sort' => 50],
    ];

    /**
     * @var array<int, array{code: string, label: string, role: string, target: string, drawer: bool, default: bool}>
     */
    private const PRINTERS = [
        ['code' => 'pass', 'label' => 'pass', 'role' => 'kitchen', 'target' => '10.20.0.11:9100', 'drawer' => false, 'default' => true],
        // The drawer is a solenoid on this printer's kick port, which is why
        // `opens_drawer` is a property of a printer and not of a till.
        ['code' => 'kassa', 'label' => 'kassa', 'role' => 'receipt', 'target' => '10.20.0.12:9100', 'drawer' => true, 'default' => true],
        ['code' => 'bar', 'label' => 'bar', 'role' => 'kitchen', 'target' => '10.20.0.13:9100', 'drawer' => false, 'default' => false],
    ];

    public function run(): void
    {
        foreach (self::STATIONS as $station) {
            KitchenStation::query()->updateOrCreate(
                ['code' => $station['code']],
                [
                    'name' => $station['name'],
                    'sla_minutes' => $station['sla'],
                    'sort_order' => $station['sort'],
                    'is_active' => true,
                ],
            );
        }

        $printers = $this->seedPrinters();

        $this->command?->info(sprintf(
            '✅ Kitchen: %d sex, %d printer yaratildi.',
            count(self::STATIONS),
            $printers,
        ));
    }

    /**
     * Three printers, at the venue the seeded day happens at.
     *
     * Which is what a real restaurant of this size is actually wired with: one
     * at the pass, one at the till with the drawer under it, and one at the bar.
     * Not one per station — five printers is what a large kitchen grows into,
     * and seeding that would make the demo look like a configuration somebody
     * has to build before anything prints, when the whole point of the routing
     * is that they do not. Four of the five stations name no printer and fall
     * through to the pass, which is the arrangement most venues run.
     *
     * The bar is the exception and earns it: bar tickets are drinks, they are
     * made while the food is still cooking, and a bartender walking to the pass
     * to read them is a bartender not making drinks.
     */
    private function seedPrinters(): int
    {
        $branch = app(BranchContext::class)->branch();

        if ($branch === null) {
            // Seeded outside a venue — nothing to wire a printer to. The
            // stations above are still worth having.
            return 0;
        }

        foreach (self::PRINTERS as $printer) {
            Printer::query()->updateOrCreate(
                ['code' => $printer['code']],
                [
                    'branch_id' => $branch->id,
                    'name' => $branch->name.' — '.$printer['label'],
                    'role' => $printer['role'],
                    'connection' => 'agent',
                    'target' => $printer['target'],
                    'columns' => 48,
                    'codepage' => 'cp866',
                    'cuts' => true,
                    'opens_drawer' => $printer['drawer'],
                    'is_active' => true,
                    'is_default' => $printer['default'],
                ],
            );
        }

        /*
         * The bar station is the only one pointed anywhere. Everything else is
         * left null on purpose, so a fresh install exercises the fallback that
         * most restaurants actually live on.
         */
        $bar = Printer::query()->where('code', 'bar')->value('id');

        KitchenStation::query()->where('code', 'bar')->update(['printer_id' => $bar]);

        return count(self::PRINTERS);
    }
}
