<?php

declare(strict_types=1);

namespace Modules\Crm\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Modules\Crm\Models\Campaign;

/**
 * Editing a campaign that has not left the building.
 *
 * The controller refuses the edit outright once the status is `sending` or
 * `sent`; this only shapes what may be written. Both belts, because "may I
 * change this" is a state question and "is 640 a number" is a field question,
 * and answering the first one here would put the ladder's rules in a form
 * request where nothing else can read them.
 */
final class UpdateCampaignRequest extends FormRequest
{
    /** Route middleware (`permission:crm.update`) enforces authorisation. */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        return [
            'name' => ['sometimes', 'string', 'max:160'],
            'body' => ['sometimes', 'string', 'min:2', 'max:640'],
            'segment' => ['sometimes', Rule::in(Campaign::SEGMENTS)],
            'status' => ['sometimes', Rule::in(['draft', 'scheduled'])],
            'scheduled_for' => ['nullable', 'date'],
            'promo_code_id' => ['nullable', 'integer', 'exists:promo_codes,id'],
        ];
    }
}
