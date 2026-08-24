<?php

declare(strict_types=1);

namespace App\Http\Requests\Platform;

use App\Models\PlatformIssue;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** Acknowledge one, close one, or hand it to somebody. */
final class UpdateIssueRequest extends FormRequest
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
            'status' => ['sometimes', 'string', Rule::in(PlatformIssue::STATUSES)],
            'severity' => ['sometimes', 'string', Rule::in(PlatformIssue::SEVERITIES)],
            'assigned_to_user_id' => ['sometimes', 'nullable', 'integer', Rule::exists('users', 'id')],
            'body' => ['sometimes', 'nullable', 'string', 'max:5000'],
        ];
    }
}
