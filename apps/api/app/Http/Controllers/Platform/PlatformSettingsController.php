<?php

declare(strict_types=1);

namespace App\Http\Controllers\Platform;

use App\Http\Controllers\Controller;
use App\Http\Requests\Platform\UpdatePlatformSettingsRequest;
use App\Models\PlatformSetting;
use Illuminate\Http\JsonResponse;

/**
 * The four switches the operator owns.
 *
 * `signups` closes the front door, `trialDays` sets what a new restaurant gets,
 * `impersonation` decides whether anybody may stand inside a customer's account
 * at all, and `maintenance` is flipped during an incident.
 *
 * A table rather than config, because the last one has to change while the
 * process is running — a config file would need a deploy to say the platform is
 * down, which is the one moment a deploy is a bad idea.
 */
final class PlatformSettingsController extends Controller
{
    public function index(): JsonResponse
    {
        $stored = PlatformSetting::query()->pluck('value', 'key');

        $rows = [];

        foreach (PlatformSetting::KINDS as $key => $kind) {
            $rows[] = [
                'key' => $key,
                'kind' => $kind,
                // `boolean|number`, and it stays that way: the column is jsonb,
                // so a false does not come back as the string "false" and turn
                // a switch permanently on.
                'value' => $stored[$key] ?? ($kind === 'toggle' ? false : 0),
            ];
        }

        return response()->json(['data' => $rows]);
    }

    public function update(UpdatePlatformSettingsRequest $request): JsonResponse
    {
        foreach ($request->validated() as $key => $value) {
            PlatformSetting::query()->updateOrCreate(['key' => $key], ['value' => $value]);
        }

        activity('platform.settings')
            ->causedBy($request->user())
            ->withProperties($request->validated())
            ->log('platform.settings.updated');

        return $this->index();
    }
}
