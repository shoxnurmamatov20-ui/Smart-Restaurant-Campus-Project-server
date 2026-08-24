<?php

declare(strict_types=1);

namespace App\Http\Controllers\Platform;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use JsonException;

/**
 * What is deployed, read from what the deploy actually wrote.
 *
 * `srcp-deploy` leaves a `manifest.json` in every release directory under
 * `/srv/srcp/releases/`, and `/srv/srcp/current` is a symlink to whichever one
 * is live. That is the only account of a deployment that cannot drift: it is
 * written by the thing that did it.
 *
 * The alternative was a `releases` table the deploy script updates, which is a
 * second record of the same event — and the first time a deploy half-fails, the
 * table says one thing and the filesystem another.
 *
 * Empty is a valid answer. A developer's laptop has no `/srv/srcp`, and a
 * screen that says "no releases" is better than one that 500s off a missing
 * directory.
 */
final class ReleaseController extends Controller
{
    /** Where srcp-deploy keeps them. */
    private const ROOT = '/srv/srcp';

    public function __invoke(): JsonResponse
    {
        $root = (string) config('app.releases_path', self::ROOT);
        $current = @readlink($root.'/current');
        $live = $current === false ? null : basename($current);

        $releases = [];

        foreach (glob($root.'/releases/*/manifest.json') ?: [] as $path) {
            $manifest = $this->read($path);

            if ($manifest === null) {
                continue;
            }

            $name = basename(dirname($path));

            $releases[] = [
                'id' => $name,
                'version' => $manifest['version'] ?? $name,
                'commit' => $manifest['commit'] ?? null,
                'branch' => $manifest['branch'] ?? null,
                'deployed_at' => $manifest['deployed_at'] ?? null,
                'deployed_by' => $manifest['deployed_by'] ?? null,
                // Which one is actually serving. Read from the symlink rather
                // than from the newest timestamp: a rollback makes the newest
                // release the wrong answer, and a rollback is exactly when
                // somebody is looking at this screen.
                'live' => $name === $live,
            ];
        }

        usort($releases, static fn (array $a, array $b): int => strcmp((string) $b['id'], (string) $a['id']));

        return response()->json([
            'data' => $releases,
            'meta' => ['root' => $root, 'live' => $live],
        ]);
    }

    /**
     * @return array<string, mixed>|null
     */
    private function read(string $path): ?array
    {
        $raw = @file_get_contents($path);

        if ($raw === false) {
            return null;
        }

        try {
            $decoded = json_decode($raw, true, 32, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            // A manifest half-written by an interrupted deploy. Skipped rather
            // than fatal: the other releases are still readable, and that list
            // is what the operator came for.
            return null;
        }

        return is_array($decoded) ? $decoded : null;
    }
}
