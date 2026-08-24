<?php

declare(strict_types=1);

namespace Modules\Board\Http\Requests;

use App\Support\Tenancy\BranchContext;
use App\Support\Tenancy\TenantContext;
use Illuminate\Database\Query\Builder;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Modules\Board\Models\BoardBanner;

final class StoreBoardBannerRequest extends FormRequest
{
    /**
     * Route middleware (`permission:board.create`) enforces authorisation.
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

        return [
            'slug' => [
                'required', 'string', 'max:48', 'regex:/^[a-z0-9-]+$/',
                Rule::unique(BoardBanner::class, 'slug')
                    ->where(fn (Builder $query) => $query
                        ->where('tenant_id', $tenantId)
                        ->where('branch_id', $branchId)),
            ],

            /*
             * All three languages required, unlike a dish name.
             *
             * A dish reads as its own name in any language — a guest who sees
             * "Lag'mon" on a Russian menu has still been told what it is. A
             * banner is a sentence making a promise about a price, and one
             * printed only in Uzbek on a wall in a district where half the queue
             * reads Russian is an offer half the queue cannot claim.
             */
            'text' => ['required', 'array'],
            'text.uz' => ['required', 'string', 'max:120'],
            'text.ru' => ['required', 'string', 'max:120'],
            'text.en' => ['required', 'string', 'max:120'],

            'kind' => ['required', 'string', Rule::in(BoardBanner::KINDS)],

            'starts_at' => ['nullable', 'date'],
            'ends_at' => ['nullable', 'date', 'after:starts_at'],

            'is_live' => ['nullable', 'boolean'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'slug.unique' => 'Bu kalit tabloda allaqachon band.',
            'slug.regex' => "Kalit faqat kichik harf, raqam va tiredan iborat bo'lishi kerak.",
            'text.uz.required' => "Banner matni uch tilda ham yozilishi kerak (o'zbekcha).",
            'text.ru.required' => 'Banner matni uch tilda ham yozilishi kerak (ruscha).',
            'text.en.required' => 'Banner matni uch tilda ham yozilishi kerak (inglizcha).',
            'kind.in' => 'Banner turi: aksiya, yangilik yoki sodiqlik.',
            'ends_at.after' => "Tugash sanasi boshlanishidan keyin bo'lishi kerak.",
        ];
    }
}
