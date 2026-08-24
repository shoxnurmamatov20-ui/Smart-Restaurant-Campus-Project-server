<?php

declare(strict_types=1);

namespace App\Http\Requests\Platform;

use Illuminate\Foundation\Http\FormRequest;

/**
 * The four switches, each with the type the console draws.
 *
 * `boolean` and `integer` rather than a loose `present`: the column is jsonb, so
 * whatever arrives is stored verbatim, and the string "false" is truthy in every
 * language that will read it back.
 */
final class UpdatePlatformSettingsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'signups' => ['sometimes', 'boolean'],
            // Zero is a real answer — a platform that sells with no trial —
            // and a year is the ceiling on "trial" still meaning anything.
            'trialDays' => ['sometimes', 'integer', 'min:0', 'max:365'],
            'impersonation' => ['sometimes', 'boolean'],
            'maintenance' => ['sometimes', 'boolean'],
        ];
    }
}
