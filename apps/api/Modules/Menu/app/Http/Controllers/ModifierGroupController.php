<?php

declare(strict_types=1);

namespace Modules\Menu\Http\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Http\Resources\Json\ResourceCollection;
use Modules\Menu\Http\Resources\ModifierGroupSheetResource;
use Modules\Menu\Models\ModifierGroup;

/**
 * The questions a dish asks, listed for the people who maintain them.
 *
 * The groups already reach the till (`GET /v1/pos/menu/{item}/questions`) and
 * the guest (`GET /v1/public/menu`), and both of those read them PER DISH —
 * which is the right shape for somebody ordering and the wrong one for somebody
 * checking whether "Ulush" is still attached to the plov. The console's
 * Modifiers tab wants the opposite cut: every group once, with the number of
 * dishes hanging off it, so a manager can see at a glance which sheet is doing
 * work and which was written and forgotten.
 *
 * Unpaged, and that is a statement about the data rather than laziness: a
 * restaurant has a handful of these — a portion, a set of extras, a way of
 * cooking it — because every one of them is a question a guest is asked at the
 * counter. A menu with a hundred modifier groups is a menu nobody can order
 * from, and paging this list would hide that rather than show it.
 *
 * Inactive groups come too, because "switched off" is exactly what the person
 * opening this tab is looking for. The resource carries `is_active` and the
 * screen draws it; a filtered list would make a group somebody disabled last
 * month simply vanish, which reads as deleted.
 */
final class ModifierGroupController extends Controller
{
    public function index(): ResourceCollection
    {
        $groups = ModifierGroup::query()
            // The options are the group — a question with no answers on it is
            // not something the tab can draw — and `withCount` is what turns
            // "used by 24 dishes" into one query instead of one per group.
            ->with('options')
            ->withCount('items')
            ->orderBy('sort')
            ->orderBy('id')
            ->get();

        return ModifierGroupSheetResource::collection($groups);
    }
}
