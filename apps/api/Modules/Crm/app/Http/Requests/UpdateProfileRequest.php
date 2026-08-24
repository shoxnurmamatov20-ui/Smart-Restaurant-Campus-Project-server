<?php

declare(strict_types=1);

namespace Modules\Crm\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * The two things a guest may change about themselves.
 *
 * Their name and the language we write to them in — and that is the whole list.
 * The phone is their identity and changing it would be signing in as somebody
 * else; `points`, `tier` and `total_spent` are the ledger's, and a client that
 * can write its own balance can write any balance.
 */
final class UpdateProfileRequest extends FormRequest
{
    /** The customer token is the authorisation; see RequireCustomerToken. */
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
            'name' => ['sometimes', 'string', 'min:2', 'max:120'],
            'locale' => ['sometimes', 'string', 'in:uz,ru,en'],
        ];
    }
}
