<?php

declare(strict_types=1);

namespace Modules\Menu\Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Modules\Menu\Models\MenuCategory;
use Modules\Menu\Models\MenuItem;
use Modules\Menu\Services\MenuSheetImporter;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * The spreadsheet import — `POST /v1/menu/import`.
 *
 * The one write on this platform that changes every price at once, so the
 * cases below are weighted towards the two ways that goes wrong: a price read
 * as the wrong number, and a rehearsal that turns out to have written.
 */
final class MenuImportTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
    }

    // =====================================================================
    // The price parser, on its own
    // =====================================================================

    /**
     * Every shape a real sheet writes money in.
     *
     * Tested directly rather than through the endpoint because this is the one
     * piece whose failure is silent: a price read as 42 instead of 42 000 does
     * not throw, it sells lunch for the price of a tea until somebody counts
     * the till.
     *
     * @return array<string, array{0: string, 1: int|null}>
     */
    public static function priceCells(): array
    {
        return [
            'a machine wrote it' => ['42000', 4_200_000],
            'a human wrote it' => ['42 000', 4_200_000],
            // The space Excel actually emits between thousands.
            'excel non-breaking space' => ["42\u{00A0}000", 4_200_000],
            'excel narrow no-break space' => ["42\u{202F}000", 4_200_000],
            'the column was formatted as currency' => ["42 000 so'm", 4_200_000],
            'a currency label in front' => ['UZS 12 500', 1_250_000],
            // The genuine ambiguity, decided by the digit count after the mark.
            'russian excel groups with a dot' => ['42.000', 4_200_000],
            'english excel groups with a comma' => ['42,000', 4_200_000],
            'a decimal comma' => ['42000,50', 4_200_050],
            'a decimal point, one place' => ['42000.5', 4_200_050],
            'both marks at once' => ['1 234 567,89', 123_456_789],
            'grouped twice' => ['1.234.567', 123_456_700],
            'free is a price' => ['0', 0],
            'padded with spaces' => ['  12 500  ', 1_250_000],

            // Refusals. Every one of these becomes a per-row report entry that
            // quotes the cell back — never a zero.
            'a blank cell' => ['', null],
            'nothing but spaces' => ['   ', null],
            'a word' => ['abc', null],
            'a sentence with a price in it' => ["narxi yo'q", null],
            // Two numbers in one cell: the second must never silently vanish.
            'a range' => ['42 000 va 50 000', null],
            'a negative' => ['-100', null],
            'digits with a letter inside' => ['12a34', null],
            'four decimal places' => ['42,0000', null],
            'more than ten million so\'m' => ['99 999 999 999', null],
        ];
    }

    #[DataProvider('priceCells')]
    public function test_a_price_cell_becomes_tiyin_or_a_refusal(string $cell, ?int $expected): void
    {
        $this->assertSame($expected, MenuSheetImporter::tiyinOf($cell));
    }

    // =====================================================================
    // The endpoint
    // =====================================================================

    public function test_a_dry_run_reports_everything_and_writes_nothing(): void
    {
        $tenant = $this->restaurant();
        $this->actingAsOwnerOf($tenant);

        $sheet = <<<'CSV'
        Nomi,Kategoriya,Narx,Tannarx,Sex
        Osh,Milliy taomlar,"42 000","18 000",issiq
        Somsa,Milliy taomlar,12000,5000,shirinlik
        CSV;

        $response = $this->import($sheet)->assertOk();

        $response->assertJsonPath('data.dry_run', true);
        $response->assertJsonPath('data.columns', ['Nomi', 'Kategoriya', 'Narx', 'Tannarx', 'Sex']);
        $response->assertJsonPath('data.mapping', [
            'Nomi' => 'name',
            'Kategoriya' => 'category',
            'Narx' => 'price',
            'Tannarx' => 'cost',
            'Sex' => 'station',
        ]);
        $response->assertJsonPath('data.summary', ['rows' => 2, 'created' => 2, 'updated' => 0, 'skipped' => 0]);
        $response->assertJsonPath('data.categories_created', ['Milliy taomlar']);
        $response->assertJsonPath('data.rows', []);
        $response->assertJsonPath('data.rows_truncated', false);

        // The whole point: the report above describes a menu that does not
        // exist yet, and must not exist until somebody says dry_run=false.
        $this->assertSame(0, MenuItem::query()->count());
        $this->assertSame(0, MenuCategory::query()->count());
    }

    public function test_the_real_write_creates_the_dishes_and_the_sections(): void
    {
        $tenant = $this->restaurant();
        $this->actingAsOwnerOf($tenant);

        $sheet = <<<'CSV'
        Nomi,Kategoriya,Narx,Tannarx,Sex,Allergenlar
        Osh,Milliy taomlar,"42 000","18 000",issiq,"gluten, sut"
        Sezar,Salatlar,36000,,sovuq,
        CSV;

        $response = $this->import($sheet, ['dry_run' => 'false'])->assertOk();

        $response->assertJsonPath('data.dry_run', false);
        $response->assertJsonPath('data.summary', ['rows' => 2, 'created' => 2, 'updated' => 0, 'skipped' => 0]);
        $response->assertJsonPath('data.categories_created', ['Milliy taomlar', 'Salatlar']);

        $osh = MenuItem::query()->where('sku', 'OSH')->firstOrFail();

        // Tiyin, parsed once and server-side: 42 000 so'm is 4 200 000 tiyin.
        $this->assertSame(4_200_000, $osh->price);
        $this->assertSame(1_800_000, $osh->cost_price);
        $this->assertSame('hot', $osh->station);
        $this->assertSame(['gluten', 'sut'], $osh->allergens);

        /*
         * The three-language column, filled in ONE language.
         *
         * The sheet is Uzbek and the restaurant is Uzbek, so `uz` is written
         * and the other two stay absent rather than being filled with a copy —
         * otherwise nothing afterwards can tell "not translated yet" from
         * "translated, same word", and a Russian guest reads Uzbek believing it
         * is Russian.
         */
        $this->assertSame(['uz' => 'Osh'], $osh->name);

        $sezar = MenuItem::query()->where('sku', 'SEZAR')->firstOrFail();
        $this->assertSame(3_600_000, $sezar->price);
        // A blank cost cell means "the sheet does not say", not zero: a zero
        // cost claims a 100% margin, which is a number somebody would act on.
        $this->assertNull($sezar->cost_price);

        $this->assertSame(2, MenuCategory::query()->count());
        $this->assertSame('Milliy taomlar', MenuCategory::query()->where('slug', 'milliy-taomlar')->firstOrFail()->name['uz']);
    }

    public function test_a_second_import_updates_by_sku_and_keeps_the_other_languages(): void
    {
        $tenant = $this->restaurant();
        $this->actingAsOwnerOf($tenant);
        $category = MenuCategory::factory()->create(['tenant_id' => $tenant->id]);

        $dish = MenuItem::factory()->create([
            'tenant_id' => $tenant->id,
            'menu_category_id' => $category->id,
            'sku' => 'OSH-001',
            'name' => ['uz' => 'Osh', 'ru' => 'Плов', 'en' => 'Pilaf'],
            'price' => 4_000_000,
        ]);

        $sheet = <<<'CSV'
        SKU;Nomi;Narx
        OSH-001;Osh (Toshkent);45 000
        CSV;

        $this->import($sheet, ['dry_run' => 'false'])->assertOk()
            ->assertJsonPath('data.summary', ['rows' => 1, 'created' => 0, 'updated' => 1, 'skipped' => 0]);

        $dish->refresh();

        $this->assertSame(4_500_000, $dish->price);
        $this->assertSame('Osh (Toshkent)', $dish->name['uz']);
        // The Russian a marketer typed last month survives a price import.
        $this->assertSame('Плов', $dish->name['ru']);
        $this->assertSame('Pilaf', $dish->name['en']);
        $this->assertSame(1, MenuItem::query()->count());
    }

    public function test_a_price_that_cannot_be_read_refuses_only_its_own_row(): void
    {
        $tenant = $this->restaurant();
        $this->actingAsOwnerOf($tenant);

        $sheet = <<<'CSV'
        Nomi,Kategoriya,Narx
        Osh,Milliy taomlar,42 000
        Manti,Milliy taomlar,kelishilgan
        Somsa,Milliy taomlar,12000
        CSV;

        $response = $this->import($sheet, ['dry_run' => 'false'])->assertOk();

        $response->assertJsonPath('data.summary', ['rows' => 3, 'created' => 2, 'updated' => 0, 'skipped' => 1]);
        // Row 3 of the sheet — the header is row 1, which is what the person
        // reading this sees down the side of their spreadsheet.
        $response->assertJsonPath('data.rows.0.row', 3);
        $this->assertStringContainsString('kelishilgan', (string) $response->json('data.rows.0.reason'));

        // The other two landed. A sheet of 200 dishes with two bad prices is an
        // import of 198, not a failure — and never a dish priced at zero.
        $this->assertSame(2, MenuItem::query()->count());
        $this->assertNull(MenuItem::query()->where('sku', 'MANTI')->first());
    }

    public function test_a_sheet_whose_headers_nobody_recognises_asks_for_a_mapping(): void
    {
        $tenant = $this->restaurant();
        $this->actingAsOwnerOf($tenant);

        $sheet = <<<'CSV'
        Ustun A,Ustun B,Ustun C
        Osh,Milliy taomlar,42 000
        CSV;

        $refusal = $this->import($sheet)->assertApiError('menu.import_columns_unmapped');

        // The refusal carries what the console's mapping dialog is drawn from,
        // so an unrecognised sheet is one dialog away from importing.
        $refusal->assertJsonPath('error.columns', ['Ustun A', 'Ustun B', 'Ustun C']);
        $refusal->assertJsonPath('error.required', ['name', 'price']);

        // And with the answers, the same file imports.
        $this->import($sheet, [
            'dry_run' => 'false',
            'mapping' => json_encode(['Ustun A' => 'name', 'Ustun B' => 'category', 'Ustun C' => 'price']),
        ])->assertOk()->assertJsonPath('data.summary.created', 1);

        $this->assertSame(4_200_000, MenuItem::query()->firstOrFail()->price);
    }

    public function test_a_workbook_renamed_to_csv_is_refused_by_name(): void
    {
        $tenant = $this->restaurant();
        $this->actingAsOwnerOf($tenant);

        // The ZIP local-file header every .xlsx, .ods and .numbers begins with.
        $this->upload(UploadedFile::fake()->createWithContent('menu.csv', "PK\x03\x04\x14\x00garbage"))
            ->assertApiError('menu.import_not_csv');
    }

    public function test_an_xlsx_is_refused_before_it_is_read(): void
    {
        $tenant = $this->restaurant();
        $this->actingAsOwnerOf($tenant);

        $this->upload(UploadedFile::fake()->create('menu.xlsx', 40))
            ->assertApiValidationErrors('file');
    }

    public function test_a_file_with_no_rows_is_refused(): void
    {
        $tenant = $this->restaurant();
        $this->actingAsOwnerOf($tenant);

        $this->import("Nomi,Narx\n\n\n")->assertApiError('menu.import_empty');
    }

    public function test_a_waiter_cannot_import_a_menu(): void
    {
        $tenant = $this->restaurant();

        $waiter = User::factory()->create(['tenant_id' => $tenant->id]);
        $waiter->assignRole('waiter');
        $this->actingAs($waiter);

        $this->import("Nomi,Kategoriya,Narx\nOsh,Milliy,42 000\n", ['dry_run' => 'false'])
            ->assertStatus(403);

        $this->assertSame(0, MenuItem::query()->count());
    }

    public function test_signing_in_is_required(): void
    {
        $this->import("Nomi,Kategoriya,Narx\nOsh,Milliy,42 000\n")->assertStatus(401);
    }

    public function test_an_import_never_touches_another_restaurants_menu(): void
    {
        $theirs = Tenant::query()->create([
            'name' => 'City Cafe',
            'slug' => 'city-cafe',
            'country_code' => 'UZ',
            'locale' => 'uz',
            'timezone' => 'Asia/Tashkent',
            'status' => 'active',
        ]);

        $theirCategory = MenuCategory::factory()->create(['tenant_id' => $theirs->id]);
        $theirDish = MenuItem::factory()->create([
            'tenant_id' => $theirs->id,
            'menu_category_id' => $theirCategory->id,
            'sku' => 'OSH-001',
            'price' => 9_900_000,
        ]);

        $mine = $this->restaurant();
        $this->actingAsOwnerOf($mine);

        $sheet = <<<'CSV'
        SKU,Nomi,Kategoriya,Narx
        OSH-001,Osh,Milliy taomlar,42 000
        CSV;

        // The same SKU, and it CREATES rather than updates: the other
        // restaurant's dish is not visible, so it is not a match.
        $this->import($sheet, ['dry_run' => 'false'])->assertOk()
            ->assertJsonPath('data.summary', ['rows' => 1, 'created' => 1, 'updated' => 0, 'skipped' => 0]);

        $this->assertSame(9_900_000, $theirDish->refresh()->price);
        $this->assertSame(4_200_000, MenuItem::query()->where('tenant_id', $mine->id)->firstOrFail()->price);
    }

    // =====================================================================
    // Harness
    // =====================================================================

    private function restaurant(string $slug = 'osh-markazi'): Tenant
    {
        return Tenant::query()->create([
            'name' => 'Osh Markazi',
            'slug' => $slug,
            'country_code' => 'UZ',
            'locale' => 'uz',
            'timezone' => 'Asia/Tashkent',
            'status' => 'active',
        ]);
    }

    private function actingAsOwnerOf(Tenant $tenant): User
    {
        $user = User::factory()->create(['tenant_id' => $tenant->id]);
        $user->assignRole('owner');
        $this->actingAs($user);

        return $user;
    }

    /** @param array<string, string> $extra */
    private function import(string $csv, array $extra = []): TestResponse
    {
        return $this->upload(UploadedFile::fake()->createWithContent('menyu.csv', $csv), $extra);
    }

    /**
     * Multipart goes through `call()`, which does not mint a key — see TestCase.
     *
     * @param  array<string, string>  $extra
     */
    private function upload(UploadedFile $file, array $extra = []): TestResponse
    {
        return $this->withHeaders([
            'Accept' => 'application/json',
            'Idempotency-Key' => (string) Str::uuid(),
        ])->post('/api/v1/menu/import', [...$extra, 'file' => $file]);
    }
}
