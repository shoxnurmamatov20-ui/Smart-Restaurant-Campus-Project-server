<?php

declare(strict_types=1);

namespace Modules\Crm\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Modules\Crm\Models\Campaign;

/**
 * A campaign somebody is about to pay for.
 *
 * `body` is capped at 640 characters, which is four SMS parts. Not a storage
 * limit — the column is text — but a spending one: the composer prices the body
 * while it is typed and a marketer who pastes a paragraph is a marketer about to
 * send an eight-part message to two thousand people. Four parts is the outside
 * edge of a message anybody reads on a phone.
 */
final class StoreCampaignRequest extends FormRequest
{
    /** Route middleware (`permission:crm.create`) enforces authorisation. */
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
            'name' => ['required', 'string', 'max:160'],
            'body' => ['required', 'string', 'min:2', 'max:640'],
            'segment' => ['nullable', Rule::in(Campaign::SEGMENTS)],
            /*
             * Only the two states a campaign may be CREATED in. `sending` and
             * `sent` are reached by pressing send, never by asking for them —
             * a campaign that could be posted as `sent` is a recipient list
             * nobody can reconstruct.
             */
            'status' => ['nullable', Rule::in(['draft', 'scheduled'])],
            // Not in the past: a scheduled send whose moment has gone would be
            // dispatched by the next sweep, which is not what "schedule" means.
            'scheduled_for' => ['nullable', 'date', 'after:now'],
            'promo_code_id' => ['nullable', 'integer', 'exists:promo_codes,id'],
        ];
    }
}
