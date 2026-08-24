<?php

declare(strict_types=1);

namespace App\Http\Controllers\Platform;

use App\Contracts\Pos\TerminalRegistry;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;

/**
 * Every till on the platform, silence first.
 *
 * Read through a contract rather than by importing `Modules\Pos` — core never
 * depends on a module. See App\Contracts\Pos\TerminalRegistry.
 */
final class DeviceController extends Controller
{
    public function __construct(private readonly TerminalRegistry $registry) {}

    public function __invoke(): JsonResponse
    {
        $devices = $this->registry->across();

        /*
         * The version every terminal should be on, as data rather than as a
         * constant in the console.
         *
         * The screen colours a row amber when it is behind, and hardcoding the
         * comparison in TypeScript means a release turns every till amber until
         * somebody remembers to edit a file. The highest version anybody is
         * actually running is the honest answer to "what is current".
         */
        $versions = array_values(array_filter(array_column($devices, 'version')));
        usort($versions, 'version_compare');

        return response()->json([
            'data' => $devices,
            'meta' => [
                'current_version' => $versions === [] ? null : end($versions),
                'online' => count(array_filter($devices, static fn (array $d): bool => $d['online'])),
                'total' => count($devices),
            ],
        ]);
    }
}
