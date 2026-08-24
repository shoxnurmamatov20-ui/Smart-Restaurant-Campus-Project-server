<?php

declare(strict_types=1);

namespace Modules\Menu\Services;

use App\Support\Errors\ApiException;
use App\Support\Tenancy\TenantContext;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Modules\Menu\Models\MenuCategory;
use Modules\Menu\Models\MenuItem;
use Throwable;

/**
 * The accountant's spreadsheet, turned into dishes.
 *
 * A restaurant does not build its menu in this console — it builds it in Excel,
 * once, and then argues about the prices for a week. So the import is not a
 * convenience: it is how the first two hundred rows of a tenant's menu actually
 * arrive, and it is the only write on this platform where one mistake changes
 * every price at once.
 *
 * Three properties follow from that, and they are the whole design:
 *
 *  1. **A price is parsed once, here, into integer tiyin.** See `tiyinOf()`.
 *     A sheet says "42 000", "42 000 so'm" or "42000,50" and all three are the
 *     same number to the person who typed them. A price that cannot be read is
 *     a refusal naming the row — never a silent zero, which is a dish given
 *     away all evening before anybody notices.
 *  2. **The dry run is the real write, rolled back.** Not a separate validator.
 *  3. **A refusal is per row.** A sheet of 200 dishes with two bad prices
 *     imports 198 and reports the two; a half-applied import that stopped at
 *     row 41 would leave a restaurant selling at two different price lists with
 *     nobody able to say where the boundary was.
 *
 * CSV only, deliberately — see `read()`.
 */
final class MenuSheetImporter
{
    /**
     * What a sheet column can feed. The console draws its mapping dialog from
     * this list, so the order is the order a human reads them in.
     *
     * @var list<string>
     */
    public const FIELDS = ['name', 'category', 'price', 'cost', 'station', 'allergens', 'sku', 'description'];

    /** Without these two a row is not a dish, so a sheet without them is not an import. */
    public const REQUIRED_FIELDS = ['name', 'price'];

    /**
     * The most data rows one upload may carry.
     *
     * Not a performance ceiling — 5 000 rows is a couple of seconds. It is a
     * blast radius: this endpoint rewrites prices, and a person who meant to
     * upload one restaurant's menu and uploaded the group's whole catalogue
     * should hear "that is more than a menu" rather than watch it apply.
     */
    public const MAX_ROWS = 5_000;

    /**
     * How many refusals travel back in the report.
     *
     * A sheet whose every price uses a decimal comma the parser cannot read
     * produces one refusal per row. At five thousand rows and a sentence of
     * Uzbek each that is roughly a megabyte of JSON, rendered into a list
     * nobody scrolls past the tenth entry of — and the tenth entry already
     * shows the pattern, because the pattern is always the column, not the row.
     * `summary.skipped` still carries the true count, and `rows_truncated`
     * says out loud that the list is a sample.
     */
    public const MAX_REPORTED_ROWS = 200;

    /** 10 000 000 so'm, the same ceiling `StoreMenuItemRequest` puts on a typed price. */
    private const MAX_PRICE_TIYIN = 1_000_000_000;

    /**
     * Header names this platform recognises without being told, normalised by
     * `normalise()` — lowercase, letters and digits only.
     *
     * Three languages because the sheet was written by whoever does the books,
     * and that person's Excel is as often Russian as Uzbek. An unrecognised
     * header is not an error: the console sends an explicit `mapping` and that
     * always wins.
     *
     * @var array<string, list<string>>
     */
    private const SYNONYMS = [
        'name' => ['nomi', 'nom', 'taom', 'taomnomi', 'pozitsiya', 'mahsulot',
            'название', 'наименование', 'блюдо', 'позиция', 'товар',
            'name', 'item', 'dish', 'title', 'product'],
        'category' => ['kategoriya', 'kategoriyasi', 'bolim', 'turkum', 'guruh',
            'категория', 'раздел', 'группа',
            'category', 'section', 'group'],
        'price' => ['narx', 'narxi', 'sotuvnarxi', 'summa',
            'цена', 'стоимость', 'ценапродажи',
            'price', 'saleprice', 'sellprice'],
        'cost' => ['tannarx', 'tannarxi', 'xarajat',
            'себестоимость', 'закупка', 'закупочнаяцена',
            'cost', 'costprice', 'foodcost'],
        'station' => ['sex', 'sexi', 'oshxona',
            'цех', 'станция',
            'station', 'line', 'kitchen'],
        'allergens' => ['allergen', 'allergenlar',
            'аллерген', 'аллергены',
            'allergens', 'allergen'],
        'sku' => ['sku', 'kod', 'kodi', 'artikul',
            'артикул', 'код',
            'code', 'article'],
        'description' => ['tavsif', 'izoh', 'tarif',
            'описание', 'комментарий',
            'description', 'notes', 'comment'],
    ];

    /**
     * The five stations the kitchen actually has (`MenuItem::STATIONS`), and
     * the words a sheet calls them by.
     *
     * An unrecognised station is a per-row refusal rather than a default,
     * because the station is a printer: a dish quietly routed to "hot" prints
     * on the wrong wall and is cooked by nobody.
     *
     * @var array<string, list<string>>
     */
    private const STATION_WORDS = [
        'hot' => ['issiq', 'issiqsex', 'hot', 'hotline', 'горячий', 'горячийцех', 'горячая'],
        'cold' => ['sovuq', 'sovuqsex', 'cold', 'coldline', 'холодный', 'холодныйцех', 'холодная'],
        'grill' => ['grill', 'mangal', 'гриль', 'мангал', 'bbq'],
        'bar' => ['bar', 'бар', 'ichimlik', 'ichimliklar', 'напитки', 'drinks'],
        'pastry' => ['pastry', 'shirinlik', 'shirinliklar', 'qandolat', 'nonvoyxona',
            'кондитерский', 'кондитерка', 'выпечка', 'bakery', 'dessert', 'десерт'],
    ];

    /** At most this many allergen words per dish — a cell, not an essay. */
    private const MAX_ALLERGENS = 20;

    public function __construct(private readonly TenantContext $tenants) {}

    // =====================================================================
    // The price parser
    // =====================================================================

    /**
     * One cell of a spreadsheet, as integer tiyin — or null when it is not a
     * price at all.
     *
     * Pure, static and separate from everything else in this class on purpose:
     * it is the single most consequential line of the whole feature and it has
     * to be testable without a database, a tenant or a file.
     *
     * What it accepts, and why each shape exists in the wild:
     *
     *   "42000"        → 4 200 000   a machine wrote it
     *   "42 000"       → 4 200 000   a human wrote it; the space is a grouping mark
     *   "42 000"       → 4 200 000   Excel wrote it — that space is U+00A0
     *   "42 000 so'm"  → 4 200 000   the column was formatted as currency
     *   "42.000"       → 4 200 000   Russian Excel; the dot IS the grouping mark
     *   "42,000"       → 4 200 000   English Excel; so is the comma
     *   "42000,50"     → 4 200 050   a decimal comma
     *   "42 000.5"     → 4 200 050   a decimal point, one place
     *   "1 234 567,89" → 123 456 789 both marks at once
     *
     * The one genuine ambiguity is a single separator: "42.000" could be forty
     * two so'm or forty two thousand. The rule is the count of digits after it
     * — exactly three means grouping, one or two means a fraction, anything
     * else is a typo — and it is the right rule for this currency, because no
     * restaurant prices a dish at 42 so'm and every restaurant prices one at
     * 42 000.
     *
     * What it refuses, all of it by answering null rather than guessing:
     * a blank cell, a negative, a number wrapped in a sentence ("narxi 42 000
     * dan boshlanadi"), more than two decimal places, and anything above ten
     * million so'm. Refusing is safe here precisely because the caller turns a
     * null into a refusal that names the row and quotes the cell back.
     */
    public static function tiyinOf(string $raw): ?int
    {
        // Every space Excel emits — ordinary, non-breaking, narrow no-break,
        // thin — collapsed to one plain one. `\p{Zs}` is the Unicode class for
        // "space separator" and covers all of them; the literal escape is kept
        // beside it because U+00A0 is the one that actually arrives.
        $text = trim(preg_replace('/[\p{Zs}\x{00A0}]+/u', ' ', trim($raw)) ?? '');

        if ($text === '') {
            return null;
        }

        /*
         * The number has to BE the cell, not hide inside it.
         *
         * A currency label on either side is fine — that is a column format,
         * not prose. A digit anywhere in the tail is not: "42 000 dan" is a
         * price, "42 000 va 50 000" is two, and the second must never silently
         * become the first.
         */
        if (preg_match('/^[^\d,.-]*(-?\d[\d .,]*)[^\d,.]*$/u', $text, $match) !== 1) {
            return null;
        }

        $number = str_replace(' ', '', $match[1]);

        // A menu price below zero is a typo in the sheet, not a discount.
        if (str_starts_with($number, '-')) {
            return null;
        }

        $decimalAt = self::decimalPositionIn($number);

        if ($decimalAt === false) {
            return null;
        }

        $whole = str_replace(['.', ','], '', $decimalAt === null ? $number : substr($number, 0, $decimalAt));
        $fraction = $decimalAt === null ? '' : substr($number, $decimalAt + 1);

        // 12 digits is far past the ceiling below and safely inside a 64-bit
        // int; without the length check a 30-digit cell would overflow the cast
        // and land as some other number entirely.
        if ($whole === '' || strlen($whole) > 12 || preg_match('/^\d+$/', $whole) !== 1) {
            return null;
        }

        if ($fraction !== '' && preg_match('/^\d{1,2}$/', $fraction) !== 1) {
            return null;
        }

        $tiyin = ((int) $whole) * 100 + (int) str_pad($fraction, 2, '0');

        return $tiyin > self::MAX_PRICE_TIYIN ? null : $tiyin;
    }

    /**
     * Where the decimal separator is in a digits-and-separators string.
     *
     * Null means "there is none, every separator groups thousands"; false means
     * the string is not a number anybody wrote on purpose.
     */
    private static function decimalPositionIn(string $number): int|null|false
    {
        $dots = substr_count($number, '.');
        $commas = substr_count($number, ',');

        // Both marks present: the LAST one is the decimal, whichever it is, and
        // the other groups. "1.234,56" and "1,234.56" are the same money.
        if ($dots > 0 && $commas > 0) {
            $at = max(strrpos($number, '.'), strrpos($number, ','));

            return strlen($number) - $at - 1 > 2 ? false : $at;
        }

        // Two or more of one mark and none of the other can only be grouping:
        // "1.234.567" has no reading as a fraction.
        if ($dots + $commas !== 1) {
            return null;
        }

        $at = $dots === 1 ? strrpos($number, '.') : strrpos($number, ',');
        $after = strlen($number) - $at - 1;

        // The ambiguity, decided: three digits is a thousand, one or two is a
        // fraction, four or more is somebody's typo.
        return match (true) {
            $after === 3 => null,
            $after <= 2 => $at,
            default => false,
        };
    }

    // =====================================================================
    // Reading the sheet
    // =====================================================================

    /**
     * The uploaded file as a header row and a list of data rows.
     *
     * CSV only. An .xlsx is a ZIP archive of XML and reading one needs a
     * spreadsheet library nobody has installed here — and adding a dependency
     * to this platform is a decision taken with the user, not a side effect of
     * an import. So the console's import dialog offers CSV, Excel's own
     * "Save as → CSV UTF-8" is one menu item away, and a file that is really a
     * workbook is refused by name rather than parsed into nonsense.
     *
     * Three things this has to survive, all of them normal rather than
     * exotic, because the file was made by Excel on somebody's laptop:
     *
     *  - a UTF-8 byte-order mark, which turns the first header into "\u{FEFF}Nomi";
     *  - Windows-1251, which is what Russian Excel still writes when the user
     *    picks plain "CSV" rather than "CSV UTF-8";
     *  - a semicolon delimiter, which is what Excel writes wherever the decimal
     *    separator is a comma — that is most of this platform's market.
     *
     * @return array{columns: list<string>, rows: list<list<string>>}
     */
    public function read(UploadedFile $file): array
    {
        $path = $file->getRealPath();
        $content = $path === false ? '' : (string) file_get_contents($path);

        // "PK\x03\x04" is the ZIP local file header, which is what an .xlsx,
        // an .ods and a .numbers all start with. Caught here rather than left
        // to the mime rule so the answer can say what to do about it.
        if (str_starts_with($content, "PK\x03\x04")) {
            throw ApiException::of('menu.import_not_csv');
        }

        $content = self::asUtf8($content);

        if (trim($content) === '') {
            throw ApiException::of('menu.import_empty');
        }

        $delimiter = self::delimiterOf($content);
        $records = self::parseCsv($content, $delimiter);

        $header = array_shift($records);

        if ($header === null) {
            throw ApiException::of('menu.import_empty');
        }

        $columns = array_map(static fn (string $cell): string => trim($cell), $header);

        // A header of nothing but empty cells is a file with no header, which
        // is a different mistake from an empty file and the same refusal.
        if (implode('', $columns) === '') {
            throw ApiException::of('menu.import_empty');
        }

        // Excel exports trail blank lines after the last dish; they are not
        // rows anybody typed and must not count towards the cap or the summary.
        $rows = array_values(array_filter(
            $records,
            static fn (array $row): bool => trim(implode('', $row)) !== '',
        ));

        if ($rows === []) {
            throw ApiException::of('menu.import_empty');
        }

        if (count($rows) > self::MAX_ROWS) {
            throw ApiException::of('menu.import_too_many_rows', meta: [
                'rows' => count($rows),
                'max_rows' => self::MAX_ROWS,
            ]);
        }

        return ['columns' => $columns, 'rows' => $rows];
    }

    /**
     * Which sheet column feeds which field.
     *
     * The client's own mapping wins wherever it names a column that exists —
     * it came from a human looking at a dialog, and no synonym table beats
     * that. Everything it leaves alone is guessed from the header.
     *
     * Resolved server-side rather than trusted from the client because the
     * mapping decides which cell becomes money, and a price parsed in the
     * browser is a second implementation of `tiyinOf()`.
     *
     * @param list<string> $columns
     * @param array<string, string> $requested column name → field
     *
     * @return array<string, string> column name → field, only for columns that exist
     */
    public function resolveMapping(array $columns, array $requested): array
    {
        $resolved = [];
        $taken = [];

        foreach ($columns as $column) {
            $field = $requested[$column] ?? self::guessField($column);

            // One column per field. A sheet with "Narx" and "Narx (dostavka)"
            // both guessed as `price` uses the first and reports it, so the
            // console's dialog can show what happened and let a human move it.
            if ($field === null || isset($taken[$field])) {
                continue;
            }

            $resolved[$column] = $field;
            $taken[$field] = true;
        }

        return $resolved;
    }

    // =====================================================================
    // Applying it
    // =====================================================================

    /**
     * Read every row, write what is valid, and answer with what happened.
     *
     * **The dry run is the real write, rolled back**, and that is the only kind
     * of dry run worth shipping. A separate "validate only" pass is a second
     * implementation of every rule in this file — the SKU regex, the category
     * lookup, the cost-below-price check, the unique index on
     * (tenant_id, sku) — and the two drift within a month. When they drift the
     * dry run blesses a sheet the write then refuses, which is worse than
     * having no dry run at all: the manager has already told the owner it was
     * checked.
     *
     * Rolling back the genuine article also means the database's own
     * constraints take part. A hand-written validator cannot know that a SKU is
     * still held by a soft-deleted row; PostgreSQL does, and says so in both
     * modes identically.
     *
     * One transaction for the whole sheet either way, so a write cannot
     * half-apply: 41 dishes at the new price and 7 at the old, with nobody able
     * to name the boundary, is the failure this endpoint exists to prevent.
     *
     * @param list<string> $columns
     * @param array<string, string> $mapping column name → field
     * @param list<list<string>> $rows
     *
     * @return array<string, mixed>
     */
    public function import(array $columns, array $mapping, array $rows, bool $dryRun, string $locale): array
    {
        $indexes = self::fieldIndexes($columns, $mapping);

        foreach (self::REQUIRED_FIELDS as $required) {
            if (! isset($indexes[$required])) {
                /*
                 * The columns and what was recognised travel with the refusal.
                 * That is exactly what the console's mapping dialog is drawn
                 * from, so a sheet whose headers nobody guessed is one dialog
                 * away from importing rather than a dead end.
                 */
                throw ApiException::of('menu.import_columns_unmapped', field: $required, meta: [
                    'columns' => $columns,
                    'mapping' => $mapping,
                    'required' => self::REQUIRED_FIELDS,
                ]);
            }
        }

        DB::beginTransaction();

        try {
            $report = $this->applyRows($indexes, $rows, $locale);
        } catch (Throwable $failure) {
            DB::rollBack();

            throw $failure;
        }

        /*
         * The rollback that makes it a rehearsal.
         *
         * One side effect does survive it: `InvalidatesMenuCache` bumps the
         * restaurant's menu cache version on save, and that counter is in Redis
         * rather than in the transaction. A dry run therefore costs one cold
         * menu read for the next guest. That is the price of rehearsing with
         * the real write path, and it is the right way round — the alternative
         * trades a cache miss for a validator that can lie.
         */
        if ($dryRun) {
            DB::rollBack();
        } else {
            DB::commit();
        }

        return [
            'dry_run' => $dryRun,
            'locale' => $locale,
            'columns' => $columns,
            'mapping' => $mapping,
            'summary' => $report['summary'],
            'categories_created' => $report['categories_created'],
            'rows' => array_slice($report['refusals'], 0, self::MAX_REPORTED_ROWS),
            'rows_truncated' => count($report['refusals']) > self::MAX_REPORTED_ROWS,
        ];
    }

    /**
     * @param array<string, int> $indexes field → column index
     * @param list<list<string>> $rows
     *
     * @return array{summary: array<string, int>, categories_created: list<string>, refusals: list<array{row: int, reason: string}>}
     */
    private function applyRows(array $indexes, array $rows, string $locale): array
    {
        $tenantId = $this->tenants->id();

        /*
         * The whole menu, in memory, once.
         *
         * A restaurant's menu is tens to hundreds of dishes — the console's own
         * seam already asks for 200 in one page — so matching in PHP costs one
         * query instead of two per row, and a 5 000-row sheet stays a couple of
         * seconds rather than ten thousand round trips.
         */
        $bySku = [];
        $byName = [];

        foreach (MenuItem::withTrashed()->get() as $dish) {
            $bySku[self::normaliseSku($dish->sku)] ??= $dish;

            foreach (self::namesOf($dish) as $known) {
                // Live dishes claim a name first: a trashed dish must never
                // shadow the one that replaced it.
                if (! isset($byName[$known]) || ($byName[$known]->trashed() && ! $dish->trashed())) {
                    $byName[$known] = $dish;
                }
            }
        }

        $categories = [];

        /*
         * Two maps, and the second one is not redundant.
         *
         * Matching must only ever find a LIVE section — a sheet naming
         * "Salatlar" when that section was archived means a new one. But the
         * unique index on (tenant_id, slug) does not care that `deleted_at` is
         * set, so the archived row still owns "salatlar" and an insert reusing
         * it fails at the database. `$slugsTaken` carries the trashed ones so
         * `createCategory()` can step around them.
         */
        $slugsTaken = [];

        foreach (MenuCategory::withTrashed()->get() as $section) {
            $slugsTaken[self::normalise($section->slug)] = true;

            if ($section->trashed()) {
                continue;
            }

            $categories[self::normalise($section->slug)] ??= $section;

            foreach (self::namesOf($section) as $known) {
                $categories[$known] ??= $section;
            }
        }

        $summary = ['rows' => count($rows), 'created' => 0, 'updated' => 0, 'skipped' => 0];
        $categoriesCreated = [];
        $refusals = [];
        $seen = [];

        foreach ($rows as $offset => $row) {
            // The sheet's own row number, header counted as row 1 — what the
            // person reading the refusal sees down the side of their Excel.
            $number = $offset + 2;
            $cell = static fn (string $field): string => trim($row[$indexes[$field] ?? -1] ?? '');

            $refuse = function (string $reason) use (&$refusals, &$summary, $number): void {
                $refusals[] = ['row' => $number, 'reason' => $reason];
                $summary['skipped']++;
            };

            $name = $cell('name');

            if ($name === '') {
                $refuse('Taom nomi bo\'sh.');

                continue;
            }

            if (mb_strlen($name) > 160) {
                $refuse('Taom nomi juda uzun — 160 belgidan oshmasligi kerak.');

                continue;
            }

            $sku = $cell('sku');

            if ($sku !== '' && preg_match('/^[A-Za-z0-9._-]{1,48}$/', $sku) !== 1) {
                $refuse("SKU «{$sku}» yaroqsiz — faqat harf, raqam, nuqta, tire va pastki chiziq, 48 belgigacha.");

                continue;
            }

            // SKU decides identity when the sheet carries one, because a
            // restaurant renames a dish far more often than it renumbers it.
            $key = $sku !== '' ? 'sku:'.self::normaliseSku($sku) : 'name:'.self::normalise($name);

            if (isset($seen[$key])) {
                $refuse("Bu qator {$seen[$key]}-qatorni takrorlaydi — jadvalda bir taom ikki marta.");

                continue;
            }

            $target = $sku !== ''
                ? ($bySku[self::normaliseSku($sku)] ?? null)
                : ($byName[self::normalise($name)] ?? null);

            /*
             * A soft-deleted dish still holds its SKU: the unique index is on
             * (tenant_id, sku) and does not care that `deleted_at` is set. So
             * the insert would fail at the database rather than here — and
             * quietly restoring the dish instead would put something a manager
             * deliberately removed back on the QR menu. Refuse, and say which.
             */
            if ($target !== null && $target->trashed()) {
                $refuse("«{$name}» o'chirilgan taomga tegishli — avval uni tiklang yoki boshqa SKU bering.");

                continue;
            }

            $priceRaw = $cell('price');

            if ($priceRaw === '') {
                $refuse("«{$name}» uchun narx ko'rsatilmagan.");

                continue;
            }

            $price = self::tiyinOf($priceRaw);

            if ($price === null) {
                $refuse("«{$name}» narxi o'qilmadi: «{$priceRaw}». Masalan: 42 000 yoki 42000,50.");

                continue;
            }

            $cost = null;
            $costRaw = $cell('cost');

            if ($costRaw !== '') {
                $cost = self::tiyinOf($costRaw);

                if ($cost === null) {
                    // Refused rather than dropped: an absent cost reports no
                    // margin, a wrong one reports a margin somebody acts on.
                    $refuse("«{$name}» tannarxi o'qilmadi: «{$costRaw}».");

                    continue;
                }

                if ($cost > $price) {
                    $refuse("«{$name}» tannarxi sotuv narxidan katta.");

                    continue;
                }
            }

            $station = null;
            $stationRaw = $cell('station');

            if ($stationRaw !== '') {
                $station = self::stationOf($stationRaw);

                if ($station === null) {
                    $refuse("«{$name}» uchun sex tanilmadi: «{$stationRaw}». Ruxsat etilgan: issiq, sovuq, grill, bar, shirinlik.");

                    continue;
                }
            }

            $category = null;
            $categoryRaw = $cell('category');

            if ($categoryRaw !== '') {
                $lookup = self::normalise($categoryRaw);
                $category = $categories[$lookup] ?? null;

                if ($category === null) {
                    $category = $this->createCategory($categoryRaw, $tenantId, $locale, $slugsTaken);
                    $categories[$lookup] = $category;
                    $categoriesCreated[] = $categoryRaw;
                }
            }

            $description = $cell('description');
            $allergens = self::allergensOf($cell('allergens'));

            if ($target === null) {
                // A category is required only on create. An update leaves the
                // dish where the manager filed it, which is why a price-only
                // sheet needs no category column at all.
                if ($category === null) {
                    $refuse("«{$name}» yangi taom — kategoriya ko'rsatilishi shart.");

                    continue;
                }

                $item = new MenuItem;
                $item->tenant_id = $tenantId;
                $item->sku = $sku !== '' ? $sku : self::skuFor($name, $bySku);
                $item->name = [$locale => $name];
                $item->menu_category_id = $category->id;
                $summary['created']++;
            } else {
                $item = $target;
                /*
                 * The other two languages survive an import.
                 *
                 * The sheet is one language — the restaurant's own — so it
                 * fills that key and merges. Overwriting the whole column would
                 * silently delete the Russian a marketer typed last month, and
                 * a dish with an empty `ru` renders blank on half the guest
                 * surfaces.
                 */
                $item->name = [...(array) $item->name, $locale => $name];

                if ($category !== null) {
                    $item->menu_category_id = $category->id;
                }

                $summary['updated']++;
            }

            $item->price = $price;

            // Only what the sheet actually carried. A blank cost cell means
            // "the sheet does not say", not "set it to nothing" — an import
            // that nulls a costed dish destroys the margin column.
            if ($cost !== null) {
                $item->cost_price = $cost;
            }

            if ($station !== null) {
                $item->station = $station;
            }

            if ($allergens !== []) {
                $item->allergens = $allergens;
            }

            if ($description !== '') {
                $item->description = [...(array) ($item->description ?? []), $locale => mb_substr($description, 0, 2000)];
            }

            $item->save();

            // Two rows of the same sheet naming the same new dish must not both
            // insert, so what was just written joins the lookup.
            $bySku[self::normaliseSku($item->sku)] ??= $item;
            $byName[self::normalise($name)] ??= $item;
            $seen[$key] = $number;
        }

        return [
            'summary' => $summary,
            'categories_created' => array_values(array_unique($categoriesCreated)),
            'refusals' => $refusals,
        ];
    }

    /**
     * A section the sheet names but the restaurant does not have yet.
     *
     * Created rather than refused, because a first import IS the menu — a sheet
     * of 68 dishes across seven sections would otherwise be seven refusals and
     * a manager typing them by hand before trying again. The report lists every
     * one by name under `categories_created`, so nothing appears silently.
     *
     * @param array<string, bool> $slugsTaken normalised slug → true, trashed rows included
     */
    private function createCategory(string $name, ?int $tenantId, string $locale, array &$slugsTaken): MenuCategory
    {
        $base = Str::slug($name);

        // `Str::slug` transliterates Cyrillic, so «Салаты» becomes "salaty";
        // a name of nothing but punctuation leaves it empty and needs a floor.
        if ($base === '') {
            $base = 'kategoriya';
        }

        $slug = $base;
        $suffix = 2;

        // Slugs are unique per tenant, archived ones included. A collision is
        // either an archived section coming back under a new name or two names
        // that transliterate the same way — both rare, neither may throw.
        while (isset($slugsTaken[self::normalise($slug)])) {
            $slug = $base.'-'.$suffix++;
        }

        $slug = mb_substr($slug, 0, 96);
        $slugsTaken[self::normalise($slug)] = true;

        $category = new MenuCategory;
        $category->tenant_id = $tenantId;
        $category->slug = $slug;
        $category->name = [$locale => mb_substr($name, 0, 120)];
        $category->save();

        return $category;
    }

    // =====================================================================
    // Small pure helpers
    // =====================================================================

    /**
     * @param list<string> $columns
     * @param array<string, string> $mapping column name → field
     *
     * @return array<string, int> field → column index
     */
    private static function fieldIndexes(array $columns, array $mapping): array
    {
        $indexes = [];

        foreach ($columns as $index => $column) {
            $field = $mapping[$column] ?? null;

            if ($field !== null) {
                $indexes[$field] ??= $index;
            }
        }

        return $indexes;
    }

    /** A header, guessed against the synonym table. Null when nothing matches. */
    private static function guessField(string $column): ?string
    {
        $key = self::normalise($column);

        if ($key === '') {
            return null;
        }

        foreach (self::SYNONYMS as $field => $words) {
            if (in_array($key, $words, true)) {
                return $field;
            }
        }

        return null;
    }

    /** One of `MenuItem::STATIONS`, or null when the word is not a station. */
    private static function stationOf(string $raw): ?string
    {
        $key = self::normalise($raw);

        foreach (self::STATION_WORDS as $station => $words) {
            if (in_array($key, $words, true)) {
                return $station;
            }
        }

        return null;
    }

    /**
     * "gluten, sut; yong'oq" → ["gluten", "sut", "yong'oq"].
     *
     * Three separators because three keyboards. The values stay free text —
     * the column has no closed set on this platform, and inventing one here
     * would refuse a real allergy.
     *
     * @return list<string>
     */
    private static function allergensOf(string $raw): array
    {
        if (trim($raw) === '') {
            return [];
        }

        $parts = preg_split('/[,;|\/]+/u', $raw) ?: [];
        $clean = [];

        foreach ($parts as $part) {
            $word = mb_substr(trim($part), 0, 40);

            if ($word !== '' && ! in_array($word, $clean, true)) {
                $clean[] = $word;
            }
        }

        return array_slice($clean, 0, self::MAX_ALLERGENS);
    }

    /**
     * A SKU for a dish whose sheet has no code column.
     *
     * Derived from the name rather than a counter, because a human reads this
     * on a kitchen ticket and "OSH-TOSHKENT" tells them something "IMP-0042"
     * does not. Cyrillic transliterates, so «Плов» becomes PLOV.
     *
     * @param array<string, MenuItem> $taken
     */
    private static function skuFor(string $name, array $taken): string
    {
        $base = mb_strtoupper(mb_substr(Str::slug($name), 0, 40));

        if ($base === '') {
            $base = 'ITEM';
        }

        $sku = $base;
        $suffix = 2;

        while (isset($taken[self::normaliseSku($sku)])) {
            $sku = $base.'-'.$suffix++;
        }

        return $sku;
    }

    /**
     * Every locale of a translatable name, normalised for lookup.
     *
     * @return list<string>
     */
    private static function namesOf(MenuItem|MenuCategory $model): array
    {
        $names = [];

        foreach ((array) $model->name as $value) {
            if (is_string($value) && trim($value) !== '') {
                $names[] = self::normalise($value);
            }
        }

        return array_values(array_unique(array_filter($names, static fn (string $n): bool => $n !== '')));
    }

    /**
     * A lookup key: lowercase, letters and digits only.
     *
     * Punctuation and spacing are exactly what differ between the sheet and the
     * database — "Osh (Toshkent)" against "Osh Toshkent", "so'm" against
     * "so‘m" with the typographic apostrophe Word substitutes. Matching on
     * them would create a second copy of a dish that is already there.
     */
    private static function normalise(string $value): string
    {
        return mb_strtolower(preg_replace('/[^\p{L}\p{N}]+/u', '', trim($value)) ?? '');
    }

    /** SKUs are case-insensitive for matching but stored as typed. */
    private static function normaliseSku(string $value): string
    {
        return mb_strtoupper(trim($value));
    }

    // =====================================================================
    // CSV plumbing
    // =====================================================================

    /**
     * The bytes as UTF-8, whatever Excel decided to write them in.
     *
     * The BOM goes first — it is three bytes glued to the first header, and a
     * column called "\u{FEFF}Nomi" matches no synonym and no client mapping.
     */
    private static function asUtf8(string $content): string
    {
        if (str_starts_with($content, "\xEF\xBB\xBF")) {
            $content = substr($content, 3);
        }

        if (mb_check_encoding($content, 'UTF-8')) {
            return $content;
        }

        /*
         * Not UTF-8, so it is almost certainly Windows-1251: that is what
         * Russian Excel writes for plain "CSV", and it is the one encoding
         * whose failure mode is silent — every Cyrillic name becomes mojibake
         * that imports perfectly and reads as nonsense on the menu.
         */
        return (string) mb_convert_encoding($content, 'UTF-8', 'Windows-1251');
    }

    /**
     * Comma, semicolon or tab.
     *
     * Excel writes a semicolon wherever the system decimal separator is a
     * comma, which is most of this platform's market — so guessing "," and
     * getting one enormous column is the default failure, not the edge case.
     * Decided on the header line by whichever candidate splits it into the most
     * fields, because the header is the one line guaranteed to have them all.
     */
    private static function delimiterOf(string $content): string
    {
        $firstLine = strtok($content, "\r\n");
        $line = $firstLine === false ? '' : $firstLine;
        $best = ',';
        $bestCount = 0;

        foreach ([',', ';', "\t"] as $candidate) {
            $count = count(str_getcsv($line, $candidate, '"', ''));

            if ($count > $bestCount) {
                $best = $candidate;
                $bestCount = $count;
            }
        }

        return $best;
    }

    /**
     * Parse through a stream rather than line by line: a dish description with
     * a newline inside quotes is one field, and splitting on "\n" first would
     * turn it into two broken rows.
     *
     * @return list<list<string>>
     */
    private static function parseCsv(string $content, string $delimiter): array
    {
        $stream = fopen('php://temp', 'r+');

        if ($stream === false) {
            throw ApiException::of('menu.import_unreadable');
        }

        fwrite($stream, $content);
        rewind($stream);

        $records = [];

        // An empty `$escape` rather than the default backslash: CSV has no
        // escape character, only doubled quotes, and PHP's default makes
        // `C:\path\` swallow the quote that ends the field.
        while (($row = fgetcsv($stream, null, $delimiter, '"', '')) !== false) {
            $records[] = array_map(static fn (?string $cell): string => (string) $cell, $row);
        }

        fclose($stream);

        return $records;
    }
}
