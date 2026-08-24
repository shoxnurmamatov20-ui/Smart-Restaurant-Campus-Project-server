<?php

declare(strict_types=1);

namespace App\Http\Requests\Platform;

use Illuminate\Foundation\Http\FormRequest;

/**
 * The owner's next password — typed by the operator, or left to the generator.
 *
 * No strength rule, and that is the owner of this platform's decision rather
 * than an oversight. It has moved twice, so the history is worth keeping:
 *
 *  1. Typed passwords were refused outright — only generated ones — on the
 *     argument that an operator who can choose will reuse one weak string.
 *  2. Then allowed, behind `Password::min(12)->letters()->numbers()`.
 *  3. Now allowed with no strength rule at all, because the restaurants ring up
 *     and dictate what they want, and a console that argues with the customer
 *     about their own password is a console the operator works around — by
 *     writing it on paper, which is worse than any weak string.
 *
 * The risk is real and belongs on the record: a short password on an owner
 * account is a restaurant's whole console, till and takings behind something
 * guessable. It is not mitigated here. What mitigates it is the audit trail —
 * every issue and every read is logged with the operator who did it — and the
 * fact that this endpoint is `super-admin` only.
 *
 * **`max:72` stays, and it is not a policy.** bcrypt reads the first 72 bytes
 * and silently ignores the rest, so a longer password would be *accepted*,
 * stored, and then match on any string sharing its first 72 bytes. Refusing is
 * the honest answer; truncating quietly is not.
 *
 * Leaving it empty still generates one, and the console still offers that first.
 */
final class IssueOwnerPasswordRequest extends FormRequest
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
            'password' => ['nullable', 'string', 'max:72'],
        ];
    }

    /**
     * The one refusal left, in words rather than in Laravel's.
     *
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'password.max' => __('Parol 72 belgidan uzun bo\'lmasligi kerak.'),
        ];
    }
}
