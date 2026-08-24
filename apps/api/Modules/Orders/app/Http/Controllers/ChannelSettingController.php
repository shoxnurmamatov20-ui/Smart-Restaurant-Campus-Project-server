<?php

declare(strict_types=1);

namespace Modules\Orders\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Support\Errors\ApiException;
use App\Support\Tenancy\BranchContext;
use App\Support\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Modules\Orders\Models\ChannelSetting;

/**
 * The five switches on the intake screen's channels tab.
 *
 * What is internal here and what is somebody else's is worth stating, because
 * two of the five rows look identical on screen and are not:
 *
 *  - `tel`, `tg` and `web` are doors this platform owns. Shutting one is
 *    enforced — `PublicOrderController` refuses an order that arrives through a
 *    closed door, which is the half a switch has to have to be worth drawing.
 *  - `ye` and `uz` are Yandex Eats and Uzum Tezkor. Their queues are paused
 *    through their own APIs, which this deployment has no keys for. What this
 *    endpoint stores is the restaurant's own INTENTION, so the screen stops
 *    lying about the state and an operator can see at a glance which partner
 *    was switched off and why — and so that the day a token exists, the state
 *    it has to push already exists too.
 */
final class ChannelSettingController extends Controller
{
    /** The longest a pause may run before it has to be renewed. */
    private const MAX_PAUSE_MINUTES = 1440;

    public function __construct(
        private readonly TenantContext $tenants,
        private readonly BranchContext $branches,
    ) {}

    /**
     * Every door and whether it is open.
     *
     * All five always, including the ones nobody has ever touched: a screen
     * that drew four switches because one had no row would be a screen missing
     * a channel rather than one showing a default.
     */
    public function index(): JsonResponse
    {
        $branchId = $this->branches->id();

        return response()->json([
            'data' => array_map(
                fn (string $key): array => $this->shape($key, ChannelSetting::resolve($key, $branchId)),
                ChannelSetting::KEYS,
            ),
        ]);
    }

    /**
     * Open a door, shut it, or shut it for an hour.
     *
     * `paused_minutes` and `is_open` are separate on purpose, and the model
     * says why: a decision and a Friday must not look the same on the screen,
     * or somebody reopening after a rush switches a contract back on by
     * accident.
     */
    public function update(Request $request, string $key): JsonResponse
    {
        if (! in_array($key, ChannelSetting::KEYS, true)) {
            throw ApiException::of('request.not_found');
        }

        $validated = $request->validate([
            'is_open' => ['sometimes', 'boolean'],
            'paused_minutes' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:'.self::MAX_PAUSE_MINUTES],
            'reason' => ['nullable', 'string', 'max:200'],
            // Which venue this is about. Absent means the business, which is
            // what an owner with no branch selected means.
            'branch_id' => ['sometimes', 'nullable', 'integer', Rule::exists('branches', 'id')],
        ]);

        $branchId = array_key_exists('branch_id', $validated)
            ? $validated['branch_id']
            : $this->branches->id();

        $row = ChannelSetting::query()->firstOrNew([
            'tenant_id' => $this->tenants->id(),
            'branch_id' => $branchId,
            'key' => $key,
        ]);

        if (array_key_exists('is_open', $validated)) {
            $row->is_open = (bool) $validated['is_open'];
        }

        if (array_key_exists('paused_minutes', $validated)) {
            $minutes = (int) ($validated['paused_minutes'] ?? 0);
            // Zero is "resume now" rather than "pause for no time". A client
            // sending 0 is a person pressing the button that reopens the door.
            $row->paused_until = $minutes > 0 ? now()->addMinutes($minutes) : null;
            $row->pause_reason = $minutes > 0 ? ($validated['reason'] ?? null) : null;
        }

        $row->updated_by = $request->user()?->getAuthIdentifier();
        $row->save();

        // refresh() so the database's own defaults reach the client. A row
        // created by a pause-only request never set `is_open`, and without this
        // the answer reports null for a column the table says is true — which
        // the console would draw as a switch in the off position.
        return response()->json(['data' => $this->shape($key, $row->refresh())]);
    }

    /**
     * @return array<string, mixed>
     */
    private function shape(string $key, ChannelSetting $row): array
    {
        return [
            'key' => $key,
            'is_open' => $row->is_open,
            'accepts' => $row->accepts,
            'paused_until' => $row->paused_until?->toIso8601String(),
            'pause_reason' => $row->pause_reason,
            'branch_id' => $row->branch_id,
            /*
             * Whether shutting this switch actually refuses anything.
             *
             * The two aggregators answer false and the screen can say so. A
             * switch that stores an intention and a switch that closes a door
             * look the same and are not, and hiding the difference is how an
             * operator ends up believing Uzum stopped sending orders.
             *
             * TODO(integration): needs YANDEX_EATS_TOKEN / UZUM_TEZKOR_TOKEN —
             * see docs/GO-LIVE.md. Each partner pauses its own queue through
             * its own API; the state they would be handed is the row above.
             */
            'enforced' => ChannelSetting::keyForSource('web') === $key
                || ChannelSetting::keyForSource('telegram') === $key,
        ];
    }
}
