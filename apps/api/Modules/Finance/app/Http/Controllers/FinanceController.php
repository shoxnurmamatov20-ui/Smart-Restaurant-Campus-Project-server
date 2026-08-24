<?php

declare(strict_types=1);

namespace Modules\Finance\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Support\Finance\CashRounding;
use App\Support\Tenancy\BusinessDay;
use Illuminate\Http\JsonResponse;
use Modules\Finance\Models\CashShift;
use Modules\Finance\Models\Expense;
use Modules\Finance\Models\Payment;
use Modules\Finance\Support\CashDenominations;

final class FinanceController extends Controller
{
    /**
     * The notes a cashier can actually hold, largest first, in tiyin.
     *
     * Served rather than hardcoded in the client, and this is not ceremony: the
     * tablet's opening screen shipped with six of Uzbekistan's eight notes, so a
     * cashier holding 20 000 and 2 000 so'm notes had nowhere to count them. The
     * total came out short, and a short float is a short drawer all evening.
     *
     * It is also the list the server validates against, so a client reading it
     * from here cannot offer a row the server will refuse.
     */
    public function denominations(): JsonResponse
    {
        return response()->json([
            'data' => [
                'currency' => 'UZS',
                // 1 so'm = 100 tiyin. Sent so a client formats without knowing it.
                'tiyin_per_unit' => 100,
                'denominations' => CashDenominations::ladder(),
                // What cash is rounded to, so the count screen and the payment
                // screen cannot disagree about which notes matter.
                'rounding_step' => CashRounding::STEP_TIYIN,
            ],
        ]);
    }

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
                'denominations' => url('/api/v1/finance/denominations'),
                // The connection test, not the receipt list: a client booting
                // against this manifest wants to know whether the tax module is
                // configured before it offers anybody a fiscal screen.
                'fiscal' => url('/api/v1/finance/fiscal/probe'),
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
