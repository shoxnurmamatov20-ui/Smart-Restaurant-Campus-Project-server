<?php

declare(strict_types=1);

namespace Modules\Board\Http\Requests;

use App\Support\Tenancy\BranchContext;
use App\Support\Tenancy\TenantContext;
use Illuminate\Database\Query\Builder;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;
use Modules\Board\Models\BoardScreen;

final class StoreBoardScreenRequest extends FormRequest
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
                Rule::unique(BoardScreen::class, 'slug')
                    ->where(fn (Builder $query) => $query
                        ->where('tenant_id', $tenantId)
                        ->where('branch_id', $branchId)),
            ],

            'name' => ['required', 'array'],
            'name.uz' => ['required', 'string', 'max:120'],
            'name.ru' => ['nullable', 'string', 'max:120'],
            'name.en' => ['nullable', 'string', 'max:120'],

            /*
             * Two to five minutes is not a rotation, it is a still image with a
             * timer; under three seconds nobody standing in a queue can read a
             * column of prices before it moves. The ceiling is the practical
             * one — a screen holding longer than five minutes should be the only
             * screen, which is what a playlist of one already is.
             */
            'seconds' => ['nullable', 'integer', 'min:3', 'max:300'],

            'window_start' => ['nullable', 'date_format:H:i'],
            'window_end' => ['nullable', 'date_format:H:i', 'after:window_start'],

            'is_active' => ['nullable', 'boolean'],
            'position' => ['nullable', 'integer', 'min:0', 'max:65535'],
        ];
    }

    /**
     * Rotating or scheduled, never both and never neither.
     *
     * The check constraint in the database says the same thing and is the one
     * that cannot be bypassed; this is here so a manager gets a sentence in
     * their own language instead of a 500 from PostgreSQL, and so the field the
     * console highlights is the one they filled in wrong.
     *
     * @return array<int, callable>
     */
    public function after(): array
    {
        return [
            function (Validator $validator): void {
                $rotates = $this->filled('seconds');
                $scheduled = $this->filled('window_start') || $this->filled('window_end');

                if ($rotates && $scheduled) {
                    $validator->errors()->add(
                        'seconds',
                        "Ekran yo navbat bilan almashadi, yo jadval bo'yicha ko'rinadi — ikkalasi birga emas.",
                    );

                    return;
                }

                if (! $rotates && ! $scheduled) {
                    $validator->errors()->add(
                        'seconds',
                        "Soniya yoki vaqt oynasi ko'rsatilishi shart.",
                    );

                    return;
                }

                // A window needs both ends. One of them is a screen that comes on
                // at eight and never goes off, which is not what anybody drew.
                if ($scheduled && ! ($this->filled('window_start') && $this->filled('window_end'))) {
                    $validator->errors()->add(
                        'window_end',
                        'Vaqt oynasining ikkala chekkasi ham kerak.',
                    );
                }
            },
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
            'name.uz.required' => "Ekran nomi (o'zbekcha) majburiy.",
            'seconds.min' => "Uch soniyadan qisqa ekranni navbatdagi odam o'qib ulgurmaydi.",
            'window_end.after' => "Oynaning oxiri boshidan keyin bo'lishi kerak.",
        ];
    }
}
