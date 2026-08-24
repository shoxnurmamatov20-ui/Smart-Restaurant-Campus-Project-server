<?php

declare(strict_types=1);

namespace App\Http\Controllers\Platform;

use App\Http\Controllers\Controller;
use App\Models\Activity;
use App\Models\Impersonation;
use App\Models\User;
use Illuminate\Http\JsonResponse;

/**
 * Who did what on the platform, with impersonation marked out separately.
 *
 * The design's own note on that field is the reason this screen exists at all:
 * "an operator inside a customer's account is the most powerful thing this
 * product can do, and it must never be one row among many."
 *
 * So the impersonation rows come from their own table rather than being filtered
 * out of the audit log by log name. A row that can only be found by knowing what
 * to grep for is a row that goes missing the first time somebody renames a log.
 */
final class SignInController extends Controller
{
    public function __invoke(): JsonResponse
    {
        $names = User::query()->whereNull('tenant_id')->pluck('name', 'id');

        $impersonations = Impersonation::query()
            ->with('tenant:id,name,slug')
            ->orderByDesc('id')
            ->limit(100)
            ->get()
            ->map(static fn (Impersonation $row): array => [
                'id' => 'imp-'.$row->id,
                'who' => $row->operator_user_id,
                'action' => 'signedInAs',
                'tenant' => $row->tenant?->name,
                'reason' => $row->reason,
                'at' => $row->created_at?->toIso8601String(),
                'expires_at' => $row->expires_at->toIso8601String(),
                'impersonation' => true,
            ]);

        /*
         * Everything else the operator did — suspending a tenant, marking an
         * invoice paid, changing a plan — read from the audit trail the actions
         * already write. Same screen, one list, and the impersonations keep
         * their own flag.
         */
        $actions = Activity::query()
            ->whereIn('log_name', ['platform.tenant', 'platform.invoice', 'platform.plan', 'platform.settings'])
            ->orderByDesc('id')
            ->limit(100)
            ->get()
            ->map(static fn (Activity $row): array => [
                'id' => 'act-'.$row->id,
                'who' => $row->causer_id,
                'action' => (string) $row->description,
                'tenant' => null,
                'reference' => data_get($row->properties, 'number'),
                'at' => $row->created_at?->toIso8601String(),
                'impersonation' => false,
            ]);

        $rows = $impersonations
            ->concat($actions)
            ->map(static function (array $row) use ($names): array {
                $row['who'] = $names[$row['who']] ?? ($row['who'] === null ? null : 'user #'.$row['who']);

                return $row;
            })
            ->sortByDesc('at')
            ->values()
            ->all();

        return response()->json(['data' => $rows]);
    }
}
