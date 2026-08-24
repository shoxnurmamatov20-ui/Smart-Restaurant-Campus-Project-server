<?php

declare(strict_types=1);

namespace Modules\Marketplace\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Stars, and optionally why.
 *
 * One to five, integer. The comment is capped short on purpose: this is the row
 * of stars on an order card, not a review form, and a field that accepts two
 * thousand characters is a field somebody will paste a complaint into instead of
 * opening a dispute — where it would be read.
 */
final class RateMarketOrderRequest extends FormRequest
{
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
            'rating' => ['required', 'integer', 'min:1', 'max:5'],
            'comment' => ['nullable', 'string', 'max:500'],
        ];
    }
}
