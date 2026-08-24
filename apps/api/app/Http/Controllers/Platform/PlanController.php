<?php

declare(strict_types=1);

namespace App\Http\Controllers\Platform;

use App\Http\Controllers\Controller;
use App\Http\Requests\Platform\UpdatePlanRequest;
use App\Models\PlatformPlan;
use App\Models\Tenant;
use Illuminate\Http\JsonResponse;

/**
 * What the platform sells, and how many restaurants are on each tier.
 *
 * The prices here are the same ones `/pricing` prints — start 2 400 000 and
 * pro 6 900 000 so'm a month — and they live in one place now. `pages-fidelity`
 * already caught the cost of two: the marketing page showed a tariff a hundred
 * times too cheap for a while, because a test that counted rows never checked
 * the numbers in them.
 */
final class PlanController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json([
            'data' => PlatformPlan::query()
                ->orderBy('position')
                ->orderBy('price_tiyin')
                ->get()
                ->map(static fn (PlatformPlan $plan): array => [
                    'id' => $plan->key,
                    'price_tiyin' => (int) $plan->price_tiyin,
                    // `null` is a real answer here: enterprise has no ceiling,
                    // and writing that as a large number is a limit somebody
                    // eventually hits at three in the morning.
                    'branches' => $plan->branch_limit,
                    'users' => $plan->user_limit,
                    'terminals' => $plan->terminal_limit,
                    'orders' => $plan->order_limit,
                    'features' => $plan->features ?? [],
                    'is_active' => (bool) $plan->is_active,
                    'tenants' => Tenant::query()->where('plan_key', $plan->key)->count(),
                ])
                ->all(),
        ]);
    }

    public function update(UpdatePlanRequest $request, string $plan): JsonResponse
    {
        $record = PlatformPlan::query()->where('key', $plan)->firstOrFail();

        $record->fill($request->validated())->save();

        activity('platform.plan')
            ->performedOn($record)
            ->causedBy($request->user())
            ->withProperties($request->validated())
            ->log('platform.plan.updated');

        return $this->index();
    }
}
