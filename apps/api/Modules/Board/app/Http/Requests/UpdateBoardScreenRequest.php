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

final class UpdateBoardScreenRequest extends FormRequest
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

        return [
            'slug' => [
                'sometimes', 'string', 'max:48', 'regex:/^[a-z0-9-]+$/',
                Rule::unique(BoardScreen::class, 'slug')
                    ->ignore($this->screen()?->id)
                    ->where(fn (Builder $query) => $query
                        ->where('tenant_id', $tenantId)
                        ->where('branch_id', $branchId)),
            ],

            'name' => ['sometimes', 'array'],
            'name.uz' => ['required_with:name', 'string', 'max:120'],
            'name.ru' => ['nullable', 'string', 'max:120'],
            'name.en' => ['nullable', 'string', 'max:120'],

            'seconds' => ['sometimes', 'nullable', 'integer', 'min:3', 'max:300'],
            'window_start' => ['sometimes', 'nullable', 'date_format:H:i'],
            'window_end' => ['sometimes', 'nullable', 'date_format:H:i'],

            'is_active' => ['sometimes', 'boolean'],
            'position' => ['sometimes', 'integer', 'min:0', 'max:65535'],
        ];
    }

    /**
     * The either/or, checked against what the row would become.
     *
     * A PATCH is a partial body, so the invariant cannot be read off the input
     * alone: sending `window_start` on a screen that already has `seconds`
     * produces a row that is both, and the database refuses it with a
     * constraint violation — a 500 where the manager deserves a sentence. So
     * the current row and the patch are merged first and the result is what is
     * judged.
     *
     * Turning a rotating screen into a scheduled one therefore means sending
     * `seconds: null` alongside the window, which is the honest shape: it is a
     * change of kind, not an edit to a field.
     *
     * @return array<int, callable>
     */
    public function after(): array
    {
        return [
            function (Validator $validator): void {
                $screen = $this->screen();

                if ($screen === null) {
                    return;
                }

                $seconds = $this->has('seconds') ? $this->input('seconds') : $screen->seconds;
                $start = $this->has('window_start') ? $this->input('window_start') : $screen->window_start;
                $end = $this->has('window_end') ? $this->input('window_end') : $screen->window_end;

                $rotates = $seconds !== null && $seconds !== '';
                $scheduled = ($start !== null && $start !== '') || ($end !== null && $end !== '');

                if ($rotates && $scheduled) {
                    $validator->errors()->add(
                        'seconds',
                        "Ekran yo navbat bilan almashadi, yo jadval bo'yicha ko'rinadi — ikkalasi birga emas.",
                    );

                    return;
                }

                if (! $rotates && ! $scheduled) {
                    $validator->errors()->add('seconds', "Soniya yoki vaqt oynasi ko'rsatilishi shart.");

                    return;
                }

                if ($scheduled) {
                    if ($start === null || $start === '' || $end === null || $end === '') {
                        $validator->errors()->add('window_end', 'Vaqt oynasining ikkala chekkasi ham kerak.');

                        return;
                    }

                    // Compared as `HH:MM` strings, which sort correctly because
                    // both are zero-padded — the format rule above guarantees it.
                    if (substr((string) $end, 0, 5) <= substr((string) $start, 0, 5)) {
                        $validator->errors()->add('window_end', "Oynaning oxiri boshidan keyin bo'lishi kerak.");
                    }
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
            'seconds.min' => "Uch soniyadan qisqa ekranni navbatdagi odam o'qib ulgurmaydi.",
        ];
    }

    private function screen(): ?BoardScreen
    {
        $screen = $this->route('screen');

        return $screen instanceof BoardScreen ? $screen : null;
    }
}
