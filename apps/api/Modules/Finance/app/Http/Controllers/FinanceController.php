<?php

declare(strict_types=1);

namespace Modules\Finance\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Support\Tenancy\BusinessDay;
use Illuminate\Http\JsonResponse;
use Modules\Finance\Models\CashShift;
use Modules\Finance\Models\Expense;
use Modules\Finance\Models\Payment;

final class FinanceController extends Controller
{
    public function index(BusinessDay $businessDay): JsonResponse
    {
        return response()->json([
            'module' => 'Finance',
            'alias' => 'finance',
            'labels' => config('finance.labels'),
            'description' => "Kassa smenasi, to'lovlar, fiskal cheklar, xarajatlar va kunlik yopilish.",
            'enabled' => (bool) config('finance.enabled', true),
            'endpoints' => [
                'shifts' => url('/api/v1/finance/shifts'),
                'payments' => url('/api/v1/finance/payments'),
                'expenses' => url('/api/v1/finance/expenses'),
            ],
            'counts' => [
                'open_shift' => CashShift::open()->value('number'),
                'today_takings_tiyin' => (int) Payment::captured()->today()->sum('amount'),
                'today_expenses_tiyin' => (int) Expense::today()->sum('amount'),
                // Range rather than whereDate: the same trading-day window the
                // takings use, and one PostgreSQL can answer from the index.
                'today_refunds' => Payment::where('status', 'refunded')
                    ->tap(fn ($query) => $businessDay->constrain($query, 'refunded_at', $businessDay->window()))
                    ->count(),
            ],
        ]);
    }
}
