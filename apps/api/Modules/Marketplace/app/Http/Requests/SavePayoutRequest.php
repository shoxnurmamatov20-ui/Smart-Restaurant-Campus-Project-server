<?php

declare(strict_types=1);

namespace Modules\Marketplace\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Where a week's takings are sent.
 *
 * ---------------------------------------------------------------------------
 * There is no card number here and there never will be
 *
 * A weekly payout goes to a business account. A card PAN in this request would
 * put the whole platform inside PCI scope for a field nobody needs, and a
 * merchant typing one into a settings form is a merchant who has been invited
 * to. The absence is the feature; `Store::savePayout()` writes only these five.
 *
 * ---------------------------------------------------------------------------
 * The shapes are Uzbek and the rules say so
 *
 *   MFO      five digits — the bank's branch code.
 *   account  twenty digits — the National Bank's account format.
 *   INN/STIR nine digits — the tax number the statement is issued against.
 *
 * Checked as digits and lengths rather than against a bank directory, because
 * this platform has no directory and a validation rule that pretends to verify
 * an account is worse than one that admits it cannot: the real check is a human
 * in the platform console (`payout_state`), which is what the merchant screen
 * warns about before the save.
 */
final class SavePayoutRequest extends FormRequest
{
    /** Route middleware (`permission:marketplace.manage`) enforces authorisation. */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, list<ValidationRule|string>>
     */
    public function rules(): array
    {
        return [
            'bank_name' => ['required', 'string', 'max:160'],
            'mfo' => ['required', 'string', 'digits:5'],
            'account' => ['required', 'string', 'digits:20'],
            'inn' => ['required', 'string', 'digits:9'],
            'holder' => ['required', 'string', 'max:160'],
        ];
    }

    /**
     * Digits a person typed with spaces in them.
     *
     * A 20-digit account is unreadable without grouping, so every merchant
     * types it grouped and every form would then refuse it. Stripping here
     * rather than in the controller means the stored value is canonical
     * wherever it came from.
     */
    protected function prepareForValidation(): void
    {
        foreach (['mfo', 'account', 'inn'] as $field) {
            if ($this->has($field) && is_string($this->input($field))) {
                $this->merge([$field => preg_replace('/\D/', '', (string) $this->input($field))]);
            }
        }
    }
}
