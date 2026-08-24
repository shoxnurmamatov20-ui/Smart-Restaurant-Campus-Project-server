<?php

declare(strict_types=1);

namespace App\Http\Requests\Platform;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Why an operator needs to stand inside somebody else's restaurant.
 *
 * `required` and a floor of ten characters, and both halves are the point. A
 * reason field that accepts "x" is a reason field that contains "x" for every
 * row within a month, and the audit trail is then a list of times somebody did
 * this with no account of why. Ten characters is not a real sentence either,
 * but it is past the threshold where typing a placeholder is easier than typing
 * the truth.
 */
final class ImpersonateRequest extends FormRequest
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
            'reason' => ['required', 'string', 'min:10', 'max:500'],
            // Whose seat. Left out, the restaurant's owner is taken — which is
            // what a support call about "our console" almost always means.
            'user_id' => ['sometimes', 'integer', 'min:1'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'reason.required' => "Sabab majburiy: kim, nima uchun kirayotgani yozilmasa, jurnal ma'nosini yo'qotadi.",
            'reason.min' => 'Sababni to\'liq yozing.',
        ];
    }
}
