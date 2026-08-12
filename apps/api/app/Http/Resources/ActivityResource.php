<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\Activity;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin Activity
 */
final class ActivityResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'log_name' => $this->log_name,
            'description' => $this->description,
            'event' => $this->event,

            // What was touched. `subject_label` is the short name a human reads
            // in the list — "MenuItem #42" beats a fully qualified class name.
            'subject' => [
                'type' => $this->subject_type,
                'label' => $this->subjectLabel(),
                'id' => $this->subject_id,
                'exists' => $this->subject !== null,
            ],

            // Who did it. Null is a real answer: a queued job, a Telegram
            // webhook or a console command has no signed-in person behind it.
            'causer' => $this->causer === null ? null : [
                'id' => $this->causer->getKey(),
                'name' => $this->causer->getAttribute('name'),
                'email' => $this->causer->getAttribute('email'),
            ],

            // The before/after payload Spatie records via ->logOnlyDirty().
            'changes' => [
                'old' => $this->properties['old'] ?? null,
                'new' => $this->properties['attributes'] ?? null,
            ],

            'batch_uuid' => $this->batch_uuid,
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }

    /** `Modules\Menu\Models\MenuItem` → `MenuItem`. */
    private function subjectLabel(): ?string
    {
        if (! is_string($this->subject_type) || $this->subject_type === '') {
            return null;
        }

        $parts = explode('\\', $this->subject_type);

        return end($parts) ?: null;
    }
}
