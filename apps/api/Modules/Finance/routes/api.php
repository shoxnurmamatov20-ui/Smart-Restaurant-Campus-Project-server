<?php

declare(strict_types=1);

use App\Http\Middleware\ResolveBranch;
use App\Http\Middleware\ResolveTenant;
use Illuminate\Support\Facades\Route;
use Modules\Finance\Http\Controllers\AccountingPeriodController;
use Modules\Finance\Http\Controllers\CashBookController;
use Modules\Finance\Http\Controllers\CashShiftController;
use Modules\Finance\Http\Controllers\ExpenseCategoryController;
use Modules\Finance\Http\Controllers\ExpenseController;
use Modules\Finance\Http\Controllers\FinanceController;
use Modules\Finance\Http\Controllers\FiscalController;
use Modules\Finance\Http\Controllers\FixedAssetController;
use Modules\Finance\Http\Controllers\PaymentCallbackController;
use Modules\Finance\Http\Controllers\PaymentController;
use Modules\Finance\Http\Controllers\PaymentMethodController;
use Modules\Finance\Http\Controllers\PaymentProviderController;
use Modules\Finance\Http\Controllers\PublicPaymentController;
use Modules\Finance\Http\Controllers\ShiftClosingController;
use Spatie\Permission\Middleware\PermissionMiddleware;

/*
|--------------------------------------------------------------------------
| Finance module API routes — /api/v1/finance/*
|--------------------------------------------------------------------------
| Payments are never deleted, only refunded: a bill that vanishes is exactly
| the fraud pattern this module exists to make impossible.
*/

/*
|--------------------------------------------------------------------------
| Paying online — the guest, and then the bank
|--------------------------------------------------------------------------
| Three doors, none of which a signed-in person walks through.
|
| The first two are the guest's: what may I pay with, where do I pay, and did
| it work. No login — a stranger reading a restaurant's website has none — and
| tenancy is what scopes them, exactly as it scopes the public menu. Inside the
| `tenant` group, so `EnsureIdempotency` applies and the customer app has to
| mint a key; a double-tapped "pay" button on a slow phone must not open two
| invoices against one bill.
|
| Five a minute per address on `invoice`, because opening one is a write and a
| guest paying dinner needs one of them. `providers` and the status poll are
| reads a phone repeats while it waits for a bank, so they sit at thirty.
*/
Route::middleware(['tenant'])
    ->prefix('v1/public')
    ->name('api.v1.public.')
    ->group(function (): void {
        Route::get('payments/providers', [PublicPaymentController::class, 'providers'])
            ->middleware('throttle:30,1')->name('payments.providers');
        Route::post('payments/invoice', [PublicPaymentController::class, 'invoice'])
            ->middleware('throttle:5,1')->name('payments.invoice');
        Route::get('payments/{invoice}', [PublicPaymentController::class, 'show'])
            ->middleware('throttle:30,1')->name('payments.show');
    });

/*
|--------------------------------------------------------------------------
| The bank's own door
|--------------------------------------------------------------------------
| `ResolveTenant` and `ResolveBranch` spelled out instead of the `tenant`
| group, and the omission is the entire reason: the group ends with
| `EnsureIdempotency`, and a payment provider does not send our headers. It is
| not our client — it is a bank retrying until it gets a clean answer.
|
| The guarantee it needs is stronger than a header anyway, and it comes from
| the data: `OnlinePaymentLedger::settle()` locks the invoice row and returns
| the payment it already wrote, so six PerformTransaction retries produce one
| tender. Recorded in `IdempotencyCoverageTest::EXEMPT` with that reason rather
| than left to slip through the net.
|
| No `auth:sanctum` either. There is no credential a bank could present;
| authentication is per-protocol and lives in the driver — Payme's HTTP Basic
| merchant key, Click's MD5 `sign_string`. `ModuleRouteGuardTest::ANONYMOUS`
| carries the same sentence.
|
| 120 a minute: a busy Friday is nowhere near it, and a provider retrying a
| storm of callbacks after an outage must not be throttled into giving up on
| money that has already left a guest's card.
*/
Route::middleware([ResolveTenant::class, ResolveBranch::class, 'throttle:120,1'])
    ->prefix('v1/payments')
    ->name('api.v1.payments.')
    ->group(function (): void {
        Route::post('{provider}/callback', PaymentCallbackController::class)->name('callback');
    });

/*
| The console's view of the same rails — including the ones that are switched
| off, which is the difference from the guest's list. See the controller.
*/
Route::middleware(['auth:sanctum', 'tenant'])
    ->prefix('v1/payments')
    ->name('api.v1.payments.')
    ->group(function (): void {
        Route::get('providers', [PaymentProviderController::class, 'index'])
            ->middleware(PermissionMiddleware::using('finance.view'))->name('providers');
    });

Route::middleware(['auth:sanctum', 'tenant'])
    ->prefix('v1/finance')
    ->name('api.v1.finance.')
    ->group(function (): void {
        Route::get('/', [FinanceController::class, 'index'])->name('info');

        // The notes in circulation. Served rather than hardcoded in the client:
        // the tablet shipped with six of the eight and a cashier holding a
        // 20 000 note had nowhere to count it.
        Route::get('denominations', [FinanceController::class, 'denominations'])
            ->middleware(PermissionMiddleware::using('finance.view'))->name('denominations');

        // ---- Cash shifts ----
        Route::get('shifts', [CashShiftController::class, 'index'])
            ->middleware(PermissionMiddleware::using('finance.view'))->name('shifts.index');
        Route::get('shifts/{shift}', [CashShiftController::class, 'show'])
            ->middleware(PermissionMiddleware::using('finance.view'))->name('shifts.show');
        Route::post('shifts/open', [CashShiftController::class, 'open'])
            ->middleware(PermissionMiddleware::using('finance.create'))->name('shifts.open');

        /*
        |----------------------------------------------------------------------
        | Closing the day (P10)
        |----------------------------------------------------------------------
        | In the order an evening actually goes: read where the shift stands,
        | stop it selling, count the drawer, move money in or out of it, then
        | either hand the till over or shut it.
        |
        | `report` is both the X and the Z. One endpoint on purpose — they are
        | the same document read at two moments, and two endpoints would be two
        | chances for them to grow apart. That is not hypothetical: the expected
        | cash was once computed in two places and a cashier counted against one
        | figure and was held to the other.
        |
        | `unlock` is the only one that asks for `finance.manage` rather than
        | `finance.update`. A cashier who could unlock their own drawer could
        | take a payment in the middle of their own count, which is the one
        | thing the lock exists to prevent.
        */
        // The tip sheet: read at the pass while the shift is open, not only
        // at the close, so it is its own route rather than a block on the Z.
        Route::get('shifts/{shift}/tips', [ShiftClosingController::class, 'tips'])
            ->middleware(PermissionMiddleware::using('finance.view'))->name('shifts.tips');
        Route::get('shifts/{shift}/report', [ShiftClosingController::class, 'report'])
            ->middleware(PermissionMiddleware::using('finance.view'))->name('shifts.report');
        Route::post('shifts/{shift}/lock', [ShiftClosingController::class, 'lock'])
            ->middleware(PermissionMiddleware::using('finance.update'))->name('shifts.lock');
        Route::post('shifts/{shift}/unlock', [ShiftClosingController::class, 'unlock'])
            ->middleware(PermissionMiddleware::using('finance.manage'))->name('shifts.unlock');
        Route::post('shifts/{shift}/count', [ShiftClosingController::class, 'count'])
            ->middleware(PermissionMiddleware::using('finance.update'))->name('shifts.count');
        Route::post('shifts/{shift}/collection', [ShiftClosingController::class, 'collection'])
            ->middleware(PermissionMiddleware::using('finance.update'))->name('shifts.collection');
        Route::post('shifts/{shift}/cash-in', [ShiftClosingController::class, 'cashIn'])
            ->middleware(PermissionMiddleware::using('finance.update'))->name('shifts.cash-in');
        Route::post('shifts/{shift}/handover', [ShiftClosingController::class, 'handOver'])
            ->middleware(PermissionMiddleware::using('finance.update'))->name('shifts.handover');
        Route::post('shifts/{shift}/close', [ShiftClosingController::class, 'close'])
            ->middleware(PermissionMiddleware::using('finance.update'))->name('shifts.close');

        // ---- Payments ----
        Route::get('payments', [PaymentController::class, 'index'])
            ->middleware(PermissionMiddleware::using('finance.view'))->name('payments.index');
        Route::post('payments', [PaymentController::class, 'store'])
            ->middleware(PermissionMiddleware::using('finance.create'))->name('payments.store');
        Route::get('payments/{payment}', [PaymentController::class, 'show'])
            ->middleware(PermissionMiddleware::using('finance.view'))->name('payments.show');
        Route::post('payments/{payment}/refund', [PaymentController::class, 'refund'])
            ->middleware(PermissionMiddleware::using('finance.update'))->name('payments.refund');

        /*
        |----------------------------------------------------------------------
        | Fiscalisation (P11)
        |----------------------------------------------------------------------
        | A dead fiscal module never blocks a sale — which is the right rule and
        | the reason this queue needs a door. Nothing on the selling path waits
        | for soliq.uz, so when it stops answering the only thing that changes is
        | a counter nobody is looking at. These endpoints are where somebody
        | looks.
        |
        | `probe` and the two reads ask for `finance.view`: a cashier is entitled
        | to know whether tonight's meals were declared, and to find the one that
        | was not. `duplicate` is `finance.update` because it puts a stamped copy
        | of a legal document on paper. `relay` is `finance.manage` — draining
        | the queue by hand is a manager's decision about a venue that has just
        | come back online, not a button to press when a screen looks slow.
        */
        Route::get('fiscal/probe', [FiscalController::class, 'probe'])
            ->middleware(PermissionMiddleware::using('finance.view'))->name('fiscal.probe');
        Route::get('fiscal/receipts', [FiscalController::class, 'index'])
            ->middleware(PermissionMiddleware::using('finance.view'))->name('fiscal.receipts.index');
        Route::get('fiscal/receipts/{receipt}', [FiscalController::class, 'show'])
            ->middleware(PermissionMiddleware::using('finance.view'))->name('fiscal.receipts.show');
        Route::post('fiscal/receipts/{receipt}/duplicate', [FiscalController::class, 'duplicate'])
            ->middleware(PermissionMiddleware::using('finance.update'))->name('fiscal.receipts.duplicate');
        Route::post('fiscal/relay', [FiscalController::class, 'relay'])
            ->middleware(PermissionMiddleware::using('finance.manage'))->name('fiscal.relay');

        // ---- Expenses ----
        Route::get('expenses', [ExpenseController::class, 'index'])
            ->middleware(PermissionMiddleware::using('finance.view'))->name('expenses.index');
        Route::post('expenses', [ExpenseController::class, 'store'])
            ->middleware(PermissionMiddleware::using('finance.create'))->name('expenses.store');
        Route::get('expenses/{expense}', [ExpenseController::class, 'show'])
            ->middleware(PermissionMiddleware::using('finance.view'))->name('expenses.show');
        Route::patch('expenses/{expense}', [ExpenseController::class, 'update'])
            ->middleware(PermissionMiddleware::using('finance.update'))->name('expenses.update');
        Route::delete('expenses/{expense}', [ExpenseController::class, 'destroy'])
            ->middleware(PermissionMiddleware::using('finance.delete'))->name('expenses.destroy');

        /*
        |----------------------------------------------------------------------
        | The ledger's own configuration
        |----------------------------------------------------------------------
        | Which tenders this restaurant offers, and what it files money under.
        | Both read on `finance.view` and write on `finance.manage`, and the
        | asymmetry is the whole permission story: a cashier has to know what
        | buttons the till draws, and changing the acquirer's cut or archiving a
        | heading reprices a report every other screen reads.
        |
        | `{method}` and `{code}` are the tender name and the category slug
        | rather than ids. That is what lets a screen edit one of the platform's
        | own defaults — the first write materialises the row. Bound by id, the
        | screen would have to POST for some rows and PATCH for others and decide
        | which by whether a field it was handed was null.
        */
        Route::get('payment-methods', [PaymentMethodController::class, 'index'])
            ->middleware(PermissionMiddleware::using('finance.view'))->name('payment-methods.index');
        Route::post('payment-methods', [PaymentMethodController::class, 'store'])
            ->middleware(PermissionMiddleware::using('finance.manage'))->name('payment-methods.store');
        Route::patch('payment-methods/{method}', [PaymentMethodController::class, 'update'])
            ->middleware(PermissionMiddleware::using('finance.manage'))->name('payment-methods.update');
        Route::delete('payment-methods/{paymentMethod}', [PaymentMethodController::class, 'destroy'])
            ->middleware(PermissionMiddleware::using('finance.manage'))->name('payment-methods.destroy');

        Route::get('expense-categories', [ExpenseCategoryController::class, 'index'])
            ->middleware(PermissionMiddleware::using('finance.view'))->name('expense-categories.index');
        Route::post('expense-categories', [ExpenseCategoryController::class, 'store'])
            ->middleware(PermissionMiddleware::using('finance.manage'))->name('expense-categories.store');
        Route::patch('expense-categories/{code}', [ExpenseCategoryController::class, 'update'])
            ->middleware(PermissionMiddleware::using('finance.manage'))->name('expense-categories.update');
        Route::delete('expense-categories/{expenseCategory}', [ExpenseCategoryController::class, 'destroy'])
            ->middleware(PermissionMiddleware::using('finance.manage'))->name('expense-categories.destroy');

        /*
        |----------------------------------------------------------------------
        | Closing the month
        |----------------------------------------------------------------------
        | `finance.manage` on both, and `reopen` is not softer than `close`: it
        | unmakes a signature. The reason is mandatory on it for the same
        | reason the variance ladder makes a cashier type one — an amendment
        | with no explanation is indistinguishable from a mistake when it is
        | read back six months later.
        |
        | The period is a `YYYY-MM` in the path and the pattern refuses anything
        | else, so a malformed month is a 404 from the router rather than an
        | exception from a date parser.
        */
        Route::get('periods', [AccountingPeriodController::class, 'index'])
            ->middleware(PermissionMiddleware::using('finance.view'))->name('periods.index');
        Route::post('periods/{period}/close', [AccountingPeriodController::class, 'close'])
            ->middleware(PermissionMiddleware::using('finance.manage'))
            ->where('period', '[0-9]{4}-[0-9]{2}')->name('periods.close');
        Route::post('periods/{period}/reopen', [AccountingPeriodController::class, 'reopen'])
            ->middleware(PermissionMiddleware::using('finance.manage'))
            ->where('period', '[0-9]{4}-[0-9]{2}')->name('periods.reopen');

        /*
        |----------------------------------------------------------------------
        | The register, and the book
        |----------------------------------------------------------------------
        | Assets read on `finance.view` because the P&L's depreciation line comes
        | from them and an accountant has to be able to check it; they are
        | written on `finance.manage` because putting a seven-year oven on the
        | register changes every month's statement for seven years.
        |
        | The cash book reads on `finance.view` — it is the accountant's screen —
        | and its one write is `finance.manage`: moving money between the till and
        | the safe is not a cashier's decision, and `POST /pos/drawer/movements`
        | is still the door for the one that is.
        */
        Route::get('fixed-assets', [FixedAssetController::class, 'index'])
            ->middleware(PermissionMiddleware::using('finance.view'))->name('fixed-assets.index');
        Route::post('fixed-assets', [FixedAssetController::class, 'store'])
            ->middleware(PermissionMiddleware::using('finance.manage'))->name('fixed-assets.store');
        Route::get('fixed-assets/{fixedAsset}', [FixedAssetController::class, 'show'])
            ->middleware(PermissionMiddleware::using('finance.view'))->name('fixed-assets.show');
        Route::patch('fixed-assets/{fixedAsset}', [FixedAssetController::class, 'update'])
            ->middleware(PermissionMiddleware::using('finance.manage'))->name('fixed-assets.update');
        Route::delete('fixed-assets/{fixedAsset}', [FixedAssetController::class, 'destroy'])
            ->middleware(PermissionMiddleware::using('finance.manage'))->name('fixed-assets.destroy');

        Route::get('cash-book', [CashBookController::class, 'index'])
            ->middleware(PermissionMiddleware::using('finance.view'))->name('cash-book.index');
        Route::get('cash-book/accounts', [CashBookController::class, 'accounts'])
            ->middleware(PermissionMiddleware::using('finance.view'))->name('cash-book.accounts');
        Route::post('cash-book/transfers', [CashBookController::class, 'transfer'])
            ->middleware(PermissionMiddleware::using('finance.manage'))->name('cash-book.transfer');
    });
