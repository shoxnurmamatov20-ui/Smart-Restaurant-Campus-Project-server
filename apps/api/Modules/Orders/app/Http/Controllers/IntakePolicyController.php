<?php

declare(strict_types=1);

namespace Modules\Orders\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Support\Tenancy\BranchContext;
use App\Support\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Modules\Orders\Http\Requests\UpdateIntakePolicyRequest;
use Modules\Orders\Models\IntakePolicy;

/**
 * The intake desk's own rules — `/calls` → Kanallar, the right-hand column.
 *
 * Four switches and a prep-time picker that used to live in React state. The
 * screen said "switched on" and the next reload said the opposite, which on an
 * automation switch is worse than a control that does nothing: an operator who
 * believes prepaid tickets are reaching the kitchen by themselves stops
 * watching the queue.
 *
 * ---------------------------------------------------------------------------
 * What each rule actually does today, and why the answer says so
 *
 * `enforced` travels per rule, exactly as it does on the door switches beside
 * them, and for the same reason that endpoint gives: *"a switch that stores an
 * intention and a switch that closes a door look the same and are not"*.
 *
 *  - `pause_at_peak` is **enforced**. `PublicOrderController` refuses a
 *    stranger's order while the line is holding more than `peak_ticket_limit`
 *    dockets, through `App\Contracts\Kitchen\KitchenLoad`.
 *  - `prep_minutes` is **used**: it is the time the console quotes and the
 *    clock the intake board calls an order late against.
 *  - `auto_accept_prepaid`, `hide_stopped_online` and `call_on_cash` are
 *    recorded intentions. Each needs a producer this platform does not have
 *    yet — an acceptance step that runs without a person, a push to the
 *    aggregators' catalogues, a telephony leg — and the screen states that
 *    rather than implying the rule is running.
 */
final class IntakePolicyController extends Controller
{
    public function __construct(
        private readonly TenantContext $tenants,
        private readonly BranchContext $branches,
    ) {}

    /**
     * The rules in force here.
     *
     * Always a full answer, including for a restaurant that has never opened
     * the screen: the console draws five controls and a body missing three of
     * them would be a screen missing three controls rather than one showing
     * defaults.
     */
    public function show(): JsonResponse
    {
        return response()->json([
            'data' => $this->shape(IntakePolicy::resolve($this->branches->id())),
        ]);
    }

    public function update(UpdateIntakePolicyRequest $request): JsonResponse
    {
        $validated = $request->validated();

        $branchId = array_key_exists('branch_id', $validated)
            ? $validated['branch_id']
            : $this->branches->id();

        $row = IntakePolicy::query()->firstOrNew([
            'tenant_id' => $this->tenants->id(),
            'branch_id' => $branchId,
        ]);

        foreach ([...IntakePolicy::RULES, 'peak_ticket_limit', 'prep_minutes'] as $field) {
            if (array_key_exists($field, $validated)) {
                $row->setAttribute($field, $validated[$field]);
            }
        }

        $row->updated_by = $request->user()?->getAuthIdentifier();
        $row->save();

        /*
         * refresh() so the table's own defaults reach the client. A row created
         * by a request that carried only `prep_minutes` never set the four
         * switches, and without this the answer reports null for columns the
         * table says are true — which the console would draw as four switches
         * in the off position.
         */
        return response()->json(['data' => $this->shape($row->refresh())]);
    }

    /**
     * @return array<string, mixed>
     */
    private function shape(IntakePolicy $row): array
    {
        return [
            'auto_accept_prepaid' => $row->auto_accept_prepaid,
            'hide_stopped_online' => $row->hide_stopped_online,
            'pause_at_peak' => $row->pause_at_peak,
            'peak_ticket_limit' => $row->peak_ticket_limit,
            'call_on_cash' => $row->call_on_cash,
            'prep_minutes' => $row->prep_minutes,
            'branch_id' => $row->branch_id,
            /*
             * Which of these the server will actually act on. See the class
             * docblock: three of the four are recorded intentions today, and a
             * screen that could not tell them apart would let an operator
             * believe the queue is being answered without them.
             */
            'enforced' => [
                'auto_accept_prepaid' => false,
                'hide_stopped_online' => false,
                'pause_at_peak' => true,
                'call_on_cash' => false,
            ],
        ];
    }
}
