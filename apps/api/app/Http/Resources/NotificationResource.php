<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\ConsoleNotification;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * One row of the console's bell.
 *
 * @mixin ConsoleNotification
 */
final class NotificationResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        /*
         * The venue's own clock, not the server's and not the reader's.
         *
         * "14:20" on a notice about Termiz means twenty past two in Termiz. A
         * console open in Tashkent that rendered it in its own zone would put
         * the evening's variance on the wrong side of midnight for the venues
         * that are not in the capital — and the tray shows no date, so there is
         * nothing on the row to correct the impression.
         */
        // `?->` would be redundant beside `??`: the coalesce already
        // suppresses the read when there is no venue on the row.
        $zone = $this->branch->timezone ?? (string) config('app.timezone');
        $at = $this->created_at?->copy()->setTimezone($zone);

        return [
            'id' => $this->id,
            'key' => $this->key,
            'level' => $this->level,
            'href' => $this->text('href'),
            /*
             * This row's own sentences, in the reader's language.
             *
             * The catalogue behind `key` says what KIND of thing happened; only
             * the row knows that this variance was minus thirty-two thousand on
             * shift 41. Null when a notification wrote none, and the console
             * falls back to the catalogue rather than drawing a blank line.
             */
            'title' => $this->sentence('title'),
            'body' => $this->sentence('body'),
            'branch_id' => $this->branch_id,
            // A venue's name is a proper noun and is not translated. Null is the
            // whole business, which the console draws as the head office.
            'place' => $this->branch?->name,
            'at' => $at?->toIso8601String(),
            'time' => $at?->format('H:i'),
            'read_at' => $this->read_at?->toIso8601String(),
        ];
    }

    /**
     * A `{uz, ru, en}` value from the payload, in the language this request is
     * being answered in.
     *
     * Falls through to whichever language is present rather than returning
     * nothing: a notice written before a translation existed should still be
     * legible, exactly as `translate()` does for every jsonb name column.
     */
    private function sentence(string $field): ?string
    {
        $value = $this->data[$field] ?? null;

        if (is_string($value)) {
            return $value === '' ? null : $value;
        }

        if (! is_array($value)) {
            return null;
        }

        foreach ([app()->getLocale(), 'uz', 'ru', 'en'] as $locale) {
            $text = $value[$locale] ?? null;

            if (is_string($text) && $text !== '') {
                return $text;
            }
        }

        return null;
    }

    private function text(string $field): ?string
    {
        $value = $this->data[$field] ?? null;

        return is_string($value) && $value !== '' ? $value : null;
    }
}
