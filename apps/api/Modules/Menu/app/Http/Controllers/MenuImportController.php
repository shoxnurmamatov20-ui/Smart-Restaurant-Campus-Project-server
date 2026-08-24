<?php

declare(strict_types=1);

namespace Modules\Menu\Http\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\UploadedFile;
use Modules\Menu\Http\Requests\ImportMenuRequest;
use Modules\Menu\Services\MenuSheetImporter;

/**
 * `POST /api/v1/menu/import` — a restaurant's menu, from the sheet it was
 * written in.
 *
 * One endpoint for all three of the console's steps rather than three, and
 * that is the decision worth explaining. An upload endpoint that answers with
 * the header row, a second that stores a mapping and a third that applies it
 * needs server-side state between the calls — an upload id, a place to keep
 * two megabytes, and an expiry that will one day catch a manager mid-dialog.
 * Re-sending the same small file with the answers costs a second upload of two
 * megabytes on a restaurant's own Wi-Fi and buys statelessness:
 *
 *   1. no `mapping`, no `dry_run`      → the header row, what the server
 *                                        recognised, and a full rehearsal
 *   2. `mapping` from the dialog       → the same rehearsal, mapped their way
 *   3. `mapping` + `dry_run=false`     → the write
 *
 * Every answer has the same shape, so the console renders one component for
 * all three.
 *
 * ----------------------------------------------------------------------------
 * The three-language column, and what an import may write into it
 *
 * `name` and `description` are jsonb `{uz, ru, en}`. A spreadsheet is one
 * language, so the import fills ONE key — the restaurant's own locale, or the
 * `locale` the caller states — and leaves the other two null.
 *
 * The alternative, copying the Uzbek into `ru` and `en`, was rejected: it
 * produces a row that CLAIMS to be translated. Nothing afterwards can tell
 * "nobody has translated this yet" from "translated, and it happens to be the
 * same word", so the console's editor drawer shows three filled fields, no
 * screen can list what still needs a translator, and a Russian guest reads
 * Uzbek believing it is Russian. A null is not a blank menu either:
 * `HasTranslations::translate()` falls back requested → fallback → uz → first
 * non-empty, so the guest sees the Uzbek name and the platform still knows it
 * is untranslated.
 *
 * On an update the other two keys are merged rather than replaced, so an
 * import of new prices cannot delete the Russian a marketer typed last month.
 */
final class MenuImportController extends Controller
{
    public function __invoke(ImportMenuRequest $request, MenuSheetImporter $importer): JsonResponse
    {
        $file = $request->file('file');

        // Validation guarantees one file; this narrows the type for static
        // analysis, which cannot know that `file()` may also answer an array.
        abort_unless($file instanceof UploadedFile, 422, 'Fayl yuborilmadi.');

        $sheet = $importer->read($file);
        $mapping = $importer->resolveMapping($sheet['columns'], $request->requestedMapping());

        return response()->json([
            'data' => $importer->import(
                $sheet['columns'],
                $mapping,
                $sheet['rows'],
                $request->isDryRun(),
                $request->sheetLocale(),
            ),
        ]);
    }
}
