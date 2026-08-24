<?php

declare(strict_types=1);

namespace Modules\Finance\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Shutting a month, or opening one back up.
 *
 * A note and nothing else. Everything a close decides — which days it covers,
 * what the month came to — is derived by the server, because a client that could
 * send the figures could sign off a month against numbers of its own.
 *
 * On a reopen the note stops being optional. Reopening is the rarest act in this
 * module and the only one that unmakes a signature; six months later the
 * question is not that it happened but why, and a reason nobody was made to type
 * is a reason nobody wrote.
 */
final class CloseAccountingPeriodRequest extends FormRequest
{
    /** Route middleware (`permission:finance.manage`) enforces authorisation. */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        $reopening = $this->routeIs('api.v1.finance.periods.reopen');

        return [
            'note' => [$reopening ? 'required' : 'nullable', 'string', 'max:255'],
        ];
    }
}
