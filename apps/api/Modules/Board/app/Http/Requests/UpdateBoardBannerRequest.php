<?php

declare(strict_types=1);

namespace Modules\Board\Http\Requests;

use App\Support\Tenancy\BranchContext;
use App\Support\Tenancy\TenantContext;
use Illuminate\Database\Query\Builder;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Modules\Board\Models\BoardBanner;

final class UpdateBoardBannerRequest extends FormRequest
{
    /**
     * Route middleware (`permission:board.update`) enforces authorisation.
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
        $tenantId = app(TenantContext::class)->id();
        $branchId = app(BranchContext::class)->id();
        $banner = $this->route('banner');

        return [
            'slug' => [
                'sometimes', 'string', 'max:48', 'regex:/^[a-z0-9-]+$/',
                Rule::unique(BoardBanner::class, 'slug')
                    ->ignore($banner instanceof BoardBanner ? $banner->id : $banner)
                    ->where(fn (Builder $query) => $query
                        ->where('tenant_id', $tenantId)
                        ->where('branch_id', $branchId)),
            ],

            // `required_with` rather than `nullable`: a banner rewritten in one
            // language and left stale in the other two is the failure the
            // three-language rule exists to prevent, and an edit is exactly when
            // it happens.
            'text' => ['sometimes', 'array'],
            'text.uz' => ['required_with:text', 'string', 'max:120'],
            'text.ru' => ['required_with:text', 'string', 'max:120'],
            'text.en' => ['required_with:text', 'string', 'max:120'],

            'kind' => ['sometimes', 'string', Rule::in(BoardBanner::KINDS)],

            'starts_at' => ['sometimes', 'nullable', 'date'],
            'ends_at' => ['sometimes', 'nullable', 'date', 'after:starts_at'],

            'is_live' => ['sometimes', 'boolean'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'slug.unique' => 'Bu kalit tabloda allaqachon band.',
            'kind.in' => 'Banner turi: aksiya, yangilik yoki sodiqlik.',
            'ends_at.after' => "Tugash sanasi boshlanishidan keyin bo'lishi kerak.",
        ];
    }
}
