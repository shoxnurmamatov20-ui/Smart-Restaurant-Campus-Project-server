<?php

declare(strict_types=1);

namespace Modules\Crm\Http\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Modules\Crm\Models\Customer;
use Modules\Crm\Models\Feedback;
use Modules\Crm\Services\EloquentGuestAccounts;

final class CrmController extends Controller
{
    public function index(EloquentGuestAccounts $accounts): JsonResponse
    {
        return response()->json([
            'module' => 'Crm',
            'alias' => 'crm',
            'labels' => config('crm.labels'),
            'description' => 'Mijozlar bazasi, bonus dasturi, promo-aksiyalar va fikr-mulohaza.',
            'enabled' => (bool) config('crm.enabled', true),
            'endpoints' => [
                'customers' => url('/api/v1/crm/customers'),
                'loyalty' => url('/api/v1/crm/loyalty'),
                'feedbacks' => url('/api/v1/crm/feedbacks'),
                'accounts' => url('/api/v1/crm/accounts'),
            ],
            'counts' => [
                'customers' => Customer::active()->count(),
                'birthdays_today' => Customer::active()->birthdayToday()->count(),
                'feedback_unresolved' => Feedback::unresolved()->count(),
                'feedback_urgent' => Feedback::unresolved()->where('is_urgent', true)->count(),
                'accounts_in_debt' => Customer::query()->inDebt()->count(),
            ],
            /*
             * Tiyin, and beside the counts rather than inside them: it is money,
             * not a number of rows, and a card that renders every `counts` value
             * the same way would print 34 000 000 next to "3 guests".
             *
             * The figure an accountant used to keep in a spreadsheet. Putting it on
             * the module card is the point of P13 — the moment it disagrees with the
             * spreadsheet, one of them is wrong and this one has a ledger behind it.
             */
            'outstanding_total' => $accounts->outstandingTotal(),
        ]);
    }
}
