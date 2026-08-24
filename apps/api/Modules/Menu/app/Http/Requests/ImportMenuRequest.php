<?php

declare(strict_types=1);

namespace Modules\Menu\Http\Requests;

use App\Support\Tenancy\TenantContext;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Modules\Menu\Services\MenuSheetImporter;

/**
 * One spreadsheet, and what to do with it.
 *
 * Multipart, because the file is the request. `mapping` and `dry_run` ride
 * alongside it rather than in a second call, so a console that has already
 * drawn its mapping dialog re-sends the same file with the answers and gets
 * the report for exactly that mapping — no server-side upload session to
 * expire between the two.
 */
final class ImportMenuRequest extends FormRequest
{
    /** Route middleware (`permission:menu.create`) enforces authorisation. */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        return [
            /*
             * CSV, and only CSV.
             *
             * An .xlsx is a ZIP of XML and reading one needs a spreadsheet
             * parser — phpoffice/phpspreadsheet or box/spout — that nobody has
             * installed in this repository, and adding a dependency is a
             * decision taken with the user rather than a side effect of an
             * import. So the console's import dialog offers CSV; "Save as →
             * CSV UTF-8" is one menu item away in the Excel the sheet came
             * from, and the importer refuses a workbook by name (see
             * `menu.import_not_csv`) instead of parsing a ZIP into nonsense.
             *
             * `txt` is here because Excel's own "Tab delimited" export uses it
             * and the reader detects tabs anyway.
             */
            'file' => ['required', 'file', 'mimes:csv,txt', 'max:2048'],

            // Sheet column name → one of the eight fields. Keys are whatever
            // the accountant called their columns, so nothing is validated
            // about them beyond being strings the header actually contains —
            // the importer ignores a mapping for a column that is not there.
            'mapping' => ['nullable', 'array'],
            'mapping.*' => ['nullable', 'string', Rule::in(MenuSheetImporter::FIELDS)],

            'dry_run' => ['nullable', 'boolean'],

            // Which language the sheet is written in. A menu is one language
            // deep at import time; see `MenuImportController` for why the
            // other two are left null rather than filled with a copy.
            'locale' => ['nullable', Rule::in(['uz', 'ru', 'en'])],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'file.required' => 'Fayl yuborilmadi.',
            'file.mimes' => 'Faqat CSV qabul qilinadi. Excel’da «Save as → CSV UTF-8» qiling.',
            'file.max' => 'Fayl 2 MB dan katta bo\'lmasligi kerak.',
            'mapping.*.in' => 'Ustunni faqat quyidagilardan biriga bog\'lash mumkin: '
                .implode(', ', MenuSheetImporter::FIELDS).'.',
        ];
    }

    /**
     * A multipart body is strings, so two fields have to be read back into
     * what they mean.
     *
     * `mapping` arrives as JSON text: the browser's `FormData` cannot carry a
     * nested object, and building `mapping[Наименование]=name` by hand in the
     * console would mean escaping a header the accountant typed into a form
     * key. Sending the object as one JSON field is the shape that survives
     * both.
     *
     * `dry_run` arrives as the WORD "false", and that is the whole of a bug
     * this method exists to stop. Laravel's `boolean` rule accepts `true`,
     * `false`, `1`, `0`, `"1"` and `"0"` — and not `"false"`, which is exactly
     * what a `FormData` field built from a JavaScript boolean serialises to. So
     * every real write from the console was refused 422 while
     * `isDryRun()` — which reads the same field through
     * `filter_var(FILTER_VALIDATE_BOOLEAN)` and understands the word perfectly
     * — never got the chance to disagree. One field, two readers, and the
     * stricter one ran first.
     */
    protected function prepareForValidation(): void
    {
        $dryRun = $this->input('dry_run');

        if (is_string($dryRun) && $dryRun !== '') {
            // Normalised to a real boolean, so the rule and `isDryRun()` are
            // reading the same value rather than the same string twice.
            $this->merge(['dry_run' => filter_var($dryRun, FILTER_VALIDATE_BOOLEAN)]);
        }

        $mapping = $this->input('mapping');

        if (is_string($mapping) && $mapping !== '') {
            $decoded = json_decode($mapping, true);

            // Left as-is when it is not an object: the `array` rule below then
            // refuses it with the one error envelope, rather than this method
            // inventing a second way to say "that is not a mapping".
            $this->merge(['mapping' => is_array($decoded) ? $decoded : $mapping]);
        }
    }

    /**
     * Which columns feed which fields, as the client asked.
     *
     * @return array<string, string>
     */
    public function requestedMapping(): array
    {
        /** @var array<string, string> $clean */
        $clean = [];

        foreach ((array) $this->input('mapping', []) as $column => $field) {
            if (is_string($column) && is_string($field) && $field !== '') {
                $clean[$column] = $field;
            }
        }

        return $clean;
    }

    /**
     * Writing has to be asked for.
     *
     * The default is the rehearsal, and it is a default rather than a required
     * flag because the failure modes are not symmetrical: a caller who forgets
     * the parameter and gets a report has lost nothing, and a caller who
     * forgets it and rewrites every price on the menu has lost the menu.
     *
     * `ConvertEmptyStringsToNull` turns `dry_run=""` into null before this
     * runs, so a blank field is an absent one and still means "rehearse".
     */
    public function isDryRun(): bool
    {
        $value = $this->input('dry_run');

        return $value === null || filter_var($value, FILTER_VALIDATE_BOOLEAN);
    }

    /**
     * The language the sheet's names are written in.
     *
     * The restaurant's own locale unless the caller says otherwise, because a
     * menu belongs to the restaurant rather than to whoever is looking at the
     * console — a Russian-speaking accountant uploading an Uzbek menu must not
     * file every dish name under `ru`.
     */
    public function sheetLocale(): string
    {
        $asked = $this->input('locale');

        if (is_string($asked) && in_array($asked, ['uz', 'ru', 'en'], true)) {
            return $asked;
        }

        $tenantLocale = app(TenantContext::class)->tenant()?->locale;

        return in_array($tenantLocale, ['uz', 'ru', 'en'], true) ? $tenantLocale : 'uz';
    }
}
