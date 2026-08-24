<?php

declare(strict_types=1);

namespace Modules\Analytics\Services;

/**
 * The same report, with the column names 1C reads.
 *
 * ---------------------------------------------------------------------------
 * What this is, and what it deliberately is not
 *
 * It is the **nomenclature** shape: one line per thing sold or moved, named the
 * way 1C names things — `Номенклатура`, `Количество`, `Сумма`, `Дата`,
 * `Контрагент`. That is what 1C's own CSV import dialog asks for, and it is
 * what an accountant does with a restaurant's monthly figures: they load the
 * lines and post them once.
 *
 * It is NOT a chart-of-accounts posting. A posting needs every payment method
 * and every expense category mapped to an account number and a counterparty,
 * and that mapping is an accountant's decision about a particular bookkeeping
 * setup — no table on this platform holds it, and inventing one would be this
 * platform deciding which account a restaurant's card takings belong in. When
 * that mapping exists, it goes in `finance` settings and this class grows a
 * second shape; until then a file 1C can read beats a file it cannot.
 *
 * ---------------------------------------------------------------------------
 * The mechanics are {@see CsvReport}'s, unchanged
 *
 * Semicolon-delimited, UTF-8 with a byte-order mark, money divided out of tiyin
 * into so'm with two decimals, and any cell beginning `=`, `+`, `-` or `@`
 * defused with a tab. Not cp1251: 1C 8.3 reads UTF-8, and a code page chosen to
 * please a 2005 build mangles every Uzbek name on the way in.
 *
 * Only the header row differs, which is exactly why this is a rename over the
 * top of `CsvReport` rather than a second writer. Two CSV writers is two places
 * for the byte-order mark to be forgotten.
 */
final class OneCReport
{
    /**
     * This platform's column keys against 1C's vocabulary.
     *
     * Keyed on the report's own column key, so one map covers all five standard
     * reports: `revenue_tiyin` is `Сумма` whether it came from the waiters
     * report or the dishes one, and a report that grows a column nobody has
     * mapped keeps its own key rather than being dropped. A column 1C has no
     * word for is still a column an accountant reads — silently losing it is
     * how a file balances to the wrong number.
     *
     * @var array<string, string>
     */
    private const NAMES = [
        // What was sold.
        'title' => 'Номенклатура',
        'name' => 'Номенклатура',
        'label' => 'Номенклатура',
        'sku' => 'Артикул',

        // How much of it.
        'sold' => 'Количество',
        'quantity' => 'Количество',
        'count' => 'Количество',
        'paid_bills' => 'Количество',
        'voided_bills' => 'КоличествоОтмен',
        'cancelled_lines' => 'КоличествоСторно',

        // Money. `Сумма` is the line's own money; the rest are named so an
        // accountant can tell them apart in a column picker.
        'revenue_tiyin' => 'Сумма',
        'amount_tiyin' => 'Сумма',
        'total_price' => 'Сумма',
        'cost_tiyin' => 'Себестоимость',
        'profit_tiyin' => 'Прибыль',
        'discounts_tiyin' => 'Скидка',
        'fee_tiyin' => 'Комиссия',
        'average_cheque_tiyin' => 'СреднийЧек',
        'margin_percent' => 'Рентабельность',

        // When, who, and against what.
        'at' => 'Дата',
        'waiter' => 'Контрагент',
        'direction' => 'ВидДвижения',
        'order_number' => 'Документ',
        'table_label' => 'Стол',
        'note' => 'Комментарий',
    ];

    /**
     * @param  array<string, mixed>  $report  a table from {@see StandardReports}
     */
    public static function from(array $report): string
    {
        /** @var array<int, array{key: string, type: string}> $columns */
        $columns = $report['columns'] ?? [];

        $report['columns'] = array_map(
            static fn (array $column): array => [
                ...$column,
                'key' => $column['key'],
                // The header is renamed and the row keys are not: `CsvReport`
                // reads each row by `$column['key']`, so renaming that would
                // produce a file of empty cells under perfect Russian headings.
                'label' => self::NAMES[$column['key']] ?? $column['key'],
            ],
            $columns,
        );

        return CsvReport::from($report, header: 'label');
    }

    /** A file name an accountant can find again — the kind, the window, `-1c`. */
    public static function filename(string $kind, string $from, string $to): string
    {
        return $from === $to
            ? "{$kind}-1c-{$from}.csv"
            : "{$kind}-1c-{$from}_{$to}.csv";
    }
}
