<?php

declare(strict_types=1);

namespace Modules\Crm\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Modules\Crm\Models\Feedback;

final class UpdateFeedbackRequest extends FormRequest
{
    /**
     * Route middleware (`permission:crm.update`) enforces authorisation.
     */
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
            'customer_id' => ['nullable', 'integer', 'exists:customers,id'],
            'order_id' => ['nullable', 'integer', 'min:1'],
            'score' => ['sometimes', 'integer', 'min:1', 'max:5'],
            'comment' => ['nullable', 'string', 'max:2000'],
            'aspect' => ['nullable', 'string', 'max:32'],
            'source' => ['nullable', Rule::in(Feedback::SOURCES)],
            'status' => ['nullable', Rule::in(Feedback::STATUSES)],
        ];
    }
}
