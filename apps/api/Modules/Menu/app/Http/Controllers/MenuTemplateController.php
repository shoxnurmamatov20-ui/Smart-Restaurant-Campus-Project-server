<?php

declare(strict_types=1);

namespace Modules\Menu\Http\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Modules\Menu\Services\StarterMenu;

/**
 * "Give me a menu to start from" — the setup wizard's one-press catalogue.
 *
 * 201 with what it did, always, because "nothing was created" is a real and
 * useful answer: a second press on a restaurant that already ran it reports
 * every row skipped, which is the difference between a button that is safe to
 * press twice and a button nobody dares press once.
 *
 * `menu.create` rather than a wizard-only permission. It writes menu rows; the
 * people who may write menu rows are exactly the people who may press this.
 */
final class MenuTemplateController extends Controller
{
    public function __invoke(StarterMenu $starter): JsonResponse
    {
        return response()->json(['data' => $starter->writeInto()], 201);
    }
}
