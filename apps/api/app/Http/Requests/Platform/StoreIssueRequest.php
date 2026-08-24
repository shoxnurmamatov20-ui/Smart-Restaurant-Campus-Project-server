<?php

declare(strict_types=1);

namespace App\Http\Requests\Platform;

use App\Models\PlatformIssue;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** Something for the operator to answer for. */
final class StoreIssueRequest extends FormRequest
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
            // Nullable: some problems are the platform's own — a queue backing
            // up, a Reverb node down — and belong to no restaurant.
            'tenant_id' => ['nullable', 'integer', Rule::exists('tenants', 'id')],
            'title' => ['required', 'string', 'max:200'],
            'body' => ['nullable', 'string', 'max:5000'],
            'severity' => ['sometimes', 'string', Rule::in(PlatformIssue::SEVERITIES)],
            'source' => ['sometimes', 'string', 'max:32'],
        ];
    }
}
