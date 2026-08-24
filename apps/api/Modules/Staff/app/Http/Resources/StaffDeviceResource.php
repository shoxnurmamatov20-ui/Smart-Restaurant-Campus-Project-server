<?php

declare(strict_types=1);

namespace Modules\Staff\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Modules\Staff\Models\StaffDevice;

/**
 * An enrolled phone, as a manager's list and a sign-in screen read it.
 *
 * @mixin StaffDevice
 */
final class StaffDeviceResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'label' => $this->label,
            /*
             * Which branch this phone was enrolled against.
             *
             * The sign-in screen prints it above the keypad, and it is the one
             * thing a person can check before typing: a waiter who has walked
             * into the wrong branch's back office sees it there rather than
             * after their PIN is refused.
             */
            'branch_code' => $this->branch_code,
            'status' => $this->status,
            'is_paired' => $this->is_paired,
            'paired_at' => $this->paired_at?->toIso8601String(),
            'last_seen_at' => $this->last_seen_at?->toIso8601String(),
            'app_version' => $this->app_version,
            /*
             * The person, by name only.
             *
             * A device list is read by a manager who already knows the roster;
             * a role or a phone number here would be a second copy of a fact the
             * staff screen owns, and the two would drift.
             */
            'employee' => $this->whenLoaded('user', fn (): array => [
                'id' => $this->user->getKey(),
                'name' => $this->user->name,
            ]),
        ];
    }
}
