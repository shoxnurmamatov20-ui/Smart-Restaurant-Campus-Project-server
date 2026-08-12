<?php

declare(strict_types=1);

namespace Modules\Crm\Http\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Modules\Crm\Models\Customer;
use Modules\Crm\Models\Feedback;

final class CrmController extends Controller
{
    public function index(): JsonResponse
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
            ],
            'counts' => [
                'customers' => Customer::active()->count(),
                'birthdays_today' => Customer::active()->birthdayToday()->count(),
                'feedback_unresolved' => Feedback::unresolved()->count(),
                'feedback_urgent' => Feedback::unresolved()->where('is_urgent', true)->count(),
            ],
        ]);
    }
}
