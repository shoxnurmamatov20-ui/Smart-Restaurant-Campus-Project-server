<?php

declare(strict_types=1);

namespace Modules\Pos\Services;

use App\Contracts\Pos\TerminalRegistry;
use Modules\Pos\Models\Terminal;

/**
 * The device wall, read straight off `pos.terminals`.
 *
 * Sorted by silence rather than by name: the screen exists to find the till
 * that stopped talking, and a list ordered alphabetically buries it.
 */
final class PlatformTerminalRegistry implements TerminalRegistry
{
    public function across(): array
    {
        return Terminal::query()
            ->with(['tenant:id,name', 'branch:id,name'])
            // Nulls first: a terminal that has NEVER checked in is the most
            // interesting row on the screen, and `order by last_seen_at desc`
            // alone puts it at the bottom.
            ->orderByRaw('last_seen_at is null desc')
            ->orderBy('last_seen_at')
            ->get()
            ->map(static function (Terminal $terminal): array {
                $seen = $terminal->last_seen_at;

                return [
                    'id' => (int) $terminal->id,
                    'code' => (string) $terminal->code,
                    'name' => (string) $terminal->name,
                    /*
                     * The key, beside the name.
                     *
                     * The platform overview counts terminals per restaurant and
                     * had only the name to group by — which is a join on a
                     * string a customer chose, and two restaurants may pick the
                     * same one. `tenant` stays because the terminals screen
                     * prints it.
                     */
                    'tenant_id' => (int) $terminal->tenant_id,
                    'tenant' => $terminal->tenant?->name,
                    'branch' => $terminal->branch?->name,
                    'mode' => (string) $terminal->mode,
                    'status' => (string) $terminal->status,
                    'version' => $terminal->app_version,
                    'online' => $terminal->is_online,
                    'seen_minutes' => $seen === null ? null : (int) $seen->diffInMinutes(now()),
                ];
            })
            ->all();
    }
}
