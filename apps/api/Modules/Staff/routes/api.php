<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;
use Modules\Staff\Http\Controllers\AttendanceController;
use Modules\Staff\Http\Controllers\ChecklistController;
use Modules\Staff\Http\Controllers\MyShiftController;
use Modules\Staff\Http\Controllers\OpeningChecklistController;
use Modules\Staff\Http\Controllers\PayrollController;
use Modules\Staff\Http\Controllers\ShiftController;
use Modules\Staff\Http\Controllers\ShiftSwapController;
use Modules\Staff\Http\Controllers\StaffActionController;
use Modules\Staff\Http\Controllers\StaffApprovalController;
use Modules\Staff\Http\Controllers\StaffAuthController;
use Modules\Staff\Http\Controllers\StaffController;
use Modules\Staff\Http\Controllers\StaffMemberController;
use Spatie\Permission\Middleware\PermissionMiddleware;

/*
|--------------------------------------------------------------------------
| Staff module API routes — /api/v1/staff/*
|--------------------------------------------------------------------------
*/

/*
|--------------------------------------------------------------------------
| The staff app's front door
|--------------------------------------------------------------------------
|
| One unauthenticated route and one that carries only a device token, and the
| gap between them is the whole security model: enrolling identifies a phone,
| the PIN authenticates the person holding it. Four digits are defensible only
| in that order — see StaffAuthController.
|
| Throttled at ten a minute, matching the till's pairing route. A pairing code
| is eight characters from a 32-letter alphabet, so a minute of guessing buys
| ten tries out of a trillion; the throttle is there to stop the noise, not
| the maths.
*/
Route::middleware('throttle:10,1')
    ->prefix('v1/staff')
    ->name('api.v1.staff.')
    ->group(function (): void {
        Route::post('devices/pair', [StaffAuthController::class, 'pair'])->name('devices.pair');
    });

Route::middleware(['auth:sanctum', 'tenant'])
    ->prefix('v1/staff')
    ->name('api.v1.staff.')
    ->group(function (): void {
        Route::get('/', [StaffController::class, 'index'])->name('info');

        /*
         * The PIN exchange — the app's front door, and the one route in this
         * group with no permission on it.
         *
         * It cannot have one: the caller is a phone, not a person, and the
         * whole point of the request is to find out which person is holding it.
         * `ModuleRouteGuardTest::UNGUARDED` records that with the reason.
         *
         * Inside the `tenant` group, which is not obvious and matters twice.
         * A device token carries no user, so `ResolveTenant` reads the
         * `X-Tenant` slug the pairing response handed back — the same
         * arrangement the till uses. And `public.user_pins` is behind
         * row-level security, so without a resolved tenant the policy answers
         * NO ROWS and every correct PIN comes back "not correct". Measured:
         * the route sat outside this group first and did exactly that.
         */
        Route::post('auth/pin', [StaffAuthController::class, 'pin'])
            ->middleware('throttle:20,1')->name('auth.pin');

        /*
         * The phone asking who it is, with its own device token.
         *
         * Unguarded for the same reason `auth/pin` is: the caller is a handset
         * and there is no person yet to carry a permission. It answers about
         * the calling device only — see StaffAuthController::whoami.
         */
        Route::get('devices/me', [StaffAuthController::class, 'whoami'])->name('devices.me');

        Route::get('auth/session', [StaffAuthController::class, 'session'])->name('auth.session');
        Route::delete('auth/session', [StaffAuthController::class, 'logout'])->name('auth.logout');

        /*
         * A manager enrolling somebody's phone.
         *
         * `staff.manage` rather than `staff.update`: handing out a credential
         * that signs in as another person is not the same act as correcting
         * their hourly rate, and the two should not share a permission.
         */
        Route::post('devices/code', [StaffAuthController::class, 'issueCode'])
            ->middleware(PermissionMiddleware::using('staff.manage'))->name('devices.code');

        Route::get('members', [StaffMemberController::class, 'index'])
            ->middleware(PermissionMiddleware::using('staff.view'))->name('members.index');
        Route::post('members', [StaffMemberController::class, 'store'])
            ->middleware(PermissionMiddleware::using('staff.create'))->name('members.store');
        Route::get('members/{member}', [StaffMemberController::class, 'show'])
            ->middleware(PermissionMiddleware::using('staff.view'))->name('members.show');
        Route::patch('members/{member}', [StaffMemberController::class, 'update'])
            ->middleware(PermissionMiddleware::using('staff.update'))->name('members.update');
        Route::delete('members/{member}', [StaffMemberController::class, 'destroy'])
            ->middleware(PermissionMiddleware::using('staff.delete'))->name('members.destroy');

        /*
         * The login behind a member: opened if missing, PIN rotated either way.
         *
         * `staff.manage`, the same permission as `devices/code` and for the same
         * reason — this hands out a credential that signs in as somebody else,
         * which is not the act of correcting their hourly rate.
         */
        Route::post('members/{member}/login', [StaffMemberController::class, 'login'])
            ->middleware(PermissionMiddleware::using('staff.manage'))->name('members.login');
        Route::post('members/{member}/password', [StaffMemberController::class, 'password'])
            ->middleware(PermissionMiddleware::using('staff.manage'))->name('members.password');

        /*
         * ---- The crew app's two doors ----
         *
         * Both answer about the caller and nobody else, and neither can carry a
         * useful permission: no single one is held by every crew role — a
         * waiter, a courier and a storekeeper share nothing — so guarding these
         * would either lock out the people they exist for or hand a
         * storekeeper's powers to everybody. `ModuleRouteGuardTest::UNGUARDED`
         * records both with the reason.
         *
         * `actions` is the offline queue's drain, and it does carry per-verb
         * permissions — checked inside, from a map that mirrors the owning
         * modules' routes, exactly as `SyncController` does for the till.
         */
        Route::get('me/today', [MyShiftController::class, 'today'])->name('me.today');
        Route::post('actions', [StaffActionController::class, 'store'])->name('actions.store');

        /*
         * Two more reads about the caller, and the same reason they carry no
         * permission: no single one is held by every crew role.
         *
         * `me/upcoming` is what the More menu's swap form was missing —
         * `POST shift-swaps` needs a shift id and a colleague's staff-member
         * id, and the phone had a weekday heading and a first name. It answers
         * the caller's own published shifts plus three fields per colleague at
         * the same branch; the personnel file stays behind `staff.view`.
         *
         * `checklists/{day}` reads back what this person ticked off on a
         * trading day, plus the cash they declared carrying. Both are written
         * through `POST actions` — see `StaffAction::JOURNAL_ONLY_KINDS` — so
         * this is a read of the caller's own journal and nothing wider.
         *
         * `{day}` is `today` or `YYYY-MM-DD`, constrained here rather than only
         * in the controller so a stray segment is a 404 from the router instead
         * of a request that reaches a query.
         */
        Route::get('me/upcoming', [MyShiftController::class, 'upcoming'])->name('me.upcoming');
        Route::get('checklists/{day_key}', [ChecklistController::class, 'show'])
            ->where('day_key', 'today|\d{4}-\d{2}-\d{2}')->name('checklists.show');

        /*
         * ---- The approval queue, on a phone ----
         *
         * P9 moved ANSWERING an approval off the till because a manager is
         * rarely standing at one. Asking was left behind — `POST /pos/approvals`
         * is inside `pos.session` — so a waiter with a handset had to walk to a
         * terminal to request the very thing they are holding a phone for.
         *
         * Three permissions rather than one, because they are three different
         * powers: reading the queue is `pos.view`, asking is `pos.sell` (every
         * waiter holds it, and asking is part of selling), and answering is
         * `pos.approve` — the one that makes the ledger mean anything.
         *
         * Everything goes through `App\Contracts\Pos\Approvals`: Staff may not
         * import Pos, and a deployment without a till module answers an empty
         * queue rather than failing to boot.
         */
        Route::get('approvals', [StaffApprovalController::class, 'index'])
            ->middleware(PermissionMiddleware::using('pos.view'))->name('approvals.index');
        Route::post('approvals', [StaffApprovalController::class, 'store'])
            ->middleware(PermissionMiddleware::using('pos.sell'))->name('approvals.store');
        Route::post('approvals/{approval}/decide', [StaffApprovalController::class, 'decide'])
            ->middleware(PermissionMiddleware::using('pos.approve'))->name('approvals.decide');

        Route::get('shifts', [ShiftController::class, 'index'])
            ->middleware(PermissionMiddleware::using('staff.view'))->name('shifts.index');
        Route::post('shifts', [ShiftController::class, 'store'])
            ->middleware(PermissionMiddleware::using('staff.create'))->name('shifts.store');
        Route::get('shifts/{shift}', [ShiftController::class, 'show'])
            ->middleware(PermissionMiddleware::using('staff.view'))->name('shifts.show');
        Route::patch('shifts/{shift}', [ShiftController::class, 'update'])
            ->middleware(PermissionMiddleware::using('staff.update'))->name('shifts.update');
        Route::delete('shifts/{shift}', [ShiftController::class, 'destroy'])
            ->middleware(PermissionMiddleware::using('staff.delete'))->name('shifts.destroy');

        /*
         * Handing a week over. `staff.manage` rather than `staff.update`:
         * moving one shift is a correction, promising a week is a commitment
         * everybody plans their own week around.
         */
        Route::post('shifts/publish', [ShiftController::class, 'publish'])
            ->middleware(PermissionMiddleware::using('staff.manage'))->name('shifts.publish');

        /*
         * ---- Swaps ----
         *
         * Raising one is `staff.update`; granting one is `staff.manage`.
         *
         * Today the same three roles hold both, so the split buys nothing yet.
         * It is here because the two acts are genuinely different — asking to
         * be let off Thursday is not the same as deciding who covers it — and
         * because a shift-lead role that may raise a swap without granting one
         * is the obvious next role. Recording the difference now costs a line;
         * untangling one permission into two later costs a migration and an
         * argument.
         *
         * The screen is the console's rota board, not the crew app: nothing on
         * a waiter's phone raises a swap today, which is why neither route
         * needs the unguarded treatment `me/today` and `actions` do.
         */
        /*
         * ---- The opening checklist, as the venue's own record ----
         *
         * NOT `checklists/{day_key}` above, and the difference is who is asking.
         * That one answers "what have I ticked", off the caller's own journal,
         * for a phone in somebody's hand. This is the morning list the console's
         * rota screen draws: one row per item per VENUE per day, with the name
         * of whoever ticked it beside it — a record an inspector can be shown
         * rather than a note to the person holding the tablet.
         *
         * One trading day at one venue: `/staff/opening-checklist/2026-08-22`.
         * The day is in the URL rather than assumed, because a bar that closes
         * at two in the morning finishes its list after midnight and a manager
         * checking on Friday what happened on Thursday is the ordinary case.
         *
         * `staff.view` to read and `staff.update` to tick, because ticking is a
         * claim about what somebody did this morning, recorded under their name.
         */
        Route::get('opening-checklist/{day}', [OpeningChecklistController::class, 'show'])
            ->middleware(PermissionMiddleware::using('staff.view'))->name('opening-checklist.show');
        Route::post('opening-checklist/{day}', [OpeningChecklistController::class, 'store'])
            ->middleware(PermissionMiddleware::using('staff.update'))->name('opening-checklist.store');

        Route::get('shift-swaps', [ShiftSwapController::class, 'index'])
            ->middleware(PermissionMiddleware::using('staff.view'))->name('shift-swaps.index');
        Route::post('shift-swaps', [ShiftSwapController::class, 'store'])
            ->middleware(PermissionMiddleware::using('staff.update'))->name('shift-swaps.store');
        Route::get('shift-swaps/{swap}', [ShiftSwapController::class, 'show'])
            ->middleware(PermissionMiddleware::using('staff.view'))->name('shift-swaps.show');
        Route::post('shift-swaps/{swap}/approve', [ShiftSwapController::class, 'approve'])
            ->middleware(PermissionMiddleware::using('staff.manage'))->name('shift-swaps.approve');
        Route::post('shift-swaps/{swap}/reject', [ShiftSwapController::class, 'reject'])
            ->middleware(PermissionMiddleware::using('staff.manage'))->name('shift-swaps.reject');
        // Withdrawing a request is the other half of raising one, so it
        // carries the same permission rather than the verdict's.
        Route::post('shift-swaps/{swap}/cancel', [ShiftSwapController::class, 'cancel'])
            ->middleware(PermissionMiddleware::using('staff.update'))->name('shift-swaps.cancel');

        Route::get('attendances', [AttendanceController::class, 'index'])
            ->middleware(PermissionMiddleware::using('staff.view'))->name('attendances.index');
        Route::get('attendances/{attendance}', [AttendanceController::class, 'show'])
            ->middleware(PermissionMiddleware::using('staff.view'))->name('attendances.show');

        // The two buttons on the service-entrance tablet.
        Route::post('attendance/check-in', [AttendanceController::class, 'checkIn'])
            ->middleware(PermissionMiddleware::using('staff.update'))->name('attendance.check-in');
        Route::post('attendance/check-out', [AttendanceController::class, 'checkOut'])
            ->middleware(PermissionMiddleware::using('staff.update'))->name('attendance.check-out');

        /*
         * ---- Payroll ----
         *
         * Reading is `staff.view` and everything that moves a figure is
         * `staff.manage`, which is a wider gap than the rest of this module
         * uses — the roster hands `staff.update` to anybody who may correct a
         * record. Wages are different in kind: opening a run, typing a bonus
         * into it and signing it off are all decisions about money leaving the
         * business, and on this platform `staff.manage` is held by an owner and
         * a branch manager and nobody else. A shift lead who may fix a
         * clock-out has no business setting what it pays.
         *
         * `{payrollPeriod}` rather than `{period}`: route model binding resolves
         * a parameter by matching its camelCase name to the type-hint, and the
         * model already owns the word `period` for the `YYYY-MM` column it
         * carries. Naming the parameter after the column would put two meanings
         * on one word in the one file where the difference decides which row is
         * loaded. `{purchaseOrder}` in Suppliers is the same convention.
         */
        Route::get('payroll', [PayrollController::class, 'index'])
            ->middleware(PermissionMiddleware::using('staff.view'))->name('payroll.index');
        Route::get('payroll/{payrollPeriod}', [PayrollController::class, 'show'])
            ->middleware(PermissionMiddleware::using('staff.view'))->name('payroll.show');
        Route::post('payroll', [PayrollController::class, 'store'])
            ->middleware(PermissionMiddleware::using('staff.manage'))->name('payroll.store');
        Route::patch('payroll/{payrollPeriod}/lines/{line}', [PayrollController::class, 'updateLine'])
            ->middleware(PermissionMiddleware::using('staff.manage'))->name('payroll.lines.update');
        Route::post('payroll/{payrollPeriod}/finalize', [PayrollController::class, 'finalize'])
            ->middleware(PermissionMiddleware::using('staff.manage'))->name('payroll.finalize');
    });
