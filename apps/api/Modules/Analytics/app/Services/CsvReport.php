<?php

declare(strict_types=1);

namespace Modules\Analytics\Services;

/**
 * A report table as a CSV a spreadsheet will actually open.
 *
 * ---------------------------------------------------------------------------
 * Three things that make a CSV wrong in this market, and what is done about each
 *
 * **Money.** Every amount on this platform is integer tiyin. A file carrying
 * `45000000` for a 450 000 so'm total is a report an accountant either misreads
 * by a factor of a hundred or refuses to use. The column type says which columns
 * are money and they are divided on the way out — once, here, rather than in
 * whichever screen happened to build the export.
 *
 * **Excel and UTF-8.** A file with `Ko'kat` in it opens as `Koâ€™kat` unless it
 * starts with a byte-order mark. Excel is what these files are opened in, and
 * one mangled column of dish names makes the whole export look broken.
 *
 * **Formula injection.** A dish named `=cmd|...` or a note beginning with `+`,
 * `-` or `@` is executed by Excel when the file is opened. A restaurant's menu
 * is user input, and this file is emailed to an accountant — so any cell
 * starting with one of those four characters is prefixed with a tab, which Excel
 * strips on display and does not evaluate. This is the only escaping that
 * matters here and it is easy to leave out.
 *
 * Semicolon-delimited, because that is what a spreadsheet in a comma-decimal
 * locale expects and a comma file lands in one column.
 */
final class CsvReport
{
    private const DELIMITER = ';';

    /** Excel needs this to read the file as UTF-8. */
    private const BOM = "\xEF\xBB\xBF";

    /**
     * Cells Excel would evaluate as a formula.
     *
     * Four characters, and the list is not longer than this: everything else is
     * literal to every spreadsheet in use.
     */
    private const FORMULA_PREFIXES = ['=', '+', '-', '@'];

    /**
     * @param  array<string, mixed>  $report  A table from {@see StandardReports}.
     * @param  string  $header  which key on a column carries its heading — `key`
     *                          for this platform's own names, `label` for a dialect
     *                          that renames them ({@see OneCReport}). The ROWS are
     *                          always read by `key`, because that is what the row
     *                          arrays are keyed on.
     */
    public static function from(array $report, string $header = 'key'): string
    {
        /** @var array<int, array{key: string, type: string}> $columns */
        $columns = $report['columns'] ?? [];
        /** @var array<int, array<string, mixed>> $rows */
        $rows = $report['rows'] ?? [];

        $handle = fopen('php://temp', 'r+');

        if ($handle === false) {
            return self::BOM;
        }

        fwrite($handle, self::BOM);

        fputcsv($handle, array_map(
            static fn (array $column): string => (string) ($column[$header] ?? $column['key']),
            $columns,
        ), self::DELIMITER, '"', '\\');

        foreach ($rows as $row) {
            fputcsv($handle, array_map(
                static fn (array $column): string => self::cell($row[$column['key']] ?? null, $column['type']),
                $columns,
            ), self::DELIMITER, '"', '\\');
        }

        /*
         * The totals row, labelled in the first column.
         *
         * A footer rather than a separate file, because the two are read
         * together — and an export whose columns do not add up to the figure on
         * the screen is the first thing somebody notices and the last thing
         * anybody trusts again.
         */
        if (($report['totals'] ?? []) !== []) {
            fputcsv($handle, array_map(
                static fn (array $column, int $index): string => $index === 0
                    ? 'TOTAL'
                    : self::cell($report['totals'][$column['key']] ?? null, $column['type']),
                $columns,
                array_keys($columns),
            ), self::DELIMITER, '"', '\\');
        }

        rewind($handle);
        $csv = (string) stream_get_contents($handle);
        fclose($handle);

        return $csv;
    }

    /** A file name somebody can find again in a downloads folder. */
    public static function filename(string $kind, string $from, string $to): string
    {
        return $from === $to
            ? "{$kind}-{$from}.csv"
            : "{$kind}-{$from}_{$to}.csv";
    }

    private static function cell(mixed $value, string $type): string
    {
        if ($value === null) {
            // Empty, not "0" and not "null". A margin that could not be computed
            // is not a margin of zero, and a spreadsheet averaging the column
            // must not be handed one.
            return '';
        }

        if ($type === 'money') {
            // Tiyin to so'm, with two decimals. `number_format` rather than a
            // division into a float, so the file never carries `4.5000000001e5`.
            return number_format(((int) $value) / 100, 2, '.', '');
        }

        return self::defuse((string) $value);
    }

    private static function defuse(string $value): string
    {
        foreach (self::FORMULA_PREFIXES as $prefix) {
            if (str_starts_with($value, $prefix)) {
                return "\t".$value;
            }
        }

        return $value;
    }
}
